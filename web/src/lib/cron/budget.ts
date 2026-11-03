/**
 * Presupuesto de tiempo de una función serverless.
 *
 * El cron no puede ejecutarse indefinidamente: Vercel mata la función al
 * llegar a `maxDuration` y lo que quedaba a medias se pierde. En vez de
 * arriesgarse, medimos el tiempo transcurrido y dejamos de empezar trabajo
 * nuevo cuando queda poco margen. Lo ya hecho se guarda y el resto se
 * retoma en la siguiente ejecución.
 *
 * Es puro y recibe `now` para poder testearlo sin esperas reales.
 */

export type TimeBudget = {
  /** Duración total concedida, en ms. */
  totalMs: number;
  /** Tiempo consumido desde que se creó el presupuesto. */
  elapsedMs: () => number;
  /** Tiempo que queda (nunca negativo). */
  remainingMs: () => number;
  /** true cuando ya no queda tiempo. */
  expired: () => boolean;
  /** true si queda al menos `ms` de margen. */
  hasAtLeast: (ms: number) => boolean;
};

const MIN_TOTAL_MS = 5_000;
const MAX_TOTAL_MS = 290_000;
const DEFAULT_TOTAL_MS = 250_000;

export function createTimeBudget(
  totalMs: number,
  now: () => number = Date.now
): TimeBudget {
  const safeTotal =
    Number.isFinite(totalMs) && totalMs > 0 ? Math.floor(totalMs) : 0;
  const startedAt = now();

  const elapsedMs = () => Math.max(0, now() - startedAt);
  const remainingMs = () => Math.max(0, safeTotal - elapsedMs());

  return {
    totalMs: safeTotal,
    elapsedMs,
    remainingMs,
    expired: () => remainingMs() <= 0,
    hasAtLeast: (ms) => remainingMs() >= Math.max(0, ms),
  };
}

/**
 * Presupuesto del cron, configurable con `CRON_TIME_BUDGET_MS`.
 *
 * El valor por defecto (250 s) deja ~50 s de margen sobre los 300 s que
 * permite Vercel en el plan Hobby, para guardar el progreso y responder.
 */
export function getCronBudgetMs(
  raw: string | undefined = process.env.CRON_TIME_BUDGET_MS
): number {
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TOTAL_MS;

  return Math.min(MAX_TOTAL_MS, Math.max(MIN_TOTAL_MS, Math.floor(parsed)));
}
