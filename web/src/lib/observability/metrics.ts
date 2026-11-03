/**
 * Contadores de salud del proceso.
 *
 * Son deliberadamente simples: viven en memoria de la instancia. En Vercel
 * cada instancia tiene los suyos, así que sirven para ver la actividad
 * reciente de la función que atiende `/api/health`, no como serie histórica.
 * Las métricas que sí necesitan historia (backlog, alertas, duración del
 * cron) se leen de Supabase, que es la fuente de verdad.
 *
 * No importa nada de Next ni de Supabase: se puede usar desde cualquier capa.
 */

export type MetricName = "bdns_429" | "ai_fallback" | "enriched_failed";

export type MetricSnapshot = Record<MetricName, number>;

const counters: MetricSnapshot = {
  bdns_429: 0,
  ai_fallback: 0,
  enriched_failed: 0,
};

export function incrementMetric(name: MetricName, by = 1): void {
  if (!Number.isFinite(by) || by <= 0) return;
  counters[name] += by;
}

export function metricSnapshot(): MetricSnapshot {
  return { ...counters };
}

/** Solo para tests: deja los contadores a cero. */
export function resetMetrics(): void {
  counters.bdns_429 = 0;
  counters.ai_fallback = 0;
  counters.enriched_failed = 0;
}
