import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BdnsTimeoutError,
  bdnsFetch,
  getBdnsHttpConfig,
  isRetryableStatus,
  parseRetryAfter,
  resetBdnsHttpForTests,
} from "@/lib/bdns/http";

/**
 * Tests del scheduler HTTP de BDNS (Fase 3).
 * Usan un `fetch` falso y envs pequeñas para no depender de la red.
 */

beforeEach(() => {
  resetBdnsHttpForTests();
  vi.stubEnv("BDNS_MAX_CONCURRENCY", "2");
  vi.stubEnv("BDNS_MIN_INTERVAL_MS", "0");
  vi.stubEnv("BDNS_RETRIES", "2");
  vi.stubEnv("BDNS_RETRY_BASE_MS", "1");
  vi.stubEnv("BDNS_RETRY_AFTER_MAX_MS", "50");
  vi.stubEnv("BDNS_TIMEOUT_MS", "1000");
});

afterEach(() => {
  resetBdnsHttpForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("configuración", () => {
  it("lee los valores de entorno y acota los rangos", () => {
    const cfg = getBdnsHttpConfig();
    expect(cfg.maxConcurrency).toBe(2);
    expect(cfg.minIntervalMs).toBe(0);
    expect(cfg.retries).toBe(2);
    expect(cfg.timeoutMs).toBe(1000);

    vi.stubEnv("BDNS_MAX_CONCURRENCY", "99");
    expect(getBdnsHttpConfig().maxConcurrency).toBe(4);
  });

  it("parsea Retry-After en segundos y en fecha", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("no-es-numero")).toBeNull();

    const date = new Date(Date.now() + 3000).toUTCString();
    const parsed = parseRetryAfter(date);
    expect(parsed).not.toBeNull();
    expect(parsed!).toBeGreaterThan(0);
  });

  it("clasifica los estados reintentables", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe("reintentos", () => {
  it("reintenta un 429 y devuelve el 200 posterior", async () => {
    let calls = 0;
    const fakeFetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("{}", {
          status: 429,
          headers: { "Retry-After": "0" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fakeFetch);

    const res = await bdnsFetch("https://bdns.test/convocatorias");

    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("respeta la concurrencia máxima", async () => {
    let active = 0;
    let maxActive = 0;

    const fakeFetch = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fakeFetch);

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        bdnsFetch(`https://bdns.test/${index}`)
      )
    );

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(fakeFetch).toHaveBeenCalledTimes(6);
  });

  it("lanza timeout si BDNS no responde", async () => {
    vi.stubEnv("BDNS_TIMEOUT_MS", "1000");
    vi.stubEnv("BDNS_RETRIES", "0");
    const fakeFetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );
    vi.stubGlobal("fetch", fakeFetch);

    await expect(bdnsFetch("https://bdns.test/slow")).rejects.toBeInstanceOf(
      BdnsTimeoutError
    );
  }, 5000);
});
