import { createClient } from "@/lib/supabase/server";
import { searchGrants } from "@/lib/bdns/client";
import { enrichGrantsWithEligibility } from "@/lib/bdns/detail";

/**
 * Motor diario (cron).
 *
 * Cada día, Vercel Cron llama a /api/cron/daily que ejecuta `dailyScan()`.
 * Esta función:
 *  1. Busca en BDNS las ayudas de los últimos N días (TODAS las páginas,
 *     no solo la primera).
 *  2. Compara con lo que ya conocemos en `grants_seen`.
 *  3. Guarda las NUEVAS con sus datos de elegibilidad (gratis, sin IA).
 *  4. Devuelve un resumen de lo que encontró.
 *
 * `grants_seen` es una caché pública compartida (no multi-tenant).
 * Solo el cron la escribe; todos la leen.
 */

const DEFAULT_SEARCH_DAYS = 7;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 10;

type DailyScanResult = {
  totalFetched: number;
  /** Páginas de BDNS realmente consultadas (diagnóstico). */
  pagesFetched: number;
  /** true si se llegó al tope de páginas y podrían quedar resultados. */
  truncated: boolean;
  newGrantsCount: number;
  enrichedCount: number;
  newGrants: { id: string; title: string }[];
};

function getDaysBack(): number {
  const raw = Number(process.env.CRON_SEARCH_DAYS ?? String(DEFAULT_SEARCH_DAYS));
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 30) : DEFAULT_SEARCH_DAYS;
}

function getMaxPages(): number {
  const raw = Number(process.env.CRON_MAX_PAGES ?? String(DEFAULT_MAX_PAGES));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_PAGES;
}

/* ------------------------------------------------------------------ */
/*  Paginación genérica (pura, sin red → testeable)                    */
/* ------------------------------------------------------------------ */

type PageResult<T> = { items: T[]; total: number };
export type PageFetcher<T> = (
  page: number,
  pageSize: number
) => Promise<PageResult<T>>;

/**
 * Pide páginas a BDNS hasta agotarlas (o hasta `maxPages`), uniendo los
 * resultados sin duplicados por `id`.
 *
 * Antes solo se pedía la página 1: si había más de `pageSize` convocatorias
 * nuevas, las siguientes se perdían. Aquí se recorre hasta que una página
 * llega incompleta o se alcanza el `total` que declara BDNS.
 */
export async function fetchAllPages<T extends { id: string }>(
  fetchPage: PageFetcher<T>,
  pageSize: number,
  maxPages: number
): Promise<{ items: T[]; pagesFetched: number; truncated: boolean }> {
  const items: T[] = [];
  const seen = new Set<string>();
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page++) {
    const result = await fetchPage(page, pageSize);
    pagesFetched = page;

    for (const item of result.items) {
      if (item.id && !seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }

    const lastPage = result.items.length < pageSize;
    const reachedTotal = page * pageSize >= result.total;
    if (lastPage || reachedTotal) {
      return { items, pagesFetched, truncated: false };
    }
  }

  // Se agotaron las páginas permitidas y aún quedaban resultados.
  return { items, pagesFetched, truncated: true };
}


function getDateString(daysBack: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function getKnownIds(grantIds: string[]): Promise<Set<string>> {
  if (grantIds.length === 0) return new Set();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants_seen")
    .select("num_convocatoria")
    .in("num_convocatoria", grantIds);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.num_convocatoria));
}

async function upsertGrantsSeen(
  grants: Array<{
    id: string;
    title: string;
    organization: string | null;
    sourceUrl: string | null;
    publicationDate?: string | null;
    beneficiaryTypes?: string[];
    sectors?: string[];
    impactRegions?: string[];
    purpose?: string | null;
    instrumentType?: string | null;
    amount?: number | null;
    applicationStartDate?: string | null;
    applicationEndDate?: string | null;
    applicationStartText?: string | null;
    applicationEndText?: string | null;
    openEnded?: boolean;
  }>
): Promise<void> {
  if (grants.length === 0) return;

  const supabase = await createClient();

  const rows = grants.map((g) => ({
    num_convocatoria: g.id,
    title: g.title,
    organization: g.organization,
    source_url: g.sourceUrl,
    publication_date: g.publicationDate ?? null,
    eligibility_json: {
      beneficiaryTypes: g.beneficiaryTypes ?? [],
      sectors: g.sectors ?? [],
      impactRegions: g.impactRegions ?? [],
      purpose: g.purpose ?? null,
      instrumentType: g.instrumentType ?? null,
      amount: g.amount ?? null,
      applicationStartDate: g.applicationStartDate ?? null,
      applicationEndDate: g.applicationEndDate ?? null,
      applicationStartText: g.applicationStartText ?? null,
      applicationEndText: g.applicationEndText ?? null,
      openEnded: g.openEnded ?? false,
    },
    enriched_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("grants_seen").upsert(rows, {
    onConflict: "num_convocatoria",
    ignoreDuplicates: false,
  });

  if (error) throw error;
}

/**
 * Escaneo diario de BDNS.
 * Busca ayudas recientes, detecta las nuevas y las guarda en grants_seen.
 */
export async function dailyScan(): Promise<DailyScanResult> {
  const daysBack = getDaysBack();
  const fechaDesde = getDateString(daysBack);

  // 1) Buscar TODAS las ayudas recientes en BDNS (varias páginas).
  const maxPages = getMaxPages();
  const { items: allItems, pagesFetched, truncated } = await fetchAllPages(
    (page, pageSize) =>
      searchGrants({
        page,
        pageSize,
        fechaDesde,
        order: "fechaRecepcion",
        direccion: "desc",
      }),
    DEFAULT_PAGE_SIZE,
    maxPages
  );

  if (truncated) {
    // Se paró por el tope de páginas: puede haber más ayudas sin leer.
    console.warn(
      JSON.stringify({
        event: "cron_daily_page_limit",
        pagesFetched,
        maxPages,
        pageSize: DEFAULT_PAGE_SIZE,
      })
    );
  }

  const allIds = allItems.map((i) => i.id).filter((id) => id && id.trim().length > 0);

  // 2) Detectar cuáles son nuevas
  const knownIds = await getKnownIds([...new Set(allIds)]);
  const newItems = allItems.filter((item) => !knownIds.has(item.id));

  // 3) Enriquecer las nuevas con datos de elegibilidad (gratis, sin IA)
  if (newItems.length > 0) {
    await enrichGrantsWithEligibility(newItems);
  }

  // 4) Guardar en grants_seen
  await upsertGrantsSeen(newItems);

  return {
    totalFetched: allItems.length,
    pagesFetched,
    truncated,
    newGrantsCount: newItems.length,
    enrichedCount: newItems.filter((i) => i.beneficiaryTypes && i.beneficiaryTypes.length > 0).length,
    newGrants: newItems.map((i) => ({ id: i.id, title: i.title })),
  };
}
