import type { GrantItem, GrantsSearchResult, SearchGrantsParams } from "@/lib/domain/grants";
import { getCachedSearch, setCachedSearch } from "./search-cache";
import { buildInfosubvencionesConvocatoriaUrl } from "./urls";

export type { GrantItem, GrantsSearchResult, SearchGrantsParams } from "@/lib/domain/grants";

type BdnsRawResponse = unknown;

function getEnvNumber(name: string, fallback: number): number {
  const value = process.env[name];
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBdnsDate(value?: string): string | null {
  if (!value) return null;

  // Si viene de input type="date" -> YYYY-MM-DD
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  // Si ya viene DD/MM/YYYY, lo dejamos pasar.
  const esMatch = value.match(/^\d{2}\/\d{2}\/\d{4}$/);
  if (esMatch) return value;

  return null;
}

export function buildSearchUrl(
  endpoint: string,
  params: SearchGrantsParams,
  descripcion?: string
): string {
  const url = new URL(endpoint);

  // BDNS pagina desde 0, nuestra API expone page desde 1.
  const pageZeroBased = Math.max(0, params.page - 1);

  // `descripcion` desplaza a `params.q`: se usa cuando la consulta se ha
  // dividido en grupos (comas → OR). Sin ella, se envía `params.q` tal cual.
  const queryText = descripcion ?? params.q;

  if (queryText) {
    url.searchParams.set("descripcion", queryText);
    // 1 = todas las palabras: exige que TODAS las palabras del grupo estén.
    // Con "2" (alguna palabra) bastaba "eléctrica" para colar ayudas ajenas
    // a la búsqueda (p. ej. «INSTALACIÓN ELÉCTRICA» al buscar una bici).
    url.searchParams.set("descripcionTipoBusqueda", "1");
  }

  if (params.order) {
    url.searchParams.set("order", params.order);
  }
  
  if (params.direccion) {
    url.searchParams.set("direccion", params.direccion);
  }

  const fechaDesde = toBdnsDate(params.fechaDesde);
  const fechaHasta = toBdnsDate(params.fechaHasta);

  if (fechaDesde) url.searchParams.set("fechaDesde", fechaDesde);
  if (fechaHasta) url.searchParams.set("fechaHasta", fechaHasta);

  if (params.tipoAdministracion && ["C", "A", "L", "O"].includes(params.tipoAdministracion)) {
    url.searchParams.set("tipoAdministracion", params.tipoAdministracion);
  }

  url.searchParams.set("page", String(pageZeroBased));
  url.searchParams.set("pageSize", String(params.pageSize));
  url.searchParams.set("vpd", "GE");

  if (
    params.tipoAdministracion === "A" &&
    typeof params.regionId === "number" &&
    Number.isInteger(params.regionId) &&
    params.regionId > 0
  ) {
    // BDNS acepta lista; para un solo valor enviamos uno.
    url.searchParams.set("regiones", String(params.regionId));
  }

  return url.toString();
}

async function fetchWithRetry(
  url: string,
  retries: number,
  timeoutMs: number
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      clearTimeout(timeout);

      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) continue;
        throw new Error(`BDNS respondió ${res.status}`);
      }

      return res;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt === retries) break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Error desconocido consultando BDNS");
}

function normalizeRawToGrants(
  raw: BdnsRawResponse,
  page: number,
  pageSize: number
): GrantsSearchResult {
  const data = raw as { content?: unknown[]; totalElements?: unknown } | null;

  const rawItems = Array.isArray(data?.content) ? data.content : [];
  const total =
    typeof data?.totalElements === "number" ? data.totalElements : rawItems.length;

  const items: GrantItem[] = rawItems.map((item, idx) => {
    const obj = (item ?? {}) as Record<string, unknown>;

    const numeroConvocatoria =
      typeof obj.numeroConvocatoria === "string" ? obj.numeroConvocatoria : null;

    const sourceUrl = numeroConvocatoria
      ? buildInfosubvencionesConvocatoriaUrl(numeroConvocatoria)
      : null;

    return {
      id: String(numeroConvocatoria ?? obj.id ?? `unknown-${page}-${idx}`),
      title: typeof obj.descripcion === "string" ? obj.descripcion : "Sin título",
      organization: typeof obj.nivel2 === "string" ? obj.nivel2 : null,
      publicationDate:
        typeof obj.fechaRecepcion === "string" ? obj.fechaRecepcion : null,
      deadlineDate: null,
      amount: null,
      sourceUrl,
    };
  });

  return { items, total, page, pageSize };
}

