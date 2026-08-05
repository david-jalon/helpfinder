import { describe, expect, it } from "vitest";
import type { GrantItem } from "@/lib/domain/grants";
import type { Profile } from "@/lib/domain/profile";
import {
  matchGrant,
  matchGrants,
  matchesBeneficiary,
  matchesRegion,
  matchesKeywords,
  normalizeText,
} from "@/lib/matching/matcher";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: "u1",
    profileType: "sociedad",
    colectivos: [],
    regiones: ["madrileña"],
    keywords: "digitalización, formación",
    contextText: "",
    geminiApiKey: "",
    notificationEmail: "",
    emailDigestEnabled: false,
    lastSeenAt: null,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function makeGrant(overrides: Partial<GrantItem> = {}): GrantItem {
  return {
    id: "1",
    title: "Ayuda a la digitalización de pymes en Madrid",
    organization: "Comunidad de Madrid",
    publicationDate: null,
    deadlineDate: null,
    amount: null,
    sourceUrl: null,
    beneficiaryTypes: ["PYME", "Sociedades"],
    sectors: ["Digitalización"],
    impactRegions: ["ES13 - Comunidad de Madrid"],
    purpose: "Impulsar la digitalización de empresas",
    instrumentType: "Subvención",
    ...overrides,
  };
}

describe("normalizeText", () => {
  it("quita acentos y pasa a minúsculas", () => {
    expect(normalizeText("Personas Físicas — Madrid")).toBe("personas fisicas madrid");
  });

  it("normaliza la ñ y la ü", () => {
    expect(normalizeText("ESPAÑA · Bilingüe")).toBe("espana bilingue");
  });
});

describe("matchesBeneficiary (regla dura)", () => {
  it("sociedad encaja con PYME", () => {
    const profile = makeProfile();
    expect(matchesBeneficiary(profile, makeGrant())).toBe(true);
  });

  it("sociedad NO encaja si solo acepta autónomos", () => {
    const profile = makeProfile();
    const grant = makeGrant({ beneficiaryTypes: ["Autónomos", "Trabajadores autónomos"] });
    expect(matchesBeneficiary(profile, grant)).toBe(false);
  });

  it("persona NO encaja si solo acepta personas jurídicas", () => {
    const profile = makeProfile({ profileType: "persona" });
    const grant = makeGrant({ beneficiaryTypes: ["Personas jurídicas"] });
    expect(matchesBeneficiary(profile, grant)).toBe(false);
  });

  it("sin datos de beneficiario la regla dura no descarta (dato incompleto)", () => {
    const profile = makeProfile();
    const grant = makeGrant({ beneficiaryTypes: [] });
    expect(matchesBeneficiary(profile, grant)).toBe(true);
  });

  it("perfil 'otros' nunca descarta por beneficiario", () => {
    const profile = makeProfile({ profileType: "otros" });
    const grant = makeGrant({ beneficiaryTypes: ["Autónomos"] });
    expect(matchesBeneficiary(profile, grant)).toBe(true);
  });
});

describe("matchesRegion (regla blanda)", () => {
  it("detecta la región en el texto BDNS", () => {
    const profile = makeProfile();
    const grant = makeGrant();
    expect(matchesRegion(profile, grant)).toBe(true);
  });

  it("no coincide cuando la región es distinta", () => {
    const profile = makeProfile();
    const grant = makeGrant({ impactRegions: ["ES61 - Andalucía"] });
    expect(matchesRegion(profile, grant)).toBe(false);
  });

  it("sin regiones en el perfil no hay señal", () => {
    const profile = makeProfile({ regiones: [] });
    const grant = makeGrant();
    expect(matchesRegion(profile, grant)).toBe(false);
  });
});

describe("matchesKeywords (regla blanda)", () => {
  it("encuentra una keyword en el título", () => {
    const profile = makeProfile();
    expect(matchesKeywords(profile, makeGrant())).toBe("digitalización");
  });

  it("busca también en la finalidad", () => {
    const profile = makeProfile();
    const grant = makeGrant({
      title: "Ayuda general",
      sectors: [],
      purpose: "Fomentar la formación continua",
    });
    expect(matchesKeywords(profile, grant)).toBe("formación");
  });

  it("devuelve null si ninguna keyword aparece", () => {
    const profile = makeProfile();
    const grant = makeGrant({
      title: "Subvención para energías renovables",
      sectors: [],
      purpose: "",
    });
    expect(matchesKeywords(profile, grant)).toBeNull();
  });

  it("ignora keywords demasiado cortas (< 3 letras)", () => {
    const profile = makeProfile({ keywords: "ia, eco" });
    const grant = makeGrant();
    expect(matchesKeywords(profile, grant)).toBeNull();
  });
});

describe("matchGrant (clasificación final)", () => {
  it("matched: pasa la dura y coincide región + keyword", () => {
    const result = matchGrant(makeProfile(), makeGrant());
    expect(result.status).toBe("matched");
    expect(result.rule).toBeNull();
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("excluded: falla la regla dura de beneficiario", () => {
    const profile = makeProfile({ profileType: "persona" });
    const grant = makeGrant({ beneficiaryTypes: ["PYME", "Sociedades"] });
    const result = matchGrant(profile, grant);
    expect(result.status).toBe("excluded");
    expect(result.rule).toBe("beneficiario");
  });

  it("maybe: pasa la dura pero sin señal blanda", () => {
    const profile = makeProfile({ regiones: [], keywords: "" });
    const grant = makeGrant({
      beneficiaryTypes: ["PYME"],
      impactRegions: ["ES61 - Andalucía"],
      title: "Ayuda genérica sin palabras",
      purpose: "",
      sectors: [],
    });
    const result = matchGrant(profile, grant);
    expect(result.status).toBe("maybe");
  });
});

describe("matchGrants (agrupación)", () => {
  it("reparte cada ayuda en su bucket", () => {
    const profile = makeProfile();
    const grants = [
      makeGrant({ id: "a" }),
      makeGrant({
        id: "b",
        beneficiaryTypes: ["Autónomos"],
        title: "Ayuda para autónomos",
      }),
      makeGrant({
        id: "c",
        title: "Ayuda genérica sin palabras",
        purpose: "",
        sectors: [],
        impactRegions: ["ES61 - Andalucía"],
      }),
    ];

    const outcome = matchGrants(profile, grants);
    expect(outcome.matched.map((r) => r.id)).toContain("a");
    expect(outcome.excluded.map((r) => r.id)).toContain("b");
    expect(outcome.maybe.map((r) => r.id)).toContain("c");
  });
});
