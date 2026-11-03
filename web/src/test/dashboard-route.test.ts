import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getProfile: vi.fn(),
  getAlertsForCurrentUser: vi.fn(),
  countAlertsForCurrentUser: vi.fn(),
  countAlertsNeedingAi: vi.fn(),
  updateAlertBuckets: vi.fn(),
  deleteAlerts: vi.fn(),
  getGrantsSeenByIds: vi.fn(),
  runAlerts: vi.fn(),
  rebucketPersisted: vi.fn(),
  mergeAlertLists: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db", () => ({
  getProfile: mocks.getProfile,
  getAlertsForCurrentUser: mocks.getAlertsForCurrentUser,
  countAlertsForCurrentUser: mocks.countAlertsForCurrentUser,
  countAlertsNeedingAi: mocks.countAlertsNeedingAi,
  updateAlertBuckets: mocks.updateAlertBuckets,
  deleteAlerts: mocks.deleteAlerts,
}));

vi.mock("@/lib/grants/feed", () => ({
  getGrantsSeenByIds: mocks.getGrantsSeenByIds,
}));

vi.mock("@/lib/ai/grant-scorer", () => ({
  hasAiConfigured: () => true,
}));

vi.mock("@/lib/dashboard/run-alerts", () => ({
  runAlerts: mocks.runAlerts,
  rebucketPersisted: mocks.rebucketPersisted,
  mergeAlertLists: mocks.mergeAlertLists,
}));

import { GET, POST } from "@/app/api/dashboard/route";

/**
 * El GET del dashboard debe ser SOLO LECTURA: ni IA ni escrituras.
 * El POST es el que abre el panel (genera alertas y persiste).
 */

function request(path = "/api/dashboard?page=1&limit=50"): NextRequest {
  return new NextRequest(`https://app.test${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
  mocks.getProfile.mockResolvedValue({ userId: "u1", lastSeenSeq: 0 });
  mocks.getAlertsForCurrentUser.mockResolvedValue([]);
  mocks.countAlertsForCurrentUser.mockResolvedValue(0);
  mocks.countAlertsNeedingAi.mockResolvedValue(0);
  mocks.getGrantsSeenByIds.mockResolvedValue([]);
  mocks.rebucketPersisted.mockReturnValue({
    alerts: [],
    updates: [{ grantId: "g1", bucket: "matched", matchReasons: [] }],
    deletes: ["a1"],
  });
  mocks.mergeAlertLists.mockReturnValue([]);
  mocks.runAlerts.mockResolvedValue({
    alerts: [],
    aiStatus: "ok",
    aiMessage: null,
    aiConfigured: true,
    aiKind: null,
  });
});

describe("GET /api/dashboard (solo lectura)", () => {
  it("no llama a la IA ni escribe buckets/borrados", async () => {
    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(mocks.runAlerts).not.toHaveBeenCalled();
    expect(mocks.updateAlertBuckets).not.toHaveBeenCalled();
    expect(mocks.deleteAlerts).not.toHaveBeenCalled();
  });

  it("responde 401 sin sesión", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const res = await GET(request());

    expect(res.status).toBe(401);
  });

  it("indica needsProfile si no hay perfil", async () => {
    mocks.getProfile.mockResolvedValue(null);

    const res = await GET(request());
    const json = (await res.json()) as { needsProfile?: boolean };

    expect(json.needsProfile).toBe(true);
    expect(mocks.runAlerts).not.toHaveBeenCalled();
  });
});

describe("POST /api/dashboard (abrir panel)", () => {
  it("ejecuta runAlerts y persiste el re-bucketeo", async () => {
    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(mocks.runAlerts).toHaveBeenCalledWith({
      userId: "u1",
      lastSeenSeq: 0,
    });
    expect(mocks.updateAlertBuckets).toHaveBeenCalledWith("u1", [
      { grantId: "g1", bucket: "matched", matchReasons: [] },
    ]);
    expect(mocks.deleteAlerts).toHaveBeenCalledWith("u1", ["a1"]);
  });

  it("responde 401 sin sesión", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(mocks.runAlerts).not.toHaveBeenCalled();
  });
});
