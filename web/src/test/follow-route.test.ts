import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  followGrantForUser: vi.fn(),
  fetchGrantDetailByNumConv: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db", () => ({
  followGrantForUser: mocks.followGrantForUser,
}));

vi.mock("@/lib/bdns/detail", () => ({
  fetchGrantDetailByNumConv: mocks.fetchGrantDetailByNumConv,
}));

import { POST } from "@/app/api/follow/route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/follow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const clientBody = {
  id: "780021",
  title: "Título falso del cliente",
  organization: "Organismo falso",
  sourceUrl: "https://sitio-malicioso.example/phishing",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
  mocks.followGrantForUser.mockResolvedValue(undefined);
});

describe("POST /api/follow", () => {
  it("responde 401 sin sesión", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const res = await POST(request(clientBody));

    expect(res.status).toBe(401);
    expect(mocks.followGrantForUser).not.toHaveBeenCalled();
  });

  it("responde 400 con JSON malformado", async () => {
    const res = await POST(request("no-es-json"));

    expect(res.status).toBe(400);
  });

  it("no guarda nada si BDNS no devuelve el detalle", async () => {
    mocks.fetchGrantDetailByNumConv.mockResolvedValue({
      ok: false,
      status: 502,
      message: "BDNS caído",
    });

    const res = await POST(request(clientBody));

    expect(res.status).toBe(502);
    expect(mocks.followGrantForUser).not.toHaveBeenCalled();
  });

  it("usa solo los datos autoritativos de BDNS y regenera la URL", async () => {
    mocks.fetchGrantDetailByNumConv.mockResolvedValue({
      ok: true,
      data: {
        id: "780021",
        title: "Título oficial",
        organization: "Organismo oficial",
        publicationDate: null,
        description: null,
        sourceUrl: "https://otra-url.example",
      },
    });

    const res = await POST(request(clientBody));

    expect(res.status).toBe(200);
    expect(mocks.followGrantForUser).toHaveBeenCalledWith("u1", {
      id: "780021",
      title: "Título oficial",
      organization: "Organismo oficial",
      sourceUrl:
        "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/780021",
    });
  });
});
