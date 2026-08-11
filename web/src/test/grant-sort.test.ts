import { describe, expect, it } from "vitest";
import type { GrantItem } from "@/lib/domain/grants";
import { sortResults } from "@/lib/grants/sort";

function grant(id: string, overrides: Partial<GrantItem> = {}): GrantItem {
  return {
    id,
    title: "Ayuda",
    organization: null,
    publicationDate: null,
    deadlineDate: null,
    amount: null,
    sourceUrl: null,
    ...overrides,
  };
}

describe("sortResults", () => {
  it("ordena por descripcion (título) ascendente con acentos", () => {
    const items = [
      grant("1", { title: "Zapato" }),
      grant("2", { title: "Bicicleta" }),
      grant("3", { title: "Árbol" }),
    ];
    const result = sortResults(items, "descripcion", "asc");
    expect(result.map((g) => g.id)).toEqual(["3", "2", "1"]);
  });

  it("ordena por descripcion descendente", () => {
    const items = [
      grant("1", { title: "Zapato" }),
      grant("2", { title: "Bicicleta" }),
      grant("3", { title: "Árbol" }),
    ];
    const result = sortResults(items, "descripcion", "desc");
    expect(result.map((g) => g.id)).toEqual(["1", "2", "3"]);
  });

  it("ordena por fecha de publicación (DD/MM/YYYY) descendente", () => {
    const items = [
      grant("1", { publicationDate: "10/01/2025" }),
      grant("2", { publicationDate: "01/12/2024" }),
      grant("3", { publicationDate: "15/03/2026" }),
    ];
    const result = sortResults(items, "fechaRecepcion", "desc");
    expect(result.map((g) => g.id)).toEqual(["3", "1", "2"]);
  });

  it("ordena por fecha ascendente", () => {
    const items = [
      grant("1", { publicationDate: "10/01/2025" }),
      grant("2", { publicationDate: "01/12/2024" }),
      grant("3", { publicationDate: "15/03/2026" }),
    ];
    const result = sortResults(items, "fechaRecepcion", "asc");
    expect(result.map((g) => g.id)).toEqual(["2", "1", "3"]);
  });

  it("los resultados sin fecha van al final aunque se ordene descendente", () => {
    const items = [
      grant("1", { publicationDate: "10/01/2025" }),
      grant("2", { publicationDate: null }),
    ];
    const result = sortResults(items, "fechaRecepcion", "desc");
    expect(result.map((g) => g.id)).toEqual(["1", "2"]);
  });

  it("ordena por número de convocatoria numéricamente (no lexicográfico)", () => {
    const items = [grant("100"), grant("12"), grant("9")];
    const result = sortResults(items, "numeroConvocatoria", "asc");
    expect(result.map((g) => g.id)).toEqual(["9", "12", "100"]);
  });

  it("ordena por organismo y deja los sin organismo al final en ambas direcciones", () => {
    const items = [
      grant("1", { organization: "Ayuntamiento de Madrid" }),
      grant("2", { organization: "Diputación de Ávila" }),
      grant("3", { organization: null }),
    ];
    expect(sortResults(items, "nivel2", "asc").map((g) => g.id)).toEqual(["1", "2", "3"]);
    expect(sortResults(items, "nivel2", "desc").map((g) => g.id)).toEqual(["2", "1", "3"]);
  });

  it("con orden desconocido conserva el orden recibido", () => {
    const items = [grant("1"), grant("2"), grant("3")];
    const result = sortResults(items, "mrr", "desc");
    expect(result.map((g) => g.id)).toEqual(["1", "2", "3"]);
  });

  it("no muta el array original", () => {
    const items = [grant("1"), grant("2")];
    sortResults(items, "descripcion", "asc");
    expect(items.map((g) => g.id)).toEqual(["1", "2"]);
  });
});