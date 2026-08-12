import { describe, expect, it } from "vitest";
import type { GrantItem } from "@/lib/domain/grants";
import type { Profile } from "@/lib/domain/profile";
import type { SeenGrant } from "@/lib/grants/feed";
import {
  grantItemFromSeen,
  rebucketPersisted,
  type PersistedAlertRow,
} from "@/lib/dashboard/run-alerts";
import { isNoiseAlert, type AlertDTO } from "@/lib/dashboard/triage";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: "u1",
    profileType: "persona",
    colectivos: ["jovenes", "desempleados"],
    regiones: ["asturiana"],
    keywords: "",
    contextText: "",
    geminiApiKey: "",
    notificationEmail: "",
    emailDigestEnabled: false,
    lastSeenAt: null,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function makeSeen(
  id: string,
  grant: Partial<GrantItem>
): SeenGrant {
  const item: GrantItem = {
    id,
    title: "Ayuda",
    organization: null,
    publicationDate: null,
    deadlineDate: null,
    amount: null,
    sourceUrl: null,
    beneficiaryTypes: [],
    sectors: [],
    impactRegions: [],
    purpose: null,
    instrumentType: null,
    ...grant,
  };
  return {
    numConvocatoria: id,
    title: item.title,
    organization: item.organization,
    sourceUrl: item.sourceUrl,
    firstSeenAt: "2026-01-01T00:00:00Z",
    eligibilityJson: {
      beneficiaryTypes: item.beneficiaryTypes,
      sectors: item.sectors,
      impactRegions: item.impactRegions,
      purpose: item.purpose,
      instrumentType: item.instrumentType,
    },
    enrichedAt: null,
  };
}

function makeRow(overrides: Partial<PersistedAlertRow> = {}): PersistedAlertRow {
  return {
    id: "alert-1",
    grant_id: "1",
    score: 80,
    ai_reason: "Motivo IA",
    match_reasons: [],
    ai_status: "ok",
    bucket: "maybe",
    decision: "posible",
    ...overrides,
  };
}

function makeDto(overrides: Partial<AlertDTO> = {}): AlertDTO {
  return {
    id: "alert-1",
    grantId: "1",
    title: "Ayuda",
    organization: null,
    sourceUrl: null,
    bucket: "maybe",
    score: null,
    reason: null,
    matchReasons: [],
    aiStatus: "fallback",
    rule: null,
    decision: null,
    impactRegions: [],
    applicationStartDate: null,
    applicationEndDate: null,
    applicationStartText: null,
    applicationEndText: null,
    openEnded: false,
    ...overrides,
  };
}

