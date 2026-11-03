import { describe, expect, it } from "vitest";
import { assessHealth, type HealthSnapshot } from "@/lib/observability/health";

/**
 * `assessHealth` es la parte pura del healthcheck: recibe la foto y decide
 * si el sistema está sano. Los umbrales importan: un backlog pendiente no es
 * lo mismo que un backlog viejo (más de 24 h sin resolverse).
 */

const NOW = new Date("2026-11-03T12:00:00.000Z");

function snapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    generatedAt: NOW.toISOString(),
    grants: {
      total: 9_937,
      pendingEnrichment: 0,
      staleEnrichment: 0,
      lastInsertAt: "2026-11-03T06:35:00.000Z",
    },
    alerts: { total: 40, ok: 30, fallback: 10, pending: 0 },
    cron: [
      {
        startedAt: "2026-11-03T06:00:00.000Z",
        finishedAt: "2026-11-03T06:05:00.000Z",
        durationMs: 300_000,
        stopReason: "complete",
        pagesFetched: 3,
        newGrants: 12,
        enriched: 10,
        enrichedFailed: 2,
        pendingBacklog: 0,
        retrySkipped: false,
      },
    ],
    counters: { bdns_429: 0, ai_fallback: 0, enriched_failed: 0 },
    ...overrides,
  };
}

describe("assessHealth", () => {
  it("sin backlog ni retrasos → healthy", () => {
    const result = assessHealth(snapshot(), NOW);

    expect(result.status).toBe("healthy");
    expect(result.checks).toEqual({
      pending_enrichment_ok: true,
      stale_enrichment_ok: true,
      cron_recent: true,
    });
  });

  it("con pendientes de enriquecer → degraded", () => {
    const result = assessHealth(
      snapshot({
        grants: {
          total: 9_937,
          pendingEnrichment: 120,
          staleEnrichment: 0,
          lastInsertAt: null,
        },
      }),
      NOW
    );

    expect(result.status).toBe("degraded");
    expect(result.checks.pending_enrichment_ok).toBe(false);
  });

  it("con pendientes de más de 24 h → degraded", () => {
    const result = assessHealth(
      snapshot({
        grants: {
          total: 9_937,
          pendingEnrichment: 30,
          staleEnrichment: 30,
          lastInsertAt: null,
        },
      }),
      NOW
    );

    expect(result.status).toBe("degraded");
    expect(result.checks.stale_enrichment_ok).toBe(false);
  });

  it("si el último cron tiene más de 36 h → degraded", () => {
    const result = assessHealth(
      snapshot({
        cron: [
          {
            startedAt: "2026-11-01T06:00:00.000Z",
            finishedAt: "2026-11-01T06:05:00.000Z",
            durationMs: 300_000,
            stopReason: "complete",
            pagesFetched: 3,
            newGrants: 0,
            enriched: 0,
            enrichedFailed: 0,
            pendingBacklog: 0,
            retrySkipped: false,
          },
        ],
      }),
      NOW
    );

    expect(result.status).toBe("degraded");
    expect(result.checks.cron_recent).toBe(false);
  });

  it("sin ejecuciones registradas no marca el cron como caído", () => {
    const result = assessHealth(snapshot({ cron: [] }), NOW);

    expect(result.checks.cron_recent).toBe(true);
    expect(result.status).toBe("healthy");
  });
});
