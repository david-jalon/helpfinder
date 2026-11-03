import { createAdminClient } from "@/lib/supabase/admin";
import { getRecentCronRuns, type CronRunRow } from "./cron-runs";
import { metricSnapshot, type MetricSnapshot } from "./metrics";

/**
 * Foto de salud del sistema, pensada para `/api/health`.
 *
 * Combina dos fuentes:
 *  - Supabase: backlog real, alertas y últimas ejecuciones del cron.
 *  - Memoria del proceso: contadores de 429 y fallbacks de IA.
 *
 * `getHealthSnapshot` toca la base; `assessHealth` es pura y testeable.
 */

export type HealthSnapshot = {
  generatedAt: string;
  grants: {
    total: number;
    pendingEnrichment: number;
    /** Pendientes con más de 24 h: señal de que el reintento no avanza. */
    staleEnrichment: number;
    lastInsertAt: string | null;
  };
  alerts: {
    total: number;
    ok: number;
    fallback: number;
    pending: number;
  };
  cron: CronRunRow[];
  counters: MetricSnapshot;
};

export type HealthAssessment = {
  status: "healthy" | "degraded";
  checks: {
    pending_enrichment_ok: boolean;
    stale_enrichment_ok: boolean;
    cron_recent: boolean;
  };
};

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const CRON_RECENT_MS = 36 * 60 * 60 * 1000;

export async function getHealthSnapshot(
  now: Date = new Date()
): Promise<HealthSnapshot> {
  const supabase = createAdminClient();
  const staleCutoff = new Date(now.getTime() - STALE_AFTER_MS).toISOString();

  const [pending, stale, total, alertsTotal, alertsOk, alertsFallback, latest, cron] =
    await Promise.all([
      supabase
        .from("grants_seen")
        .select("*", { count: "exact", head: true })
        .is("enriched_at", null),
      supabase
        .from("grants_seen")
        .select("*", { count: "exact", head: true })
        .is("enriched_at", null)
        .lt("first_seen_at", staleCutoff),
      supabase.from("grants_seen").select("*", { count: "exact", head: true }),
      supabase
        .from("user_alerts")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("user_alerts")
        .select("*", { count: "exact", head: true })
        .eq("ai_status", "ok"),
      supabase
        .from("user_alerts")
        .select("*", { count: "exact", head: true })
        .eq("ai_status", "fallback"),
      supabase
        .from("grants_seen")
        .select("first_seen_at")
        .order("first_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getRecentCronRuns(5),
    ]);

  if (pending.error) throw pending.error;
  if (stale.error) throw stale.error;
  if (total.error) throw total.error;
  if (alertsTotal.error) throw alertsTotal.error;
  if (alertsOk.error) throw alertsOk.error;
  if (alertsFallback.error) throw alertsFallback.error;
  if (latest.error) throw latest.error;

  const alertTotal = alertsTotal.count ?? 0;
  const alertOk = alertsOk.count ?? 0;
  const alertFallback = alertsFallback.count ?? 0;

  return {
    generatedAt: now.toISOString(),
    grants: {
      total: total.count ?? 0,
      pendingEnrichment: pending.count ?? 0,
      staleEnrichment: stale.count ?? 0,
      lastInsertAt:
        latest.data && typeof latest.data.first_seen_at === "string"
          ? latest.data.first_seen_at
          : null,
    },
    alerts: {
      total: alertTotal,
      ok: alertOk,
      fallback: alertFallback,
      // Cualquier estado que no sea ok/fallback cuenta como pendiente
      // (incluye filas antiguas con ai_status nulo).
      pending: Math.max(0, alertTotal - alertOk - alertFallback),
    },
    cron,
    counters: metricSnapshot(),
  };
}

/**
 * Reglas de estado. `cron_recent` es `true` si aún no hay ninguna ejecución
 * registrada (recién desplegado): no hay nada que considere "viejo".
 */
export function assessHealth(
  snapshot: HealthSnapshot,
  now: Date = new Date()
): HealthAssessment {
  const lastRun = snapshot.cron[0];
  const cronRecent =
    !lastRun ||
    now.getTime() - Date.parse(lastRun.finishedAt) <= CRON_RECENT_MS;

  const checks = {
    pending_enrichment_ok: snapshot.grants.pendingEnrichment === 0,
    stale_enrichment_ok: snapshot.grants.staleEnrichment === 0,
    cron_recent: cronRecent,
  };

  const status = Object.values(checks).every(Boolean) ? "healthy" : "degraded";

  return { status, checks };
}
