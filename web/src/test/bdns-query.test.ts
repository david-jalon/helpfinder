import { describe, expect, it } from "vitest";
import type { GrantItem, GrantsSearchResult, SearchGrantsParams } from "@/lib/domain/grants";
import {
  buildSearchUrl,
  mergeGroupResults,
  splitQueryGroups,
} from "@/lib/bdns/client";

function makeParams(overrides: Partial<SearchGrantsParams> = {}): SearchGrantsParams {
  return { page: 1, pageSize: 10, ...overrides };
}

function grant(id: string): GrantItem {
  return {
    id,
    title: `Ayuda ${id}`,
    organization: null,
    publicationDate: null,
    deadlineDate: null,
    amount: null,
    sourceUrl: null,
  };
}

function groupResult(items: GrantItem[]): GrantsSearchResult {
  return { items, total: items.length, page: 1, pageSize: items.length };
}

describe("splitQueryGroups", () => {
  it("una frase sin comas es un único grupo", () => {
    expect(splitQueryGroups("bici electrica")).toEqual(["bici electrica"]);
  });

  it("divide por comas en alternativas", () => {
    expect(splitQueryGroups("digitalización, autónomos, I+D")).toEqual([
      "digitalización",
      "autónomos",
      "I+D",
    ]);
  });

  it("divide por punto y coma", () => {
    expect(splitQueryGroups("digitalización; autónomos")).toEqual([
      "digitalización",
      "autónomos",
    ]);
  });

  it("recorta espacios y descarta grupos vacíos", () => {
    expect(splitQueryGroups(" bici , , patinete, ")).toEqual(["bici", "patinete"]);
  });

  it("sin texto no hay grupos", () => {
    expect(splitQueryGroups("")).toEqual([]);
    expect(splitQueryGroups("   ")).toEqual([]);
    expect(splitQueryGroups(undefined)).toEqual([]);
  });
});

describe("mergeGroupResults", () => {
  it("fusiona y elimina duplicados por id", () => {
    const first = groupResult([grant("1"), grant("2")]);
    const second = groupResult([grant("2"), grant("3")]);
    expect(mergeGroupResults([first, second]).map((g) => g.id)).toEqual(["1", "2", "3"]);
  });

  it("con un solo grupo devuelve sus items", () => {
    const only = groupResult([grant("5")]);
    expect(mergeGroupResults([only]).map((g) => g.id)).toEqual(["5"]);
  });
});

describe("buildSearchUrl", () => {
  it("usa 'todas las palabras' (1) en lugar de 'alguna' (2)", () => {
    const url = buildSearchUrl("https://example.test/busqueda", makeParams({ q: "bici electrica" }));
    const params = new URL(url).searchParams;
    expect(params.get("descripcion")).toBe("bici electrica");
    expect(params.get("descripcionTipoBusqueda")).toBe("1");
  });

  it("traduce page 1-based a BDNS 0-based", () => {
    const url = buildSearchUrl("https://example.test/busqueda", makeParams({ q: "bici", page: 3 }));
    const params = new URL(url).searchParams;
    expect(params.get("page")).toBe("2");
  });

  it("sin texto no envía descripcion", () => {
    const url = buildSearchUrl("https://example.test/busqueda", makeParams());
    const params = new URL(url).searchParams;
    expect(params.get("descripcion")).toBeNull();
    expect(params.get("descripcionTipoBusqueda")).toBeNull();
  });

  it("el grupo explícito desplaza a params.q", () => {
    const url = buildSearchUrl(
      "https://example.test/busqueda",
      makeParams({ q: "bici, patinete" }),
      "patinete"
    );
    const params = new URL(url).searchParams;
    expect(params.get("descripcion")).toBe("patinete");
  });
});