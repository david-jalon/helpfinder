import { createClient } from "@/lib/supabase/server";
import { searchGrants } from "@/lib/bdns/client";
import { enrichGrantsWithEligibility } from "@/lib/bdns/detail";

/**
 * Motor diario (cron).
 *
 * Cada día, Vercel Cron llama a /api/cron/daily que ejecuta `dailyScan()`.
 * Esta función:
 *  1. Busca en BDNS las ayudas de los últimos N días.
 *  2. Compara con lo que ya conocemos en `grants_seen`.
 *  3. Guarda las NUEVAS con sus datos de elegibilidad (gratis, sin IA).
 *  4. Devuelve un resumen de lo que encontró.
 *
 * `grants_seen` es una caché pública compartida (no multi-tenant).
 * Solo el cron la escribe; todos la leen.
 */

const DEFAULT_SEARCH_DAYS = 7;
const DEFAULT_PAGE_SIZE = 50;

type DailyScanResult = {
  totalFetched: number;
  newGrantsCount: number;
  enrichedCount: number;
  newGrants: { id: string; title: string }[];
};

function getDaysBack(): number {
  const raw = Number(process.env.CRON_SEARCH_DAYS ?? String(DEFAULT_SEARCH_DAYS));
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 30) : DEFAULT_SEARCH_DAYS;
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
    beneficiaryTypes?: string[];
    sectors?: string[];
    impactRegions?: string[];
    purpose?: string | null;
    instrumentType?: string | null;
  }>
): Promise<void> {
  if (grants.length === 0) return;

  const supabase = await createClient();

  const rows = grants.map((g) => ({
    num_convocatoria: g.id,
    title: g.title,
    organization: g.organization,
    source_url: g.sourceUrl,
    eligibility_json: {
      beneficiaryTypes: g.beneficiaryTypes ?? [],
      sectors: g.sectors ?? [],
      impactRegions: g.impactRegions ?? [],
      purpose: g.purpose ?? null,
      instrumentType: g.instrumentType ?? null,
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

  // 1) Buscar ayudas recientes en BDNS
  const searchResult = await searchGrants({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    fechaDesde,
    order: "fechaRecepcion",
    direccion: "desc",
  });

  const allItems = searchResult.items;
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
    newGrantsCount: newItems.length,
    enrichedCount: newItems.filter((i) => i.beneficiaryTypes && i.beneficiaryTypes.length > 0).length,
    newGrants: newItems.map((i) => ({ id: i.id, title: i.title })),
  };
}
