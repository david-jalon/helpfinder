import type { GrantDetail, GrantItem } from "@/lib/domain/grants";
import { buildInfosubvencionesConvocatoriaUrl, getBdnsApiBase } from "./urls";

function rawToGrantDetail(raw: unknown, requestedNumConv: string): GrantDetail {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const numeroConvocatoria =
    typeof obj.numeroConvocatoria === "string" ? obj.numeroConvocatoria : requestedNumConv;

  const sourceUrl = numeroConvocatoria
    ? buildInfosubvencionesConvocatoriaUrl(numeroConvocatoria)
    : null;

  return {
    id: String(numeroConvocatoria ?? obj.id ?? "unknown"),
    title: typeof obj.descripcion === "string" ? obj.descripcion : "Sin título",
    organization: typeof obj.nivel2 === "string" ? obj.nivel2 : null,
    publicationDate:
      typeof obj.fechaRecepcion === "string" ? obj.fechaRecepcion : null,
    description: typeof obj.descripcion === "string" ? obj.descripcion : null,
    sourceUrl,
  };
}

export type FetchGrantDetailResult =
  | { ok: true; data: GrantDetail }
  | { ok: false; status: number; message: string };

/**
 * Detalle de convocatoria vía API BDNS (`/convocatorias?numConv=&vpd=GE`).
 */
export async function fetchGrantDetailByNumConv(numConv: string): Promise<FetchGrantDetailResult> {
  const url = new URL(`${getBdnsApiBase()}/convocatorias`);
  url.searchParams.set("numConv", numConv);
  url.searchParams.set("vpd", "GE");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

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

  return { ok: true, data: rawToGrantDetail(json, numConv) };
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

type EligibilityFields = Pick<
  GrantItem,
  "beneficiaryTypes" | "sectors" | "impactRegions" | "purpose" | "instrumentType"
>;

/**
 * Obtiene campos de elegibilidad de una convocatoria vía la API BDNS.
 * Devuelve `null` si la petición falla (degradación parcial).
 */
export async function fetchGrantEligibility(
  numConv: string,
  timeoutMs = 8000,
): Promise<EligibilityFields | null> {
  const url = new URL(`${getBdnsApiBase()}/convocatorias`);
  url.searchParams.set("numConv", numConv);
  url.searchParams.set("vpd", "GE");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) return null;

    const json = (await res.json()) as Record<string, unknown>;

    const instruments = extractStrings(json.instrumentos);

    return {
      beneficiaryTypes: extractStrings(json.tiposBeneficiarios),
      sectors: extractStrings(json.sectores),
      impactRegions: extractStrings(json.regiones),
      purpose: typeof json.descripcionFinalidad === "string" ? json.descripcionFinalidad : null,
      instrumentType: instruments.length > 0 ? instruments.join(", ") : null,
    };
  } catch {
    return null;
  }
}

/**
 * Enriquece una lista de GrantItem con datos de elegibilidad en paralelo.
 * `concurrency` controla cuántas peticiones simultáneas se hacen a la API BDNS.
 */
export async function enrichGrantsWithEligibility(
  items: GrantItem[],
  concurrency = 5,
): Promise<void> {
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      const fields = await fetchGrantEligibility(item.id);
      if (fields) {
        item.beneficiaryTypes = fields.beneficiaryTypes;
        item.sectors = fields.sectors;
        item.impactRegions = fields.impactRegions;
        item.purpose = fields.purpose;
        item.instrumentType = fields.instrumentType;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);
}
