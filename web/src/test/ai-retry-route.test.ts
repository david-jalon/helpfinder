import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/domain/profile";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getProfile: vi.fn(),
  getAlertsNeedingAi: vi.fn(),
  updateAlertAiResults: vi.fn(),
  getGrantsSeenByIds: vi.fn(),
  hasAiConfigured: vi.fn(),
  scoreGrantsForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db", () => ({
  getProfile: mocks.getProfile,
  getAlertsNeedingAi: mocks.getAlertsNeedingAi,
  updateAlertAiResults: mocks.updateAlertAiResults,
}));

vi.mock("@/lib/grants/feed", () => ({
  getGrantsSeenByIds: mocks.getGrantsSeenByIds,
}));

vi.mock("@/lib/ai/grant-scorer", () => ({
  hasAiConfigured: mocks.hasAiConfigured,
  scoreGrantsForUser: mocks.scoreGrantsForUser,
}));

vi.mock("@/lib/dashboard/run-alerts", () => ({
  grantItemFromSeen: (row: { numConvocatoria: string; title: string }) => ({
    id: row.numConvocatoria,
    title: row.title,
    organization: null,
    publicationDate: null,
    amount: null,
    sourceUrl: null,
    beneficiaryTypes: [],
    sectors: [],
    impactRegions: [],
    purpose: null,
    instrumentType: null,
  }),
}));

import { POST } from "@/app/api/dashboard/ai-retry/route";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: "u1",
    profileType: "persona",
    colectivos: [],
    regiones: ["madrileña"],
    keywords: "",
    contextText: "",
    geminiApiKey: "AIza-test",
    notificationEmail: "",
    emailDigestEnabled: false,
    lastSeenAt: null,
    lastSeenSeq: null,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function makeAlertRow(id: string, grantId: string) {
  return {
    id,
    grant_id: grantId,
    score: null,
    ai_reason: null,
    match_reasons: ["Coincide con tu región"],
    ai_status: "pending",
    bucket: "matched",
    decision: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
  mocks.getProfile.mockResolvedValue(makeProfile());
  mocks.hasAiConfigured.mockReturnValue(true);
  mocks.getAlertsNeedingAi.mockResolvedValue([]);
  mocks.getGrantsSeenByIds.mockResolvedValue([]);
  mocks.updateAlertAiResults.mockResolvedValue(undefined);
});

describe("POST /api/dashboard/ai-retry", () => {
  it("responde 401 sin sesión", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(401);
  });

  it("responde 400 si falta el perfil", async () => {
    mocks.getProfile.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(400);
    expect((await res.json()).needsProfile).toBe(true);
  });

  it("responde 400 sin API key y no toca alertas", async () => {
    mocks.hasAiConfigured.mockReturnValue(false);

    const res = await POST();

    expect(res.status).toBe(400);
    expect((await res.json()).kind).toBe("no-key");
    expect(mocks.getAlertsNeedingAi).not.toHaveBeenCalled();
  });

  it("con cero alertas responde ok y no llama a Gemini", async () => {
    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.updated).toBe(0);
    expect(mocks.scoreGrantsForUser).not.toHaveBeenCalled();
  });

  it("re-puntúa y actualiza las alertas persistidas", async () => {
    mocks.getAlertsNeedingAi.mockResolvedValue([
      makeAlertRow("alert-1", "1"),
      makeAlertRow("alert-2", "2"),
    ]);
    mocks.getGrantsSeenByIds.mockResolvedValue([
      { numConvocatoria: "1", title: "Ayuda 1" },
      { numConvocatoria: "2", title: "Ayuda 2" },
    ]);
    mocks.scoreGrantsForUser.mockResolvedValue({
      status: "ok",
      model: "test-model",
      results: [
        { grantId: "1", score: 88, reason: "Encaja" },
        { grantId: "2", score: 75, reason: "Encaja bastante" },
      ],
    });

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.updated).toBe(2);
    expect(json.data.pending).toBe(0);
    expect(mocks.updateAlertAiResults).toHaveBeenCalledWith("u1", [
      { alertId: "alert-1", score: 88, reason: "Encaja", status: "ok" },
      {
        alertId: "alert-2",
        score: 75,
        reason: "Encaja bastante",
        status: "ok",
      },
    ]);
  });

  it("si Gemini cae a fallback, guarda las alertas puntuadas y deja pendientes las demás", async () => {
    mocks.getAlertsNeedingAi.mockResolvedValue([
      makeAlertRow("alert-1", "1"),
      makeAlertRow("alert-2", "2"),
    ]);
    mocks.getGrantsSeenByIds.mockResolvedValue([
      { numConvocatoria: "1", title: "Ayuda 1" },
      { numConvocatoria: "2", title: "Ayuda 2" },
    ]);
    mocks.scoreGrantsForUser.mockResolvedValue({
      status: "fallback",
      kind: "transient",
      message: "Gemini saturado",
      results: [{ grantId: "1", score: 70, reason: "Encaje por reglas" }],
    });

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.updated).toBe(1);
    expect(json.data.pending).toBe(1);
    expect(json.data.aiStatus).toBe("fallback");
    expect(mocks.updateAlertAiResults).toHaveBeenCalledWith("u1", [
      {
        alertId: "alert-1",
        score: 70,
        reason: "Encaje por reglas",
        status: "fallback",
      },
    ]);
  });
});
