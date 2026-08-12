import { describe, expect, it } from "vitest";
import type { SeenGrant } from "@/lib/grants/feed";
import type { Profile } from "@/lib/domain/profile";
import type { ScoreResult } from "@/lib/ai/grant-scorer";
import { matchGrants } from "@/lib/matching/matcher";
import {
  buildAlertDTOs,
  grantItemFromSeen,
} from "@/lib/dashboard/run-alerts";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: "u1",
    profileType: "sociedad",
    colectivos: [],
    regiones: ["madrileña"],
    keywords: "digitalización",
    contextText: "",
    geminiApiKey: "",
    notificationEmail: "",
    emailDigestEnabled: false,
    lastSeenAt: null,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function makeSeenGrant(overrides: Partial<SeenGrant> = {}): SeenGrant {
  return {
    numConvocatoria: "1",
    title: "Ayuda a la digitalización de pymes en Madrid",
    organization: "Comunidad de Madrid",
    sourceUrl: "https://example.com/1",
    publicationDate: null,
    firstSeenAt: "2026-08-05T04:00:00Z",
    eligibilityJson: {
      beneficiaryTypes: ["PYME", "Sociedades"],
      sectors: ["Digitalización"],
      impactRegions: ["ES13 - Comunidad de Madrid"],
      purpose: "Impulsar la digitalización",
      instrumentType: "Subvención",
    },
    enrichedAt: "2026-08-05T04:01:00Z",
    ...overrides,
  };
}

describe("grantItemFromSeen", () => {
  it("mapea la fila a GrantItem con campos de elegibilidad", () => {
    const item = grantItemFromSeen(makeSeenGrant());

    expect(item.id).toBe("1");
    expect(item.title).toBe("Ayuda a la digitalización de pymes en Madrid");
    expect(item.organization).toBe("Comunidad de Madrid");
    expect(item.sourceUrl).toBe("https://example.com/1");
    expect(item.beneficiaryTypes).toEqual(["PYME", "Sociedades"]);
    expect(item.sectors).toEqual(["Digitalización"]);
    expect(item.impactRegions).toEqual(["ES13 - Comunidad de Madrid"]);
    expect(item.purpose).toBe("Impulsar la digitalización");
    expect(item.instrumentType).toBe("Subvención");
  });

  it("tolera eligibility_json vacío o campos no string", () => {
    const item = grantItemFromSeen(
      makeSeenGrant({
        eligibilityJson: null,
      })
    );
    expect(item.beneficiaryTypes).toEqual([]);
    expect(item.sectors).toEqual([]);
    expect(item.impactRegions).toEqual([]);
    expect(item.purpose).toBeNull();
    expect(item.instrumentType).toBeNull();
  });
});

describe("buildAlertDTOs", () => {
  const profile = makeProfile();

  // Tres ayudas: una que encaja (matched), una que no (excluded) y una
  // sin señales (maybe).
  const grants = [
    makeSeenGrant({ numConvocatoria: "a" }),
    makeSeenGrant({
      numConvocatoria: "b",
      title: "Ayuda solo para autónomos",
      eligibilityJson: {
        beneficiaryTypes: ["Autónomos"],
        sectors: [],
        impactRegions: ["ES61 - Andalucía"],
        purpose: "",
        instrumentType: null,
      },
    }),
    makeSeenGrant({
      numConvocatoria: "c",
      title: "Ayuda nacional genérica sin señales",
      eligibilityJson: {
        beneficiaryTypes: [],
        sectors: [],
        impactRegions: ["XXXX - TODO EL MUNDO"],
        purpose: null,
        instrumentType: null,
      },
    }),
  ];

  const items = grants.map(grantItemFromSeen);
  const outcome = matchGrants(profile, items);

  const okScore: ScoreResult = {
    status: "ok",
    results: [
      { grantId: "a", score: 88, reason: "Encaja con tu sector y región" },
    ],
    model: "gemini-3.6-flash",
  };

  const fallbackScore: ScoreResult = {
    status: "fallback",
    results: [
      { grantId: "a", score: 70, reason: "Encaje por reglas: Coincide con tu región" },
    ],
    message: "Sin API key de Gemini configurada",
  };

  it("con IA ok: matched lleva score+reason y aiStatus ok", () => {
    const dtos = buildAlertDTOs(grants, outcome, okScore);

    const matched = dtos.find((d) => d.bucket === "matched");
    expect(matched).toBeDefined();
    expect(matched?.grantId).toBe("a");
    expect(matched?.score).toBe(88);
    expect(matched?.reason).toContain("Encaja");
    expect(matched?.aiStatus).toBe("ok");
    expect(matched?.impactRegions).toEqual(["Comunidad de Madrid"]);
  });

  it("no genera DTO para las ayudas excluidas", () => {
    const dtos = buildAlertDTOs(grants, outcome, okScore);

    expect(dtos.find((d) => d.bucket === "excluded")).toBeUndefined();
    expect(dtos.map((d) => d.grantId)).not.toContain("b");
  });

  it("un maybe no puntuado queda sin score y 'pending'", () => {
    const dtos = buildAlertDTOs(grants, outcome, okScore);

    const maybe = dtos.find((d) => d.bucket === "maybe");
    expect(maybe).toBeDefined();
    expect(maybe?.grantId).toBe("c");
    expect(maybe?.score).toBeNull();
    expect(maybe?.reason).toBeNull();
    expect(maybe?.aiStatus).toBe("pending");
  });

  it("con fallback: matched refleja el fallback del scorer", () => {
    const dtos = buildAlertDTOs(grants, outcome, fallbackScore);

    const matched = dtos.find((d) => d.bucket === "matched");
    expect(matched?.score).toBe(70);
    expect(matched?.reason).toContain("Coincide con tu región");
    expect(matched?.aiStatus).toBe("fallback");
  });

  it("sin scoreResult: matched queda sin puntuar y 'pending'", () => {
    const dtos = buildAlertDTOs(grants, outcome, null);

    const matched = dtos.find((d) => d.bucket === "matched");
    expect(matched?.score).toBeNull();
    expect(matched?.reason).toBeNull();
    expect(matched?.aiStatus).toBe("pending");
  });
});
