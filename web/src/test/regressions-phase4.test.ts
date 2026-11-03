import { describe, expect, it } from "vitest";
import type { GrantItem } from "@/lib/domain/grants";
import type { Profile } from "@/lib/domain/profile";
import { matchGrant } from "@/lib/matching/matcher";

/**
 * Regresión de la Fase 4: una ayuda sin región no se excluye.
 *
 * Antes, `grantExcludesRegion` devolvía `true` cuando `impactRegions` estaba
 * vacío. Eso hacía desaparecer ayudas cuyo dato no se había podido leer.
 */

function makeProfile(): Profile {
  return {
    userId: "u1",
    profileType: "persona",
    colectivos: [],
    regiones: ["madrileña"],
    keywords: "",
    contextText: "",
    geminiApiKey: "",
    notificationEmail: "",
    emailDigestEnabled: false,
    lastSeenAt: null,
    lastSeenSeq: null,
    createdAt: "2026-01-01",
  };
}

function makeGrant(overrides: Partial<GrantItem> = {}): GrantItem {
  return {
    id: "1",
    title: "Ayuda sin datos de región",
    organization: "Organismo de prueba",
    publicationDate: null,
    deadlineDate: null,
    amount: null,
    sourceUrl: null,
    beneficiaryTypes: ["PERSONAS FÍSICAS"],
    sectors: [],
    impactRegions: [],
    purpose: null,
    instrumentType: null,
    ...overrides,
  };
}

describe("Fase 4 — región desconocida", () => {
  it("una ayuda sin región queda en maybe, no excluida", () => {
    const result = matchGrant(makeProfile(), makeGrant());

    expect(result.status).toBe("maybe");
    expect(result.rule).toBeNull();
    expect(result.reasons).toContain(
      "No declara región; conviene revisar el detalle"
    );
  });

  it("una ayuda de otra región explícita sí se excluye", () => {
    const result = matchGrant(
      makeProfile(),
      makeGrant({ impactRegions: ["ES61 - Andalucía"] })
    );

    expect(result.status).toBe("excluded");
    expect(result.rule).toBe("region");
  });
});
