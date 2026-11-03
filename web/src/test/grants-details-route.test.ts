import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetchDetail: vi.fn(),
}));

vi.mock("@/lib/bdns/detail", () => ({
  fetchGrantDetailByNumConv: mocks.fetchDetail,
}));

import { GET } from "@/app/api/grants/details/route";

/**
 * `/api/grants/details` existe para quitar el N+1 de plazos del dashboard:
 * una petición pide varios detalles, no una por tarjeta.
 */

function request(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchDetail.mockResolvedValue({
    ok: true,
    data: { id: "1", title: "Ayuda", organization: null },
  });
});

describe("GET /api/grants/details", () => {
  it("responde 400 sin ids válidos", async () => {
    const res = await GET(request("https://app.test/api/grants/details"));

    expect(res.status).toBe(400);
    expect(mocks.fetchDetail).not.toHaveBeenCalled();
  });

  it("responde 400 si todos los ids son inválidos", async () => {
    const res = await GET(
      request("https://app.test/api/grants/details?ids=abc,../x")
    );

    expect(res.status).toBe(400);
  });

  it("devuelve un mapa id → detalle y null para los que fallan", async () => {
    mocks.fetchDetail.mockImplementation(async (id: string) =>
      id === "2"
        ? { ok: false, status: 502, message: "caído" }
        : { ok: true, data: { id, title: `Ayuda ${id}`, organization: null } }
    );

    const res = await GET(
      request("https://app.test/api/grants/details?ids=1,2,3")
    );
    const json = (await res.json()) as {
      ok: boolean;
      data: Record<string, { id: string } | null>;
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data["1"]?.id).toBe("1");
    expect(json.data["2"]).toBeNull();
    expect(json.data["3"]?.id).toBe("3");
  });

  it("deduplica ids y limita el lote a 25", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => String(i + 1));
    const url = `https://app.test/api/grants/details?ids=${[...ids, "1"].join(",")}`;

    await GET(request(url));

    expect(mocks.fetchDetail).toHaveBeenCalledTimes(25);
    const calledIds = mocks.fetchDetail.mock.calls.map(([id]) => id);
    expect(new Set(calledIds).size).toBe(25);
  });
});
