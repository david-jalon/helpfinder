import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { HealthSnapshot } from "@/lib/observability/health";

const mocks = vi.hoisted(() => ({
  isCronAuthorized: vi.fn(),
  getHealthSnapshot: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => ({
  isCronAuthorized: mocks.isCronAuthorized,
}));

vi.mock("@/lib/observability/health", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/observability/health")>();
  return {
    ...actual,
    getHealthSnapshot: mocks.getHealthSnapshot,
  };
});

import { GET } from "@/app/api/health/route";

function request(): NextRequest {
  return new NextRequest("https://app.test/api/health", {
    headers: { Authorization: "Bearer test" },
  });
}

function snapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    generatedAt: "2026-11-03T12:00:00.000Z",
    grants: {
      total: 9_937,
      pendingEnrichment: 0,
      staleEnrichment: 0,
      lastInsertAt: "2026-11-03T06:35:00.000Z",
    },
    alerts: { total: 40, ok: 30, fallback: 10, pending: 0 },
    cron: [],
    counters: { bdns_429: 0, ai_fallback: 0, enriched_failed: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isCronAuthorized.mockReturnValue(true);
  mocks.getHealthSnapshot.mockResolvedValue(snapshot());
});

describe("GET /api/health", () => {
  it("responde 401 sin secreto y no consulta la base", async () => {
    mocks.isCronAuthorized.mockReturnValue(false);

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(mocks.getHealthSnapshot).not.toHaveBeenCalled();
  });

  it("devuelve la foto y el estado", async () => {
    const res = await GET(request());
    const json = (await res.json()) as {
      ok: boolean;
      status: string;
      checks: Record<string, boolean>;
      data: HealthSnapshot;
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.status).toBe("healthy");
    expect(json.checks.stale_enrichment_ok).toBe(true);
    expect(json.data.grants.total).toBe(9_937);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("marca degraded si hay backlog viejo", async () => {
    mocks.getHealthSnapshot.mockResolvedValue(
      snapshot({
        grants: {
          total: 9_937,
          pendingEnrichment: 5,
          staleEnrichment: 5,
          lastInsertAt: null,
        },
      })
    );

    const res = await GET(request());
    const json = (await res.json()) as { status: string };

    expect(json.status).toBe("degraded");
  });

  it("devuelve 500 genérico si falla la consulta", async () => {
    mocks.getHealthSnapshot.mockRejectedValue(new Error("db caída"));

    const res = await GET(request());
    const json = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.error).not.toContain("db caída");
  });
});
