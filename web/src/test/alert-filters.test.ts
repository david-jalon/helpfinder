import { describe, expect, it } from "vitest";
import { normalizeAlertFilters } from "@/lib/domain/alert-filters";

describe("normalizeAlertFilters", () => {
  it("aplica valores por defecto en objeto vacío", () => {
    const f = normalizeAlertFilters({});
    expect(f.searchText).toBe("");
    expect(f.tipoAdministracion).toBeNull();
    expect(f.orderBy).toBe("fechaRecepcion");
    expect(f.direccion).toBe("desc");
  });

  it("acepta tipo y orden válidos", () => {
    const f = normalizeAlertFilters({
      searchText: "pyme",
      tipoAdministracion: "A",
      orderBy: "descripcion",
      direccion: "asc",
    });
    expect(f.tipoAdministracion).toBe("A");
    expect(f.orderBy).toBe("descripcion");
    expect(f.direccion).toBe("asc");
  });

  it("rechaza tipo y orden inválidos", () => {
    const f = normalizeAlertFilters({
      tipoAdministracion: "X",
      orderBy: "no_existe",
    });
    expect(f.tipoAdministracion).toBeNull();
    expect(f.orderBy).toBe("fechaRecepcion");
  });

  it("acepta searchText", () => {
    const f = normalizeAlertFilters({ searchText: "juventud" });
    expect(f.searchText).toBe("juventud");
  });

  it("regionId válido se conserva", () => {
    const f = normalizeAlertFilters({ regionId: 13 });
    expect(f.regionId).toBe(13);
  });

  it("regionId inválido se descarta", () => {
    const f = normalizeAlertFilters({ regionId: -1 });
    expect(f.regionId).toBeNull();
  });

  it("acepta fechas en formato YYYY-MM-DD", () => {
    const f = normalizeAlertFilters({
      fechaDesde: "2024-01-15",
      fechaHasta: "2024-12-31",
    });
    expect(f.fechaDesde).toBe("2024-01-15");
    expect(f.fechaHasta).toBe("2024-12-31");
  });

  it("accepts all valid tipoAdministracion values", () => {
    for (const tipo of ["C", "A", "L", "O"]) {
      const f = normalizeAlertFilters({ tipoAdministracion: tipo });
      expect(f.tipoAdministracion).toBe(tipo);
    }
  });
});
