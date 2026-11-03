import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bdnsFetch: vi.fn(),
}));

vi.mock("@/lib/bdns/http", () => ({
  bdnsFetch: mocks.bdnsFetch,
}));

import {
  clearGrantDetailCache,
  fetchGrantDetailByNumConv,
  readOrganization,
} from "@/lib/bdns/detail";

/**
 * El detalle de BDNS devuelve el organismo anidado en `organo.nivel2`
 * (el listado sí lo trae en la raíz). Antes se guardaba `organization: null`
 * y el modal no mostraba quién convoca.
 */

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearGrantDetailCache();
});

describe("readOrganization", () => {
  it("lee nivel2 de la raíz (formato del listado)", () => {
    expect(readOrganization({ nivel2: "Ministerio de Industria" })).toBe(
      "Ministerio de Industria"
    );
  });

  it("lee organo.nivel2 (formato del detalle)", () => {
    expect(
      readOrganization({ organo: { nivel1: "Estado", nivel2: "COMUNITAT VALENCIANA" } })
    ).toBe("COMUNITAT VALENCIANA");
  });

  it("devuelve null si no hay organismo", () => {
    expect(readOrganization({})).toBeNull();
    expect(readOrganization({ organo: {} })).toBeNull();
  });
});

describe("fetchGrantDetailByNumConv", () => {
  it("rellena organization desde organo.nivel2", async () => {
    mocks.bdnsFetch.mockResolvedValue(
      jsonResponse({
        numeroConvocatoria: "939132",
        descripcion: "Subvenciones de prueba",
        organo: { nivel1: "Estado", nivel2: "COMUNITAT VALENCIANA" },
      })
    );

    const result = await fetchGrantDetailByNumConv("939132");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.organization).toBe("COMUNITAT VALENCIANA");
      expect(result.data.title).toBe("Subvenciones de prueba");
    }
  });

  it("cachea el detalle: la segunda llamada no va a BDNS", async () => {
    mocks.bdnsFetch.mockResolvedValue(
      jsonResponse({ numeroConvocatoria: "1", descripcion: "Ayuda" })
    );

    await fetchGrantDetailByNumConv("1");
    await fetchGrantDetailByNumConv("1");

    expect(mocks.bdnsFetch).toHaveBeenCalledTimes(1);
  });

  it("no cachea los fallos", async () => {
    mocks.bdnsFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ numeroConvocatoria: "2" }));

    const first = await fetchGrantDetailByNumConv("2");
    const second = await fetchGrantDetailByNumConv("2");

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(mocks.bdnsFetch).toHaveBeenCalledTimes(2);
  });
});
