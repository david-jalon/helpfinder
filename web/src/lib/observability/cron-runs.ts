import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Historial de ejecuciones del cron diario.
 *
 * Los logs de Vercel son efímeros (y en este proyecto el MCP no puede leerlos),
 * así que el propio cron guarda un resumen por ejecución en `cron_runs`.
 * `/api/health` lee las últimas para responder:
 *   ¿cuándo corrió? ¿cuánto tardó? ¿se quedó backlog?
 */

export type CronRunInput = {
  durationMs: number;
  stopReason: string;
  pagesFetched: number;
  newGrants: number;
  enriched: number;
  enrichedFailed: number;
  pendingBacklog: number;
  retrySkipped: boolean;
};

export type CronRunRow = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stopReason: string;
  pagesFetched: number;
  newGrants: number;
  enriched: number;
  enrichedFailed: number;
  pendingBacklog: number;
  retrySkipped: boolean;
};

/**
 * Guarda la ejecución. Nunca lanza: un fallo al registrar la métrica no debe
 * tumbar un cron que ya hizo su trabajo.
 */
export async function recordCronRun(input: CronRunInput): Promise<void> {
  try {
    const supabase = createAdminClient();
    const finishedAt = new Date();
    const startedAt = new Date(finishedAt.getTime() - input.durationMs);

    const { error } = await supabase.from("cron_runs").insert({
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: input.durationMs,
      stop_reason: input.stopReason,
      pages_fetched: input.pagesFetched,
      new_grants: input.newGrants,
      enriched: input.enriched,
      enriched_failed: input.enrichedFailed,
      pending_backlog: input.pendingBacklog,
      retry_skipped: input.retrySkipped,
    });

    if (error) throw error;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "cron_run_persist_error",
        detail: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

/** Últimas ejecuciones, de la más reciente a la más antigua. */
export async function getRecentCronRuns(limit = 5): Promise<CronRunRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("cron_runs")
    .select(
      "started_at, finished_at, duration_ms, stop_reason, pages_fetched, new_grants, enriched, enriched_failed, pending_backlog, retry_skipped"
    )
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
    durationMs: Number(row.duration_ms),
    stopReason: String(row.stop_reason),
    pagesFetched: Number(row.pages_fetched),
    newGrants: Number(row.new_grants),
    enriched: Number(row.enriched),
    enrichedFailed: Number(row.enriched_failed),
    pendingBacklog: Number(row.pending_backlog),
    retrySkipped: row.retry_skipped === true,
  }));
}
