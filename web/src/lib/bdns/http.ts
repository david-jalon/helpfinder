/**
 * Cliente HTTP compartido para la API BDNS.
 *
 * Centraliza tres cosas que antes estaban dispersas:
 *  - concurrencia máxima (BDNS devuelve 429 con ráfagas de 5),
 *  - intervalo mínimo entre peticiones,
 *  - reintentos con backoff y respeto de `Retry-After`.
 *
 * El estado es por proceso. En Vercel cada instancia tiene su propio
 * scheduler; es suficiente para no saturar BDNS desde una misma función.
 */

export type BdnsHttpConfig = {
  maxConcurrency: number;
  minIntervalMs: number;
  retries: number;
  timeoutMs: number;
  retryBaseMs: number;
  retryAfterMaxMs: number;
};

function envNumber(
  name: string,
  fallback: number,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {}
): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getBdnsHttpConfig(): BdnsHttpConfig {
  return {
    maxConcurrency: Math.floor(envNumber("BDNS_MAX_CONCURRENCY", 2, { min: 1, max: 4 })),
    minIntervalMs: envNumber("BDNS_MIN_INTERVAL_MS", 200, { min: 0, max: 5_000 }),
    retries: Math.floor(envNumber("BDNS_RETRIES", 2, { min: 0, max: 5 })),
    timeoutMs: envNumber("BDNS_TIMEOUT_MS", 12_000, { min: 1_000, max: 30_000 }),
    retryBaseMs: envNumber("BDNS_RETRY_BASE_MS", 500, { min: 1, max: 10_000 }),
    retryAfterMaxMs: envNumber("BDNS_RETRY_AFTER_MAX_MS", 5_000, {
      min: 0,
      max: 30_000,
    }),
  };
}

export class BdnsHttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`BDNS respondió ${status} en ${new URL(url).pathname}`);
    this.name = "BdnsHttpError";
    this.status = status;
  }
}

export class BdnsTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`BDNS no respondió en ${timeoutMs} ms`);
    this.name = "BdnsTimeoutError";
  }
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function isRetryableError(error: unknown): boolean {
  // Un timeout no se reintenta en la misma llamada: multiplicaría la espera
  // (3 intentos × timeout) y bloquearía el backfill. La fila queda pendiente
  // para la siguiente pasada.
  if (error instanceof BdnsTimeoutError) return false;
  if (error instanceof DOMException && error.name === "AbortError") return false;
  // Los fallos de red de `fetch` son TypeError. Un error de programación no
  // debería reintentarse indefinidamente.
  return error instanceof TypeError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

function backoffDelay(
  attempt: number,
  cfg: BdnsHttpConfig,
  retryAfterMs: number | null
): number {
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, cfg.retryAfterMaxMs);
  }
  return cfg.retryBaseMs * 2 ** attempt + Math.random() * cfg.retryBaseMs;
}

/* ------------------------------------------------------------------ */
/*  Scheduler: concurrencia + intervalo mínimo                         */
/* ------------------------------------------------------------------ */

let active = 0;
let nextStart = 0;
const waiters: Array<() => void> = [];

async function acquire(cfg: BdnsHttpConfig): Promise<void> {
  while (active >= cfg.maxConcurrency) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }

  active += 1;

  const now = Date.now();
  const startAt = Math.max(now, nextStart);
  nextStart = startAt + cfg.minIntervalMs;

  if (startAt > now) {
    await sleep(startAt - now);
  }
}

function release(): void {
  active -= 1;
  const next = waiters.shift();
  if (next) next();
}

async function withSlot<T>(
  cfg: BdnsHttpConfig,
  task: () => Promise<T>
): Promise<T> {
  await acquire(cfg);
  try {
    return await task();
  } finally {
    release();
  }
}

async function fetchOnce(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Timeout", "TimeoutError"));
  }, timeoutMs);

  const signal =
    init?.signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;

  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new BdnsTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function logRetry(
  url: string,
  attempt: number,
  status: number | null,
  error: unknown
): void {
  if (process.env.NODE_ENV === "test") return;
  console.warn(
    JSON.stringify({
      event: "bdns_retry",
      attempt,
      status,
      path: new URL(url).pathname,
      error: error instanceof Error ? error.message : null,
    })
  );
}

/**
 * Hace una petición a BDNS con concurrencia limitada y reintentos.
 * Devuelve la última `Response` aunque no sea 2xx (el llamador decide).
 */
export async function bdnsFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const cfg = getBdnsHttpConfig();

  for (let attempt = 0; attempt <= cfg.retries; attempt += 1) {
    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      const response = await withSlot(cfg, () =>
        fetchOnce(url, init, cfg.timeoutMs)
      );

      if (response.ok) return response;

      if (!isRetryableStatus(response.status) || attempt === cfg.retries) {
        return response;
      }

      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      logRetry(url, attempt + 1, response.status, null);
      await sleep(backoffDelay(attempt, cfg, retryAfter));
    } catch (error) {
      if (!isRetryableError(error) || attempt === cfg.retries) {
        throw error;
      }
      logRetry(url, attempt + 1, null, error);
      await sleep(backoffDelay(attempt, cfg, null));
    }
  }

  throw new Error("BDNS: estado de reintentos inalcanzable");
}

/** Variante que exige 2xx y devuelve el JSON ya parseado. */
export async function bdnsFetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await bdnsFetch(url, init);
  if (!response.ok) {
    throw new BdnsHttpError(response.status, url);
  }
  return (await response.json()) as T;
}

/** Solo para tests: limpia el estado global del scheduler. */
export function resetBdnsHttpForTests(): void {
  active = 0;
  nextStart = 0;
  waiters.length = 0;
}
