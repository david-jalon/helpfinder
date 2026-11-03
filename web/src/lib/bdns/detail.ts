import type { GrantDetail, GrantItem } from "@/lib/domain/grants";
import { createTtlCache } from "@/lib/domain/ttl-cache";
import { incrementMetric } from "@/lib/observability/metrics";
import { bdnsFetch } from "./http";
import { buildInfosubvencionesConvocatoriaUrl, getBdnsApiBase } from "./urls";

/**
 * Convierte una fecha ISO (YYYY-MM-DD) que devuelve BDNS al formato
 * DD/MM/YYYY que usa el resto de la app. Devuelve null si no es válida.
 */
export function toAppDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/**
 * Normaliza un `textInicio`/`textFin` de BDNS. Puede ser:
 *  - una fecha `DD/MM/YYYY` → se devuelve como fecha.
 *  - un texto referencial (ej. "DÍA SIGUIENTE DE SU PUBLICACIÓN") → se conserva como texto.
 */
export function parseTextAsDateOrText(value: unknown): {
  date: string | null;
  text: string | null;
} {
  if (typeof value !== "string") return { date: null, text: null };
  const trimmed = value.trim();
  if (!trimmed) return { date: null, text: null };
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return { date: trimmed, text: null };
  }
  return { date: null, text: trimmed };
}

/**
 * Resuelve inicio (o fin) del periodo de solicitud con esta prioridad:
 *  1. `fechaInicioSolicitud`/`fechaFinSolicitud` (ISO YYYY-MM-DD) → fecha real.
 *  2. `textInicio`/`textFin` si es `DD/MM/YYYY` → fecha real.
 *  3. `textInicio`/`textFin` si es referencial → texto.
 */
export function resolveBound(
  iso: unknown,
  text: unknown
): { date: string | null; text: string | null } {
  if (typeof iso === "string") {
    const date = toAppDate(iso);
    if (date) return { date, text: null };
  }
  return parseTextAsDateOrText(text);
}

function extractApplicationDates(obj: Record<string, unknown>): {
  applicationStartDate: string | null;
  applicationEndDate: string | null;
  applicationStartText: string | null;
  applicationEndText: string | null;
  openEnded: boolean;
} {
  const openEnded = obj.abierto === true;

  const start = resolveBound(obj.fechaInicioSolicitud, obj.textInicio);
  const end = openEnded
    ? { date: null, text: null }
    : resolveBound(obj.fechaFinSolicitud, obj.textFin);

  return {
    applicationStartDate: start.date,
    applicationEndDate: end.date,
    applicationStartText: start.text,
    applicationEndText: end.text,
    openEnded,
  };
}

/**
 * Normaliza el presupuesto total de una convocatoria (BDNS «presupuestoTotal»).
 * - Número → se conserva.
 * - String en formato español ("1.500,50") → se convierte a número.
 * - Cualquier otra cosa o vacío → null.
 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/\.(?=\d{3})/g, "") // separador de miles «.»
    .replace(",", ".");           // separador decimal «,»

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function rawToGrantDetail(raw: unknown, requestedNumConv: string): GrantDetail {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const numeroConvocatoria =
    typeof obj.numeroConvocatoria === "string" ? obj.numeroConvocatoria : requestedNumConv;

  const sourceUrl = numeroConvocatoria
    ? buildInfosubvencionesConvocatoriaUrl(numeroConvocatoria)
    : null;

  const amount = parseAmount(obj.presupuestoTotal);
  const beneficiaryTypes = extractStrings(obj.tiposBeneficiarios);

  return {
    id: String(numeroConvocatoria ?? obj.id ?? "unknown"),
    title: typeof obj.descripcion === "string" ? obj.descripcion : "Sin título",
    organization: readOrganization(obj),
    publicationDate:
      typeof obj.fechaRecepcion === "string" ? obj.fechaRecepcion : null,
    description: typeof obj.descripcion === "string" ? obj.descripcion : null,
    sourceUrl,
    ...(amount !== null && { amount }),
    ...(beneficiaryTypes.length > 0 && { beneficiaryTypes }),
    ...extractApplicationDates(obj),
  };
}

/**
 * Organismo convocante. El listado de BDNS trae `nivel2` en la raíz, pero el
 * DETALLE lo devuelve anidado en `organo.nivel2`. Se aceptan ambas formas.
 */
export function readOrganization(obj: Record<string, unknown>): string | null {
  if (typeof obj.nivel2 === "string" && obj.nivel2.trim()) {
    return obj.nivel2.trim();
  }

  const organo = obj.organo;
  if (organo && typeof organo === "object") {
    const nivel2 = (organo as Record<string, unknown>).nivel2;
    if (typeof nivel2 === "string" && nivel2.trim()) return nivel2.trim();
  }

  return null;
}

