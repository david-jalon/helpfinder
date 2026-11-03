import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isCronAuthorized: vi.fn(),
  dailyScan: vi.fn(),
  enrichBacklog: vi.fn(),
  recordCronRun: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => ({
  isCronAuthorized: mocks.isCronAuthorized,
}));

vi.mock("@/lib/grants/daily-scan", () => ({
  dailyScan: mocks.dailyScan,
}));

vi.mock("@/lib/grants/enrich-backlog", () => ({
  enrichBacklog: mocks.enrichBacklog,
}));

vi.mock("@/lib/observability/cron-runs", () => ({
  recordCronRun: mocks.recordCronRun,
}));

import { GET as dailyGET } from "@/app/api/cron/daily/route";
import { GET as enrichGET } from "@/app/api/cron/enrich/route";

const dailyResult = {
  totalFetched: 125,
  pagesFetched: 3,
  truncated: false,
  stopReason: "complete" as const,
  newGrantsCount: 12,
  enrichedCount: 10,
  enrichedFailed: 2,
  newPendingCount: 0,
  retryEnrichedCount: 0,
  retrySkipped: false,
  pendingBacklog: 0,
  durationMs: 1_008,
  newGrants: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isCronAuthorized.mockReturnValue(true);
  mocks.dailyScan.mockResolvedValue(dailyResult);
  mocks.recordCronRun.mockResolvedValue(undefined);
  mocks.enrichBacklog.mockResolvedValue({
    processed: 10,
    succeeded: 9,
    failed: 1,
    remaining: 0,
    dryRun: false,
  });
});

describe("GET /api/cron/daily", () => {
  it("responde 401 sin secreto y no ejecuta el escaneo", async () => {
    mocks.isCronAuthorized.mockReturnValue(false);

    const res = await dailyGET(new NextRequest("https://app.test/api/cron/daily"));

    expect(res.status).toBe(401);
    expect(mocks.dailyScan).not.toHaveBeenCalled();
    expect(mocks.recordCronRun).not.toHaveBeenCalled();
  });

  it("ejecuta el escaneo, registra la métrica y devuelve el resumen", async () => {
    const res = await dailyGET(new NextRequest("https://app.test/api/cron/daily"));
    const json = (await res.json()) as { ok: boolean; data: typeof dailyResult };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.newGrantsCount).toBe(12);
    expect(mocks.recordCronRun).toHaveBeenCalledWith({
      durationMs: 1_008,
      stopReason: "complete",
      pagesFetched: 3,
      newGrants: 12,
      enriched: 10,
      enrichedFailed: 2,
      pendingBacklog: 0,
      retrySkipped: false,
    });
  });

  it("responde 500 si el escaneo falla", async () => {
    mocks.dailyScan.mockRejectedValue(new Error("BDNS caído"));

    const res = await dailyGET(new NextRequest("https://app.test/api/cron/daily"));
    const json = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(500);
    expect(json.error).toContain("BDNS caído");
    expect(mocks.recordCronRun).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/enrich", () => {
  it("responde 401 sin secreto", async () => {
    mocks.isCronAuthorized.mockReturnValue(false);

    const res = await enrichGET(
      new NextRequest("https://app.test/api/cron/enrich?limit=20")
    );

    expect(res.status).toBe(401);
    expect(mocks.enrichBacklog).not.toHaveBeenCalled();
  });

  it("pasa limit y dryRun al backfill", async () => {
    const res = await enrichGET(
      new NextRequest("https://app.test/api/cron/enrich?limit=20&dryRun=1")
    );

    expect(res.status).toBe(200);
    expect(mocks.enrichBacklog).toHaveBeenCalledWith(20, true);
  });

  it("usa 50 por defecto si el limit no es válido", async () => {
    await enrichGET(
      new NextRequest("https://app.test/api/cron/enrich?limit=abc")
    );

    expect(mocks.enrichBacklog).toHaveBeenCalledWith(50, false);
  });

  it("responde 500 si el backfill falla", async () => {
    mocks.enrichBacklog.mockRejectedValue(new Error("boom"));

    const res = await enrichGET(
      new NextRequest("https://app.test/api/cron/enrich")
    );

    expect(res.status).toBe(500);
  });
});
