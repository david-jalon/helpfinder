import { bdnsFetch } from "./http";
import { getBdnsApiBase } from "./urls";

type RegionNode = {
  id?: unknown;
  descripcion?: unknown;
  children?: unknown;
};

export type RegionOption = {
  id: number;
  name: string;
};

function extractCcaa(nodes: RegionNode[]): RegionOption[] {
  const out: RegionOption[] = [];

  for (const n1 of nodes) {
    const level2 = Array.isArray(n1.children) ? (n1.children as RegionNode[]) : [];
    for (const n2 of level2) {
      const id = typeof n2.id === "number" ? n2.id : null;
      const desc = typeof n2.descripcion === "string" ? n2.descripcion : null;
      if (!id || !desc) continue;

      if (!/^ES\d{2}\s*-/.test(desc)) continue;

      const name = desc.replace(/^ES\d{2}\s*-\s*/i, "").trim();
      out.push({ id, name });
    }
  }

  out.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return out;
}

export type FetchRegionsResult =
  | { ok: true; data: RegionOption[] }
  | { ok: false; status: number; message: string };

const DEFAULT_REGIONS_CACHE_TTL_SECONDS = 3600;
const MAX_REGIONS_CACHE_TTL_SECONDS = 86_400;

/**
 * Caché en memoria del árbol de regiones. Cambia muy poco (una lista de
 * CCAA), así que no tiene sentido pedirlo a BDNS en cada carga / onboarding.
 */
let regionsCache: { expiresAt: number; data: RegionOption[] } | null = null;

export function getRegionsCacheTtlSeconds(): number {
  const raw = Number(
    process.env.BDNS_REGIONS_CACHE_TTL_SECONDS ??
      String(DEFAULT_REGIONS_CACHE_TTL_SECONDS)
  );
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_REGIONS_CACHE_TTL_SECONDS;
  return Math.min(Math.floor(raw), MAX_REGIONS_CACHE_TTL_SECONDS);
}

/** Solo para tests o invalidación manual. */
export function clearRegionsCache(): void {
  regionsCache = null;
}

/**
 * Árbol de regiones BDNS → lista de CCAA para desplegables.
 */
export async function fetchCcaaRegionOptions(): Promise<FetchRegionsResult> {
  const ttlSeconds = getRegionsCacheTtlSeconds();

  if (ttlSeconds > 0 && regionsCache && Date.now() < regionsCache.expiresAt) {
    return { ok: true, data: regionsCache.data };
  }

  const url = `${getBdnsApiBase()}/regiones?vpd=GE`;

  try {
    const res = await bdnsFetch(url, {
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

    const json = (await res.json()) as RegionNode[];
    if (!Array.isArray(json) || json.length === 0) {
      return { ok: true, data: [] };
    }

    const root = json[0];
    const children = Array.isArray(root.children)
      ? (root.children as RegionNode[])
      : [];
    const ccaa = extractCcaa(children);

    if (ttlSeconds > 0 && ccaa.length > 0) {
      regionsCache = {
        expiresAt: Date.now() + ttlSeconds * 1000,
        data: ccaa,
      };
    }

    return { ok: true, data: ccaa };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      message:
        error instanceof Error ? error.message : "Error consultando regiones",
    };
  }
}
