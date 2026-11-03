import { createAdminClient } from "@/lib/supabase/admin";
import { searchGrants } from "@/lib/bdns/client";
import { enrichGrantsWithEligibility } from "@/lib/bdns/detail";
import { getGrantsNeedingEnrichment } from "@/lib/grants/feed";
import { chunkArray } from "@/lib/domain/chunk";
import { createTimeBudget, getCronBudgetMs } from "@/lib/cron/budget";
import {
  countPendingEnrichment,
  upsertGrantsSeen,
} from "@/lib/grants/seen-write";

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
  /** true si no se llegó al final: por tope de páginas o por tiempo. */
  truncated: boolean;
  /** Por qué se dejó de leer páginas de BDNS. */
  stopReason: "complete" | "max_pages" | "time_budget";
  newGrantsCount: number;
  /** Ayudas nuevas enriquecidas con éxito (BDNS respondió). */
  enrichedCount: number;
  /** Ayudas nuevas cuya llamada a BDNS falló y quedan para reintento. */
  enrichedFailed: number;
  /** Ayudas nuevas que ni siquiera se intentaron por falta de tiempo. */
  newPendingCount: number;
  /** Ayudas ya conocidas que se re-enriquecieron con éxito en esta pasada. */
  retryEnrichedCount: number;
  /** true si el reintento no cabía en el presupuesto de tiempo. */
  retrySkipped: boolean;
  /** Total de filas que siguen con `enriched_at = null`. */
  pendingBacklog: number;
  /** Duración total de la ejecución. */
  durationMs: number;
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

const DEFAULT_ENRICH_RETRY_LIMIT = 100;

/** Tiempo mínimo que debe quedar para empezar el reintento de pendientes. */
const MIN_MS_FOR_RETRY = 20_000;

/** Ids por consulta `.in()`: evita superar el tamaño máximo de URL. */
const READ_CHUNK_SIZE = 100;

/** Cuántas ayudas sin elegibilidad se reintentan por ejecución del cron. */
function getEnrichRetryLimit(): number {
  const raw = Number(
    process.env.CRON_ENRICH_RETRY_LIMIT ?? String(DEFAULT_ENRICH_RETRY_LIMIT)
  );
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_ENRICH_RETRY_LIMIT;
}

/* ------------------------------------------------------------------ */
/*  Paginación genérica (pura, sin red → testeable)                    */
/* ------------------------------------------------------------------ */

type PageResult<T> = { items: T[]; total: number };
export type PageFetcher<T> = (
  page: number,
  pageSize: number
) => Promise<PageResult<T>>;

export type FetchAllPagesResult<T> = {
  items: T[];
  pagesFetched: number;
  truncated: boolean;
  stopReason: "complete" | "max_pages" | "time_budget";
};

/**
 * Pide páginas a BDNS hasta agotarlas (o hasta `maxPages`), uniendo los
 * resultados sin duplicados por `id`.
 *
 * Antes solo se pedía la página 1: si había más de `pageSize` convocatorias
 * nuevas, las siguientes se perdían. Aquí se recorre hasta que una página
 * llega incompleta o se alcanza el `total` que declara BDNS.
 *
 * `shouldStop` permite cortar limpiamente por presupuesto de tiempo antes de
 * pedir otra página: las ya leídas se procesan y el resto queda para mañana.
 */
export async function fetchAllPages<T extends { id: string }>(
  fetchPage: PageFetcher<T>,
  pageSize: number,
  maxPages: number,
  shouldStop?: () => boolean
): Promise<FetchAllPagesResult<T>> {
  const items: T[] = [];
  const seen = new Set<string>();
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page++) {
    if (shouldStop?.()) {
      return {
        items,
        pagesFetched,
        truncated: true,
        stopReason: "time_budget",
      };
    }

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
      return {
        items,
        pagesFetched,
        truncated: false,
        stopReason: "complete",
      };
    }
  }

  // Se agotaron las páginas permitidas y aún quedaban resultados.
  return { items, pagesFetched, truncated: true, stopReason: "max_pages" };
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

  const supabase = createAdminClient();
  const uniqueIds = [...new Set(grantIds)];

  // Troceado: un `.in()` con cientos de ids puede superar el tamaño máximo
  // de URL de PostgREST y la petición falla entera.
  const chunks = chunkArray(uniqueIds, READ_CHUNK_SIZE);

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from("grants_seen")
        .select("num_convocatoria")
        .in("num_convocatoria", chunk);

      if (error) throw error;
      return data ?? [];
    })
  );

  return new Set(results.flat().map((row) => row.num_convocatoria));
}

/**
 * Escaneo diario de BDNS.
 * Busca ayudas recientes, detecta las nuevas y las guarda en grants_seen.
 *
 * Todas las fases respetan un presupuesto de tiempo: cuando se agota, se
 * guarda lo hecho y se devuelve el resumen con `stopReason`/`retrySkipped`.
 * El resto se retoma en la siguiente ejecución (o en el backfill manual).
 *
 * `budgetMs` y `now` son inyectables para testear el corte sin esperas.
 */
