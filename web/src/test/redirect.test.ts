import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT_PATH, sanitizeNextPath } from "@/lib/domain/redirect";

describe("sanitizeNextPath", () => {
  it("deja pasar rutas internas", () => {
    expect(sanitizeNextPath("/settings")).toBe("/settings");
    expect(sanitizeNextPath("/dashboard?tab=posibles")).toBe(
      "/dashboard?tab=posibles"
    );
  });

  it("cae al destino por defecto sin valor", () => {
    expect(sanitizeNextPath(null)).toBe(DEFAULT_NEXT_PATH);
    expect(sanitizeNextPath(undefined)).toBe(DEFAULT_NEXT_PATH);
    expect(sanitizeNextPath("")).toBe(DEFAULT_NEXT_PATH);
  });

  it("bloquea URLs externas (redirección abierta)", () => {
    expect(sanitizeNextPath("https://evil.example")).toBe(DEFAULT_NEXT_PATH);
    expect(sanitizeNextPath("//evil.example")).toBe(DEFAULT_NEXT_PATH);
    expect(sanitizeNextPath("/\\evil.example")).toBe(DEFAULT_NEXT_PATH);
    expect(sanitizeNextPath("javascript:alert(1)")).toBe(DEFAULT_NEXT_PATH);
  });

  it("recorta espacios antes de decidir", () => {
    expect(sanitizeNextPath("  /settings  ")).toBe("/settings");
  });
});
