import { describe, expect, it } from "vitest";
import type { SeenGrant } from "@/lib/grants/feed";
import type { AlertDTO } from "@/lib/dashboard/run-alerts";
import {
  buildTabSummary,
  isAlertDecision,
  mergeAlertLists,
  persistedAlertDTO,
  type PersistedAlertRow,
} from "@/lib/dashboard/run-alerts";

function makeRow(overrides: Partial<PersistedAlertRow> = {}): PersistedAlertRow {
  return {
    id: "alert-1",
    grant_id: "a",
    score: 88,
    ai_reason: "Encaja con tu sector",
    match_reasons: ["Coincide con tu región"],
    ai_status: "ok",
    bucket: "matched",
    decision: null,
    ...overrides,
  };
}

function makeGrant(overrides: Partial<SeenGrant> = {}): SeenGrant {
  return {
    numConvocatoria: "a",
    title: "Ayuda a la digitalización",
    organization: "Comunidad de Madrid",
    sourceUrl: "https://example.com/a",
    firstSeenAt: "2026-08-05T04:00:00Z",
    eligibilityJson: null,
    enrichedAt: null,
    ...overrides,
  };
}

function makeDto(overrides: Partial<AlertDTO> = {}): AlertDTO {
  return {
    id: "alert-1",
    grantId: "a",
    title: "Ayuda a la digitalización",
    organization: "Comunidad de Madrid",
    sourceUrl: "https://example.com/a",
    bucket: "matched",
    score: 88,
    reason: "Encaja con tu sector",
    matchReasons: [],
    aiStatus: "ok",
    decision: null,
    ...overrides,
  };
}

describe("persistedAlertDTO", () => {
  it("mapea fila + grant a un DTO con triaje y metadatos", () => {
    const dto = persistedAlertDTO(
      makeRow({ decision: "seguir" }),
      makeGrant()
    );

    expect(dto.id).toBe("alert-1");
    expect(dto.grantId).toBe("a");
    expect(dto.title).toBe("Ayuda a la digitalización");
    expect(dto.organization).toBe("Comunidad de Madrid");
    expect(dto.sourceUrl).toBe("https://example.com/a");
    expect(dto.bucket).toBe("matched");
    expect(dto.score).toBe(88);
    expect(dto.reason).toContain("sector");
    expect(dto.aiStatus).toBe("ok");
    expect(dto.decision).toBe("seguir");
  });

  it("tolera score numérico como string (numeric de PG)", () => {
    const dto = persistedAlertDTO(makeRow({ score: "70" as never }), null);
    expect(dto.score).toBe(70);
  });

  it("sin grant: título cae al id y sin enlace", () => {
    const dto = persistedAlertDTO(makeRow(), null);
    expect(dto.title).toBe("a");
    expect(dto.organization).toBeNull();
    expect(dto.sourceUrl).toBeNull();
  });

  it("sanea valores inválidos de bucket, ai_status y decision", () => {
    const dto = persistedAlertDTO(
      makeRow({
        bucket: "raro",
        ai_status: "raro",
        decision: "denegar",
      }),
      null
    );
    expect(dto.bucket).toBe("excluded");
    expect(dto.aiStatus).toBe("pending");
    expect(dto.decision).toBeNull();
  });
});

describe("mergeAlertLists", () => {
  it("lo fresco va primero y conserva la decisión persistida", () => {
    const fresh = makeDto({ grantId: "a", score: 95 });
    const persisted = makeDto({ grantId: "a", score: 88, decision: "denegada" });

    const merged = mergeAlertLists([fresh], [persisted]);

    expect(merged).toHaveLength(1);
    expect(merged[0].grantId).toBe("a");
    expect(merged[0].score).toBe(95); // gana el score fresco
    expect(merged[0].decision).toBe("denegada"); // pero se conserva el triaje
  });

  it("sin contrapartida persistida: el fresco se queda con su decision", () => {
    const fresh = makeDto({ grantId: "a", decision: "posible" });
    const merged = mergeAlertLists([fresh], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].decision).toBe("posible");
  });

  it("los persistidos sin contrapartida se añaden después, en su orden", () => {
    const older = makeDto({ id: "x", grantId: "x", decision: "seguir" });
    const newest = makeDto({ id: "y", grantId: "y", decision: null });
    const fresh = makeDto({ id: "z", grantId: "z" });

    const merged = mergeAlertLists([fresh], [newest, older]);

    expect(merged.map((a) => a.grantId)).toEqual(["z", "y", "x"]);
  });

  it("no duplica ayudas repetidas en persistidos", () => {
    const a = makeDto({ id: "a1", grantId: "a", decision: "seguir" });
    const a2 = makeDto({ id: "a2", grantId: "a", decision: "posible" });

    const merged = mergeAlertLists([], [a, a2]);
    expect(merged).toHaveLength(1);
    expect(merged[0].decision).toBe("seguir");
  });
});

describe("isAlertDecision", () => {
  it("acepta los tres triajes y null (deshacer)", () => {
    expect(isAlertDecision("seguir")).toBe(true);
    expect(isAlertDecision("posible")).toBe(true);
    expect(isAlertDecision("denegada")).toBe(true);
    expect(isAlertDecision(null)).toBe(true);
  });

  it("rechaza todo lo demás", () => {
    expect(isAlertDecision(undefined)).toBe(false);
    expect(isAlertDecision("denegar")).toBe(false);
    expect(isAlertDecision("")).toBe(false);
    expect(isAlertDecision(0)).toBe(false);
    expect(isAlertDecision({})).toBe(false);
  });
});

describe("buildTabSummary", () => {
  it("cuenta por estado del diario", () => {
    const alerts = [
      makeDto({ grantId: "a", decision: null }),
      makeDto({ grantId: "b", decision: "seguir" }),
      makeDto({ grantId: "c", decision: "seguir" }),
      makeDto({ grantId: "d", decision: "posible" }),
      makeDto({ grantId: "e", decision: "denegada" }),
      makeDto({ grantId: "f", decision: "denegada" }),
      makeDto({ grantId: "g", decision: "denegada" }),
    ];

    const summary = buildTabSummary(alerts);

    expect(summary).toEqual({
      pendientes: 1,
      seguimiento: 2,
      posibles: 1,
      denegadas: 3,
      total: 7,
    });
  });
});
