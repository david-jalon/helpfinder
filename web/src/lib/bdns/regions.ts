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

/**
 * Árbol de regiones BDNS → lista de CCAA para desplegables.
 */
export async function fetchCcaaRegionOptions(): Promise<FetchRegionsResult> {
  const url = `${getBdnsApiBase()}/regiones?vpd=GE`;

  const res = await fetch(url, {
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
  const children = Array.isArray(root.children) ? (root.children as RegionNode[]) : [];
  const ccaa = extractCcaa(children);

  return { ok: true, data: ccaa };
}
