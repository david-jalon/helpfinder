import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

import { proxy } from "@/proxy";

function request(url: string): NextRequest {
  return new NextRequest(url);
}

describe("proxy", () => {
  it("devuelve 401 JSON para una API sin sesión", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const res = await proxy(request("https://app.test/api/dashboard"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "No autenticado",
    });
  });

  it("redirige a /login para una página privada sin sesión", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const res = await proxy(request("https://app.test/dashboard"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?next=%2Fdashboard");
  });

  it("deja pasar una API si hay sesión", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const res = await proxy(request("https://app.test/api/dashboard"));

    expect(res.status).toBe(200);
  });
});