export type FetchGrantDetailResult =
  | { ok: true; data: GrantDetail }
  | { ok: false; status: number; message: string };

/**
 * Caché de detalles de convocatoria. El modal y el lote del dashboard piden
 * la misma ayuda varias veces; sin caché cada apertura golpea BDNS.
 * Solo se guardan los aciertos: un fallo se reintenta.
 */
const DEFAULT_DETAIL_TIMEOUT_MS = 8_000;

function getDetailTimeoutMs(): number {
  const raw = Number(
    process.env.BDNS_DETAIL_TIMEOUT_MS ?? String(DEFAULT_DETAIL_TIMEOUT_MS)
  );
  if (!Number.isFinite(raw) || raw < 1_000) return DEFAULT_DETAIL_TIMEOUT_MS;
  return Math.min(Math.floor(raw), 20_000);
}

/** Solo para tests: vacía la caché de detalles. */
export function clearGrantDetailCache(): void {
  detailCache.clear();
}

/**
 * Detalle de convocatoria vía API BDNS (`/convocatorias?numConv=&vpd=GE`).
 *
 * - Caché TTL en memoria (por defecto 300 s) para no repetir la misma
 *   llamada al abrir el modal o al pedir detalles en lote.
 * - Timeout propio (por defecto 8 s): el modal no debe esperar los 12 s
 *   genéricos más reintentos.
 */
export async function fetchGrantDetailByNumConv(
  numConv: string,
  options: { skipCache?: boolean } = {}
): Promise<FetchGrantDetailResult> {
  if (!options.skipCache) {
    const cached = detailCache.get(numConv);
    if (cached) return { ok: true, data: cached };
  }

  const url = new URL(`${getBdnsApiBase()}/convocatorias`);
  url.searchParams.set("numConv", numConv);
  url.searchParams.set("vpd", "GE");

  const timeoutMs = getDetailTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await bdnsFetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (res.status === 204) {
      return {
        ok: false,
        status: 404,
        message: "BDNS no devuelve detalle para esta convocatoria",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: `BDNS respondió ${res.status}`,
      };
    }

    const json = (await res.json()) as unknown;
    if (!json || typeof json !== "object") {
      return { ok: false, status: 502, message: "Respuesta de detalle inválida" };
    }

    const data = rawToGrantDetail(json, numConv);
    detailCache.set(numConv, data);
    return { ok: true, data };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        status: 504,
        message: `BDNS no respondió en ${timeoutMs} ms`,
      };
    }

    return {
      ok: false,
      status: 502,
      message:
        error instanceof Error ? error.message : "Error consultando BDNS",
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/*  Enriquecimiento de elegibilidad (Bloque 12)                        */
/* ------------------------------------------------------------------ */

function extractStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        const code = typeof obj.codigo === "string" ? `${obj.codigo} - ` : "";
        return typeof obj.descripcion === "string" ? `${code}${obj.descripcion}` : null;
      }
      return null;
    })
    .filter((v): v is string => v !== null);
}

export type EligibilityFields = Pick<
  GrantItem,
  | "beneficiaryTypes"
  | "sectors"
  | "impactRegions"
  | "purpose"
  | "instrumentType"
  | "applicationStartDate"
  | "applicationEndDate"
  | "applicationStartText"
  | "applicationEndText"
  | "openEnded"
> & {
  amount?: number | null;
  /** BDNS respondió 204: no hay detalle. Se marca como enriquecida sin datos. */
  noContent?: boolean;
};

/**
 * Mínimo que necesita el enriquecimiento: un id y los campos de elegibilidad
 * (opcionales). Tanto `GrantItem` como una fila de `grants_seen` encajan.
 */
export type EnrichableGrant = { id: string } & EligibilityFields;

/**
 * Obtiene campos de elegibilidad de una convocatoria vía la API BDNS.
 * Devuelve `null` si la petición falla (degradación parcial).
 */

const DEFAULT_DETAIL_CACHE_TTL_SECONDS = 3600;

function getDetailCacheTtlMs(): number {
  const raw = Number(
    process.env.BDNS_DETAIL_CACHE_TTL_SECONDS ?? String(DEFAULT_DETAIL_CACHE_TTL_SECONDS)
  );
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_DETAIL_CACHE_TTL_SECONDS * 1000;
  return Math.min(raw, 86400) * 1000;
}

/**
 * Caché de elegibilidad por convocatoria. La elegibilidad cambia poco, así
 * que cachearla evita repetir la misma llamada de detalle en cada búsqueda,
 * paginación o tarjeta del dashboard. Solo se guardan los aciertos: un fallo
 * se reintenta la próxima vez.
 */
