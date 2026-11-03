import { describe, expect, it, vi } from "vitest";
import {
  enrichGrantsWithEligibility,
  type EligibilityFields,
  type EnrichableGrant,
} from "@/lib/bdns/detail";

/**
 * `enrichGrantsWithEligibility` ahora informa de qué ayudas se enriquecieron
 * con ÉXITO. Eso es lo que permite al cron distinguir "ya enriquecida" de
 * "falló y hay que reintentar" (Fallo 4).
 */

function fields(overrides: Partial<EligibilityFields> = {}): EligibilityFields {
  return {
    beneficiaryTypes: [],
    sectors: [],
    impactRegions: [],
    purpose: null,
    instrumentType: null,
    applicationStartDate: null,
    applicationEndDate: null,
    applicationStartText: null,
    applicationEndText: null,
    openEnded: false,
    ...overrides,
  };
}

describe("enrichGrantsWithEligibility", () => {
  it("marca como enriquecidas solo las que BDNS responde", async () => {
    const items: EnrichableGrant[] = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const fetchFields = vi.fn(async (id: string) =>
      id === "2" ? null : fields({ impactRegions: ["ES13 - Comunidad de Madrid"] })
    );

    const { succeeded } = await enrichGrantsWithEligibility(items, 5, fetchFields);

    expect([...succeeded].sort()).toEqual(["1", "3"]);
    expect(items[0].impactRegions).toEqual(["ES13 - Comunidad de Madrid"]);
    expect(items[1].impactRegions).toBeUndefined();
    expect(items[2].impactRegions).toEqual(["ES13 - Comunidad de Madrid"]);
  });

  it("marca enriquecida aunque BDNS devuelva campos vacíos", async () => {
    const items: EnrichableGrant[] = [{ id: "1" }];

    const { succeeded } = await enrichGrantsWithEligibility(items, 5, async () =>
      fields()
    );

    expect(succeeded.has("1")).toBe(true);
    expect(items[0].impactRegions).toEqual([]);
  });

  it("procesa todos los elementos aunque haya fallos intercalados", async () => {
    const items: EnrichableGrant[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
    }));
    // Falla en los pares, acierta en los impares.
    const { succeeded } = await enrichGrantsWithEligibility(items, 3, async (id) =>
      Number(id) % 2 === 0 ? null : fields()
    );

    expect(succeeded.size).toBe(5);
    expect([...succeeded].sort()).toEqual(["1", "3", "5", "7", "9"]);
  });

  it("no marca stoppedEarly si termina todo", async () => {
    const items: EnrichableGrant[] = [{ id: "1" }, { id: "2" }];

    const { stoppedEarly } = await enrichGrantsWithEligibility(items, 1, async () =>
      fields()
    );

    expect(stoppedEarly).toBe(false);
  });

  it("deja de coger ayudas cuando se agota el presupuesto", async () => {
    // 500 ayudas simuladas: el cron no debe intentarlas todas si no hay tiempo.
    const items: EnrichableGrant[] = Array.from({ length: 500 }, (_, i) => ({
      id: String(i + 1),
    }));
    let fetched = 0;

    const { succeeded, stoppedEarly } = await enrichGrantsWithEligibility(
      items,
      1,
      async () => {
        fetched++;
        return fields();
      },
      () => fetched >= 10
    );

    expect(stoppedEarly).toBe(true);
    expect(fetched).toBe(10);
    expect(succeeded.size).toBe(10);
    // Las que no se intentaron quedan sin datos: el cron las guardará como
    // pendientes (`enriched_at = null`) y las retomará mañana.
    expect(items[10].impactRegions).toBeUndefined();
  });
});