describe("rebucketPersisted", () => {
  it("re-clasifica a matched una fila sin decidir, conservando el score", () => {
    const grant = makeSeen("1", {
      title: "Subvención CEE en Asturias",
      beneficiaryTypes: ["PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA"],
      impactRegions: ["ES120 - Asturias"],
    });
    const row = makeRow({
      grant_id: "1",
      bucket: "excluded",
      match_reasons: [],
      decision: null,
    });

    const { alerts, updates } = rebucketPersisted(
      makeProfile(),
      [row],
      new Map([["1", grant]])
    );

    expect(alerts[0].bucket).toBe("matched");
    expect(alerts[0].rule).toBeNull();
    expect(alerts[0].decision).toBeNull();
    expect(alerts[0].score).toBe(80);
    expect(updates).toEqual([
      { grantId: "1", bucket: "matched", matchReasons: [
        "La ayuda acepta tu perfil (persona particular)",
        "Coincide con tu región",
      ] },
    ]);
  });

  it("elimina la fila cuando el matcher la reclasifica como excluded", () => {
    const grant = makeSeen("1", {
      beneficiaryTypes: ["PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA"],
      impactRegions: ["ES120 - Asturias"],
    });
    const row = makeRow({ grant_id: "1", bucket: "maybe", decision: null });

    const { alerts, updates, deletes } = rebucketPersisted(
      makeProfile(),
      [row],
      new Map([["1", grant]])
    );

    expect(alerts).toEqual([]);
    expect(updates).toEqual([]);
    expect(deletes).toContain("alert-1");
  });

  it("elimina la fila excluded aunque ya estuviera como excluded", () => {
    const grant = makeSeen("1", {
      beneficiaryTypes: ["PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA"],
      impactRegions: ["ES120 - Asturias"],
    });
    const row = makeRow({
      grant_id: "1",
      bucket: "excluded",
      match_reasons: [],
      decision: null,
    });

    const { alerts, updates, deletes } = rebucketPersisted(
      makeProfile(),
      [row],
      new Map([["1", grant]])
    );

    expect(alerts).toEqual([]);
    expect(updates).toEqual([]);
    expect(deletes).toContain("alert-1");
  });

  it("deja pasar sin grant con el DTO persistido tal cual", () => {
    const row = makeRow({ grant_id: "999", bucket: "matched" });

    const { alerts, updates } = rebucketPersisted(
      makeProfile(),
      [row],
      new Map()
    );

    expect(alerts[0].grantId).toBe("999");
    expect(alerts[0].bucket).toBe("matched");
    expect(alerts[0].decision).toBe("posible");
    expect(updates).toEqual([]);
  });

  it("conserva un «Seguir» desde la landing aunque el matcher lo excluya", () => {
    // Sigue desde la landing (Fase 14): grants_seen aún sin elegibilidad
    // (eligibility_json = null) → impactRegions vacío → el matcher lo
    // clasificaría como excluded por región. El triaje debe mandar.
    const grant = makeSeen("1", {
      title: "Ayuda recién seguida",
      beneficiaryTypes: [],
      impactRegions: [],
    });
    const row = makeRow({
      grant_id: "1",
      bucket: "matched",
      ai_status: "pending",
      decision: "seguir",
    });

    const { alerts, updates, deletes } = rebucketPersisted(
      makeProfile(),
      [row],
      new Map([["1", grant]])
    );

    expect(deletes).toEqual([]);
    expect(updates).toEqual([]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].grantId).toBe("1");
    expect(alerts[0].decision).toBe("seguir");
    expect(alerts[0].bucket).toBe("matched");
    expect(alerts[0].aiStatus).toBe("pending");
    expect(alerts[0].title).toBe("Ayuda recién seguida");
  });

  it("conserva cualquier triaje decidido (posible/denegada) aunque el matcher excluya", () => {
    const grant = makeSeen("1", {
      beneficiaryTypes: ["PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA"],
      impactRegions: ["ES120 - Asturias"],
    });

    for (const decision of ["posible", "denegada"] as const) {
      const row = makeRow({ grant_id: "1", bucket: "maybe", decision });

      const { alerts, updates, deletes } = rebucketPersisted(
        makeProfile(),
        [row],
        new Map([["1", grant]])
      );

      expect(deletes).toEqual([]);
      expect(updates).toEqual([]);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].decision).toBe(decision);
    }
  });

  it("usa el DTO que ya viene de grantItemFromSeen (compatibilidad)", () => {
    const seen = makeSeen("1", { title: "Otra", impactRegions: ["ES120 - Asturias"] });
    const item = grantItemFromSeen(seen);
    expect(item.id).toBe("1");
    expect(item.impactRegions).toEqual(["ES120 - Asturias"]);
  });
});

describe("isNoiseAlert", () => {
  it("considera ruido cualquier excluded (no se debe mostrar)", () => {
    expect(
      isNoiseAlert(makeDto({ bucket: "excluded", rule: "beneficiario" }))
    ).toBe(true);
    expect(
      isNoiseAlert(makeDto({ bucket: "excluded", rule: "region" }))
    ).toBe(true);
  });

  it("no considera ruido un maybe ni un matched (se muestran)", () => {
    expect(
      isNoiseAlert(makeDto({ bucket: "maybe", aiStatus: "fallback" }))
    ).toBe(false);
    expect(
      isNoiseAlert(makeDto({ bucket: "maybe", aiStatus: "pending" }))
    ).toBe(false);
    expect(
      isNoiseAlert(makeDto({ bucket: "maybe", aiStatus: "ok" }))
    ).toBe(false);
    expect(
      isNoiseAlert(makeDto({ bucket: "matched", aiStatus: "fallback" }))
    ).toBe(false);
  });
});
