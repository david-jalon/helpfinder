import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readJsonResponse } from "@/lib/http/read-json";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readJsonResponse", () => {
  it("parsea una respuesta JSON válida", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
    });

    await expect(readJsonResponse(response)).resolves.toEqual({ ok: true });
  });

  it("convierte un error de plataforma en texto en un mensaje entendible", async () => {
    const response = new Response("An error occurred...", { status: 502 });

    await expect(readJsonResponse(response)).rejects.toThrow(
      "El servidor respondió 502. Vuelve a intentarlo."
    );
  });

  it("con JSON inválido en un 200 usa un mensaje genérico", async () => {
    const response = new Response("no-es-json", { status: 200 });

    await expect(readJsonResponse(response)).rejects.toThrow(
      "El servidor devolvió una respuesta inesperada. Vuelve a intentarlo."
    );
  });
});