/**
 * Divide una consulta libre en grupos de palabras.
 * - Sin comas → un solo grupo ("bici electrica").
 * - Con comas o punto y coma → cada trozo es una alternativa (OR), el
 *   formato que sugiere el propio placeholder del buscador
 *   ("digitalización, autónomos, I+D"). Sin texto → sin grupos.
 */
export function splitQueryGroups(q: string | undefined): string[] {
  if (!q) return [];
  return q
    .split(/[,;]/)
    .map((group) => group.trim())
    .filter((group) => group.length > 0);
}

/**
 * Une los resultados de varios grupos (comas → OR), sin duplicados.
 * Cuando una convocatoria aparece en varios grupos, gana la del primero.
 */
export function mergeGroupResults(groups: GrantsSearchResult[]): GrantItem[] {
  const items: GrantItem[] = [];
  const seen = new Set<string>();

  for (const result of groups) {
    for (const item of result.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }

  return items;
}

async function fetchSearchPage(
  url: string,
  retries: number,
  timeoutMs: number,
  page: number,
  pageSize: number
): Promise<GrantsSearchResult> {
  const cached = getCachedSearch(url);
  if (cached) return cached;

  const res = await fetchWithRetry(url, retries, timeoutMs);
  const raw = (await res.json()) as BdnsRawResponse;
  const result = normalizeRawToGrants(raw, page, pageSize);
  setCachedSearch(url, result);
  return result;
}

export async function searchGrants(
  params: SearchGrantsParams
): Promise<GrantsSearchResult> {
  const endpoint = process.env.BDNS_SEARCH_ENDPOINT;
  if (!endpoint) {
    throw new Error("BDNS_SEARCH_ENDPOINT no está configurado");
  }

  const timeoutMs = getEnvNumber("BDNS_TIMEOUT_MS", 12000);
  const retries = getEnvNumber("BDNS_RETRIES", 2);

  const groups = splitQueryGroups(params.q);

  // Caso habitual: una frase ("bici electrica"). Una sola llamada a BDNS
  // con "todas las palabras", así la paginación y el total son los suyos.
  if (groups.length <= 1) {
    const url = buildSearchUrl(endpoint, params, groups[0]);
    return fetchSearchPage(url, retries, timeoutMs, params.page, params.pageSize);
  }

  // Con comas el usuario pide ALTERNATIVAS (OR). BDNS no sabe booleanos
  // agrupados, así que se consulta cada grupo por separado (AND interno)
  // y se fusiona aquí. Cada grupo trae hasta `page * pageSize` resultados
  // (tope 100) para que la página pedida siempre tenga datos; el `total`
  // es el tamaño de la unión y la paginación se aplica localmente.
  const perGroup = Math.min(params.page * params.pageSize, 100);

  const groupPages: GrantsSearchResult[] = [];
  for (const group of groups) {
    const groupParams: SearchGrantsParams = {
      ...params,
      q: undefined,
      page: 1,
      pageSize: perGroup,
    };
    const url = buildSearchUrl(endpoint, groupParams, group);
    groupPages.push(await fetchSearchPage(url, retries, timeoutMs, 1, perGroup));
  }

  const merged = mergeGroupResults(groupPages);
  const start = (params.page - 1) * params.pageSize;

  return {
    items: merged.slice(start, start + params.pageSize),
    total: merged.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}
