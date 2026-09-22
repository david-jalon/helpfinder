import { describe, expect, it } from "vitest";
import {
  isProfileType,
  isValidEmail,
  isValidGeminiKey,
  sanitizeColectivos,
  sanitizeRegiones,
} from "@/lib/domain/profile-input";

describe("isProfileType", () => {
  it("acepta tipos válidos", () => {
    expect(isProfileType("persona")).toBe(true);
    expect(isProfileType("sociedad")).toBe(true);
  });

  it("rechaza tipos inventados o no-string", () => {
    expect(isProfileType("empresa")).toBe(false);
    expect(isProfileType(123)).toBe(false);
    expect(isProfileType(null)).toBe(false);
  });
});

describe("sanitizeColectivos / sanitizeRegiones", () => {
  it("descarta valores desconocidos y duplicados", () => {
    expect(
      sanitizeRegiones(["madrileña", "madrileña", "marte", "vasca", 42])
    ).toEqual(["madrileña", "vasca"]);
    expect(sanitizeColectivos(["jovenes", "jovenes", "viejos"])).toEqual([
      "jovenes",
    ]);
  });

  it("devuelve [] si no es un array", () => {
    expect(sanitizeRegiones("madrileña")).toEqual([]);
    expect(sanitizeColectivos(null)).toEqual([]);
  });
});

describe("isValidGeminiKey", () => {
  it("acepta la cadena vacía (borrar la key)", () => {
    expect(isValidGeminiKey("")).toBe(true);
    expect(isValidGeminiKey("   ")).toBe(true);
  });

  it("acepta una key con forma de Google (AIza...)", () => {
    expect(isValidGeminiKey("AIzaSyA1234567890abcdefghijklmnopqrst")).toBe(true);
  });

  it("rechaza formatos que no son claves", () => {
    expect(isValidGeminiKey("no-es-una-key")).toBe(false);
    expect(isValidGeminiKey("sk-123456")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("acepta la cadena vacía (borrar)", () => {
    expect(isValidEmail("")).toBe(true);
  });

  it("acepta un email normal", () => {
    expect(isValidEmail("ana@ejemplo.com")).toBe(true);
  });

  it("rechaza emails mal formados", () => {
    expect(isValidEmail("ana@ejemplo")).toBe(false);
    expect(isValidEmail("ana ejemplo.com")).toBe(false);
    expect(isValidEmail("@ejemplo.com")).toBe(false);
  });
});
