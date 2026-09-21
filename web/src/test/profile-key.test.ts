import { describe, expect, it } from "vitest";
import { resolveGeminiKeyPayload } from "@/lib/domain/profile-key";

describe("resolveGeminiKeyPayload", () => {
  it("no envía nada si el campo está vacío (conserva la key guardada)", () => {
    expect(resolveGeminiKeyPayload("", false)).toEqual({});
    expect(resolveGeminiKeyPayload("   ", false)).toEqual({});
  });

  it("envía la key recortada si se escribe una nueva", () => {
    expect(resolveGeminiKeyPayload("  AIza-abc  ", false)).toEqual({
      geminiApiKey: "AIza-abc",
    });
  });

  it("envía cadena vacía cuando se pide borrar la key", () => {
    expect(resolveGeminiKeyPayload("AIza-abc", true)).toEqual({ geminiApiKey: "" });
    expect(resolveGeminiKeyPayload("", true)).toEqual({ geminiApiKey: "" });
  });
});