export async function dailyScan(
  options: { budgetMs?: number; now?: () => number } = {}
): Promise<DailyScanResult> {
  const budget = createTimeBudget(
    options.budgetMs ?? getCronBudgetMs(),
    options.now
  );

  const daysBack = getDaysBack();
  const fechaDesde = getDateString(daysBack);

  // 1) Buscar TODAS las ayudas recientes en BDNS (varias páginas).
  const maxPages = getMaxPages();
  const {
    items: allItems,
    pagesFetched,
    truncated,
    stopReason,
  } = await fetchAllPages(
    (page, pageSize) =>
      searchGrants({
        page,
        pageSize,
        fechaDesde,
        order: "fechaRecepcion",
        direccion: "desc",
      }),
    DEFAULT_PAGE_SIZE,
    maxPages,
    () => budget.expired()
  );

  if (stopReason === "max_pages") {
    // Se paró por el tope de páginas: puede haber más ayudas sin leer.
    console.warn(
      JSON.stringify({
        event: "cron_daily_page_limit",
        pagesFetched,
        maxPages,
        pageSize: DEFAULT_PAGE_SIZE,
      })
    );
  } else if (stopReason === "time_budget") {
    console.warn(
      JSON.stringify({
        event: "cron_daily_time_budget",
        phase: "fetch_pages",
        pagesFetched,
      })
    );
  }

  const allIds = allItems.map((i) => i.id).filter((id) => id && id.trim().length > 0);

  // 2) Detectar cuáles son nuevas
  const knownIds = await getKnownIds([...new Set(allIds)]);
  const newItems = allItems.filter((item) => !knownIds.has(item.id));

  // 3) Enriquecer las nuevas con datos de elegibilidad (gratis, sin IA).
  //    Si se acaba el tiempo, los workers dejan de coger ayudas nuevas y las
  //    restantes se guardan con `enriched_at = null` para reintentarse.
  let newEnriched = new Set<string>();
  let newPendingCount = 0;
  if (newItems.length > 0) {
    const { succeeded, stoppedEarly } = await enrichGrantsWithEligibility(
      newItems,
      undefined,
      undefined,
      () => budget.expired()
    );
    newEnriched = succeeded;
    newPendingCount = stoppedEarly
      ? newItems.filter((item) => !succeeded.has(item.id)).length
      : 0;
  }

  // 4) Guardar en grants_seen (las nuevas, aunque el enriquecimiento falle:
  //    así quedan visibles y se reintentan).
  await upsertGrantsSeen(newItems, newEnriched);

  console.info(
    JSON.stringify({
      event: "cron_daily_progress",
      phase: "new_grants",
      pagesFetched,
      newGrantsCount: newItems.length,
      enrichedCount: newEnriched.size,
      pendingCount: newPendingCount,
      elapsedMs: budget.elapsedMs(),
    })
  );

  // 5) Reintentar ayudas YA conocidas que se quedaron sin elegibilidad
  //    (`enriched_at` a null) por una caída puntual de BDNS. Solo si queda
  //    margen suficiente: es mejor dejarlo para mañana que morir a mitad.
  const retrySkipped = !budget.hasAtLeast(MIN_MS_FOR_RETRY);
  const retried = retrySkipped
    ? 0
    : await retryPendingEnrichment(() => budget.expired());

  return {
    totalFetched: allItems.length,
    pagesFetched,
    truncated,
    stopReason,
    newGrantsCount: newItems.length,
    enrichedCount: newEnriched.size,
    enrichedFailed:
      newItems.length - newPendingCount - newEnriched.size,
    newPendingCount,
    retryEnrichedCount: retried,
    retrySkipped,
    pendingBacklog: await countPendingEnrichment(),
    durationMs: budget.elapsedMs(),
    newGrants: newItems.map((i) => ({ id: i.id, title: i.title })),
  };
}

/**
 * Re-enriquece las ayudas conocidas pendientes de elegibilidad.
 * Devuelve cuántas se enriquecieron con éxito en esta pasada.
 */
async function retryPendingEnrichment(
  shouldStop: () => boolean = () => false
): Promise<number> {
  const pending = await getGrantsNeedingEnrichment(getEnrichRetryLimit());
  if (pending.length === 0) return 0;

  // Objeto enriquecible con los datos base de la fila (no se pierde nada:
  // title/organization/sourceUrl se reescriben con el mismo valor).
  const targets = pending.map((row) => ({
    id: row.numConvocatoria,
    title: row.title,
    organization: row.organization,
    sourceUrl: row.sourceUrl,
    publicationDate: row.publicationDate,
  }));

  const { succeeded } = await enrichGrantsWithEligibility(
    targets,
    undefined,
    undefined,
    shouldStop
  );
  if (succeeded.size === 0) return 0;

  await upsertGrantsSeen(
    targets.filter((t) => succeeded.has(t.id)),
    succeeded
  );

  return succeeded.size;
}
