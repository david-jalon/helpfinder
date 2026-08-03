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

function buildSearchUrl(endpoint: string, params: SearchGrantsParams): string {
  const url = new URL(endpoint);

  // BDNS pagina desde 0, nuestra API expone page desde 1.
  const pageZeroBased = Math.max(0, params.page - 1);

  if (params.q) {
    url.searchParams.set("descripcion", params.q);
    // 2 = alguna de las palabras (más flexible para texto libre).
    url.searchParams.set("descripcionTipoBusqueda", "2");
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

export async function searchGrants(
  params: SearchGrantsParams
): Promise<GrantsSearchResult> {
  const endpoint = process.env.BDNS_SEARCH_ENDPOINT;
  if (!endpoint) {
    throw new Error("BDNS_SEARCH_ENDPOINT no está configurado");
  }

  const timeoutMs = getEnvNumber("BDNS_TIMEOUT_MS", 12000);
  const retries = getEnvNumber("BDNS_RETRIES", 2);

  const url = buildSearchUrl(endpoint, params);

  const cached = getCachedSearch(url);
  if (cached) {
    return cached;
  }

  const res = await fetchWithRetry(url, retries, timeoutMs);

  const raw = (await res.json()) as BdnsRawResponse;
  const result = normalizeRawToGrants(raw, params.page, params.pageSize);
  setCachedSearch(url, result);
  return result;
}
