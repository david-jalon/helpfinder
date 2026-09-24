import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT_PATH } from "@/lib/domain/redirect";
import {
  defaultNextForType,
  parseConfirmParams,
  sanitizeNextPathOr,
} from "@/lib/domain/recovery";

describe("defaultNextForType", () => {
  it("recovery va a poner la contraseña nueva", () => {
    expect(defaultNextForType("recovery")).toBe("/reset-password");
  });

  it("signup va al onboarding", () => {
    expect(defaultNextForType("signup")).toBe("/onboarding");
  });

  it("cualquier otro tipo cae al dashboard", () => {
    expect(defaultNextForType(null)).toBe(DEFAULT_NEXT_PATH);
    expect(defaultNextForType("magiclink")).toBe(DEFAULT_NEXT_PATH);
  });
});

describe("parseConfirmParams", () => {
  it("prefiere token_hash + type (flujo recomendado)", () => {
    const parsed = parseConfirmParams(
      new URLSearchParams("token_hash=abc123&type=recovery&next=/reset-password")
    );
    expect(parsed).toEqual({
      mode: "otp",
      tokenHash: "abc123",
      type: "recovery",
    });
  });

  it("acepta un code cuando no hay token_hash", () => {
    const parsed = parseConfirmParams(new URLSearchParams("code=xyz789"));
    expect(parsed).toEqual({ mode: "code", code: "xyz789", type: null });
  });

  it("en modo code guarda el type si viene (para decidir el destino)", () => {
    const parsed = parseConfirmParams(
      new URLSearchParams("code=xyz789&type=recovery")
    );
    expect(parsed).toEqual({ mode: "code", code: "xyz789", type: "recovery" });
  });

  it("token_hash gana aunque también venga code", () => {
    const parsed = parseConfirmParams(
      new URLSearchParams("token_hash=abc&type=signup&code=xyz")
    );
    expect(parsed).toEqual({ mode: "otp", tokenHash: "abc", type: "signup" });
  });

  it("sin datos válidos es invalid", () => {
    expect(parseConfirmParams(new URLSearchParams(""))).toEqual({
      mode: "invalid",
    });
    expect(parseConfirmParams(new URLSearchParams("token_hash=abc"))).toEqual({
      mode: "invalid",
    });
  });
});

describe("sanitizeNextPathOr", () => {
  it("usa el fallback si no viene next", () => {
    expect(sanitizeNextPathOr(null, "/reset-password")).toBe("/reset-password");
    expect(sanitizeNextPathOr("  ", "/reset-password")).toBe("/reset-password");
  });

  it("valida el next que sí viene", () => {
    expect(sanitizeNextPathOr("/onboarding", "/dashboard")).toBe("/onboarding");
  });

  it("bloquea un next externo y cae al destino por defecto", () => {
    expect(sanitizeNextPathOr("https://evil.example", "/dashboard")).toBe(
      DEFAULT_NEXT_PATH
    );
  });
});