const eligibilityCache = createTtlCache<EligibilityFields>({
  maxEntries: 1000,
  ttlMs: getDetailCacheTtlMs(),
});

/**
 * Caché de detalles completos (modal y lote del dashboard). Comparte TTL con
 * la de elegibilidad: el detalle de una convocatoria cambia poco.
 */
const detailCache = createTtlCache<GrantDetail>({
  maxEntries: 500,
  ttlMs: getDetailCacheTtlMs(),
});

export async function fetchGrantEligibility(
  numConv: string,
): Promise<EligibilityFields | null> {
  const cached = eligibilityCache.get(numConv);
  if (cached) return cached;

  const url = new URL(`${getBdnsApiBase()}/convocatorias`);
  url.searchParams.set("numConv", numConv);
  url.searchParams.set("vpd", "GE");

  try {
    const res = await bdnsFetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    // 204 = BDNS no tiene detalle para esta convocatoria. No es un fallo
    // transitorio: se marca como enriquecida sin datos para no reintentarla
    // eternamente.
    if (res.status === 204) {
      const fields: EligibilityFields = {
        beneficiaryTypes: [],
        sectors: [],
        impactRegions: [],
        purpose: null,
        instrumentType: null,
        applicationStartDate: null,
        applicationEndDate: null,
        applicationStartText: null,
        applicationEndText: null,
        openEnded: false,
        noContent: true,
      };
      eligibilityCache.set(numConv, fields);
      return fields;
    }

    if (!res.ok) return null;

    const json = (await res.json()) as Record<string, unknown>;

    const instruments = extractStrings(json.instrumentos);
    const amount = parseAmount(json.presupuestoTotal);

    const fields: EligibilityFields = {
      beneficiaryTypes: extractStrings(json.tiposBeneficiarios),
      sectors: extractStrings(json.sectores),
      impactRegions: extractStrings(json.regiones),
      purpose: typeof json.descripcionFinalidad === "string" ? json.descripcionFinalidad : null,
      instrumentType: instruments.length > 0 ? instruments.join(", ") : null,
      ...(amount !== null && { amount }),
      ...extractApplicationDates(json),
    };

    eligibilityCache.set(numConv, fields);
    return fields;
  } catch {
    return null;
  }
}

/**
 * Enriquece una lista de ayudas con datos de elegibilidad en paralelo.
 * `concurrency` controla cuántas peticiones simultáneas se hacen a la API BDNS.
 *
 * Devuelve el conjunto de `id` que se enriquecieron con ÉXITO (la petición a
 * BDNS respondió, aunque viniera sin datos). Así el cron puede distinguir
 * "ya está enriquecida" de "falló y hay que reintentar". `fetchFields` es
 * inyectable para poder testear sin red.
 */
function getEnrichConcurrency(): number {
  const raw = Number(process.env.BDNS_ENRICH_CONCURRENCY ?? "2");
  if (!Number.isFinite(raw) || raw < 1) return 2;
  return Math.min(5, Math.floor(raw));
}

export async function enrichGrantsWithEligibility<T extends EnrichableGrant>(
  items: T[],
  concurrency = getEnrichConcurrency(),
  fetchFields: (id: string) => Promise<EligibilityFields | null> = fetchGrantEligibility,
  /**
   * Se consulta antes de empezar cada ayuda. Si devuelve true, los workers
   * dejan de coger trabajo nuevo (lo ya pedido termina) y las ayudas
   * restantes quedan pendientes para la siguiente ejecución. Así el cron
   * guarda progreso en vez de morir a mitad.
   */
  shouldStop: () => boolean = () => false,
): Promise<{ succeeded: Set<string>; stoppedEarly: boolean }> {
  let cursor = 0;
  const succeeded = new Set<string>();

  async function next(): Promise<void> {
    while (cursor < items.length) {
      if (shouldStop()) break;
      const idx = cursor++;
      const item = items[idx];
      const fields = await fetchFields(item.id);
      if (fields) {
        item.beneficiaryTypes = fields.beneficiaryTypes;
        item.sectors = fields.sectors;
        item.impactRegions = fields.impactRegions;
        item.purpose = fields.purpose;
        item.instrumentType = fields.instrumentType;
        if (fields.amount != null) item.amount = fields.amount;
        item.applicationStartDate = fields.applicationStartDate;
        item.applicationEndDate = fields.applicationEndDate;
        item.applicationStartText = fields.applicationStartText;
        item.applicationEndText = fields.applicationEndText;
        item.openEnded = fields.openEnded;
        succeeded.add(item.id);
      } else {
        incrementMetric("enriched_failed");
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);

  return { succeeded, stoppedEarly: cursor < items.length };
}
