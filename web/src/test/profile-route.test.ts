import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/domain/profile";

/**
 * Test del contrato de la API de perfil para la API key de Gemini:
 * - GET nunca devuelve el valor de la key, solo `hasGeminiApiKey`.
 * - PUT reenvía `geminiApiKey` al guardar (incluida "" para borrarla).
 *
 * Se mockean las dependencias de servidor (Supabase y BD) para probar solo
 * el handler, sin red ni base de datos.
 */

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getProfile: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db", () => ({
  getProfile: mocks.getProfile,
  upsertProfile: mocks.upsertProfile,
}));

import { GET, PUT } from "@/app/api/profile/route";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: "u1",
    profileType: "persona",
    colectivos: [],
    regiones: [],
    keywords: "",
    contextText: "",
    geminiApiKey: "",
    notificationEmail: "",
    emailDigestEnabled: false,
    lastSeenAt: null,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
});

describe("GET /api/profile (API key)", () => {
  it("no filtra la key y marca hasGeminiApiKey=true", async () => {
    mocks.getProfile.mockResolvedValue(
      makeProfile({ geminiApiKey: "AIza-secret" })
    );

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.hasGeminiApiKey).toBe(true);
    expect(json.data.geminiApiKey).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("AIza-secret");
  });

  it("marca hasGeminiApiKey=false cuando no hay key", async () => {
    mocks.getProfile.mockResolvedValue(makeProfile({ geminiApiKey: "" }));

    const json = await (await GET()).json();

    expect(json.data.hasGeminiApiKey).toBe(false);
  });

  it("responde 401 sin sesión", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });
});

describe("PUT /api/profile (API key)", () => {
  it("reenvía la key nueva recortada", async () => {
    const res = await PUT(
      putRequest({ geminiApiKey: "  AIzaSyA1234567890abcdefghijklmnopqrst  " })
    );

    expect(res.status).toBe(200);
    expect(mocks.upsertProfile).toHaveBeenCalledWith("u1", {
      geminiApiKey: "AIzaSyA1234567890abcdefghijklmnopqrst",
    });
  });

  it("permite borrar la key enviando cadena vacía", async () => {
    await PUT(putRequest({ geminiApiKey: "" }));

    expect(mocks.upsertProfile).toHaveBeenCalledWith("u1", {
      geminiApiKey: "",
    });
  });

  it("no incluye la key si no viene en el cuerpo", async () => {
    await PUT(putRequest({ profileType: "autonomo" }));

    const arg = mocks.upsertProfile.mock.calls[0][1] as Record<string, unknown>;
    expect(arg).toEqual({ profileType: "autonomo" });
    expect("geminiApiKey" in arg).toBe(false);
  });

  it("responde 400 si no hay campos para actualizar", async () => {
    const res = await PUT(putRequest({}));

    expect(res.status).toBe(400);
  });
});

describe("PUT /api/profile (validación de entrada)", () => {
  it("filtra regiones desconocidas antes de guardar", async () => {
    await PUT(putRequest({ regiones: ["madrileña", "marte", "madrileña"] }));

    expect(mocks.upsertProfile).toHaveBeenCalledWith("u1", {
      regiones: ["madrileña"],
    });
  });

  it("responde 400 con un tipo de perfil no válido", async () => {
    const res = await PUT(putRequest({ profileType: "empresa" }));

    expect(res.status).toBe(400);
    expect(mocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("responde 400 con una API key de formato incorrecto", async () => {
    const res = await PUT(putRequest({ geminiApiKey: "no-es-una-key" }));

    expect(res.status).toBe(400);
  });

  it("responde 400 con palabras clave demasiado largas", async () => {
    const res = await PUT(putRequest({ keywords: "x".repeat(301) }));

    expect(res.status).toBe(400);
  });

  it("responde 400 con un correo inválido", async () => {
    const res = await PUT(putRequest({ notificationEmail: "malo" }));

    expect(res.status).toBe(400);
  });

  it("responde 400 si regiones no es un array", async () => {
    const res = await PUT(putRequest({ regiones: "madrileña" }));

    expect(res.status).toBe(400);
  });
});
