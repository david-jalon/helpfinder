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
    ...overrides,
  };
}

describe("rebucketPersisted", () => {
  it("re-clasifica matched por región conservando triaje y score", () => {
    const grant = makeSeen("1", {
      title: "Subvención CEE en Asturias",
      beneficiaryTypes: ["PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA"],
      impactRegions: ["ES120 - Asturias"],
    });
    const row = makeRow({ grant_id: "1", bucket: "excluded", match_reasons: [] });

    const { alerts, updates } = rebucketPersisted(
      makeProfile(),
      [row],
      new Map([["1", grant]])
    );

    expect(alerts[0].bucket).toBe("matched");
    expect(alerts[0].rule).toBeNull();
    expect(alerts[0].decision).toBe("posible");
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
    const row = makeRow({ grant_id: "1", bucket: "maybe" });

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
