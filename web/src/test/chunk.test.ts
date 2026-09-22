import { describe, expect, it } from "vitest";
import { chunkArray } from "@/lib/domain/chunk";

describe("chunkArray", () => {
  it("parte una lista en trozos del tamaño indicado", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("devuelve un solo trozo si cabe entero", () => {
    expect(chunkArray(["a", "b"], 100)).toEqual([["a", "b"]]);
  });

  it("con lista vacía devuelve []", () => {
    expect(chunkArray([], 10)).toEqual([]);
  });

  it("reparte exacto cuando es múltiplo del tamaño", () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("lanza si el tamaño no es positivo", () => {
    expect(() => chunkArray([1], 0)).toThrow();
    expect(() => chunkArray([1], -1)).toThrow();
  });
});
