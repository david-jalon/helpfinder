import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  setAlertDecision: vi.fn(),
  deleteAlerts: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db", () => ({
  setAlertDecision: mocks.setAlertDecision,
  deleteAlerts: mocks.deleteAlerts,
}));

vi.mock("@/lib/dashboard/run-alerts", () => ({
  isAlertDecision: (value: unknown) =>
    value === null ||
    (typeof value === "string" &&
      ["seguir", "posible", "denegada"].includes(value)),
}));

import { DELETE, PUT } from "@/app/api/alerts/[id]/route";

function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/alerts/a1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "a1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
  mocks.setAlertDecision.mockResolvedValue(undefined);
  mocks.deleteAlerts.mockResolvedValue(undefined);
});

describe("/api/alerts/[id]", () => {
  it("PUT guarda la decisión con el user_id de la sesión", async () => {
    const res = await PUT(putRequest({ decision: "seguir" }), params);

    expect(res.status).toBe(200);
    expect(mocks.setAlertDecision).toHaveBeenCalledWith("u1", "a1", "seguir");
  });

  it("PUT rechaza una decisión no válida", async () => {
    const res = await PUT(putRequest({ decision: "hack" }), params);

    expect(res.status).toBe(400);
    expect(mocks.setAlertDecision).not.toHaveBeenCalled();
  });

  it("DELETE borra la alerta del usuario", async () => {
    const res = await DELETE(new Request("http://localhost/api/alerts/a1"), params);

    expect(res.status).toBe(200);
    expect(mocks.deleteAlerts).toHaveBeenCalledWith("u1", ["a1"]);
  });

  it("responde 401 sin sesión", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const res = await PUT(putRequest({ decision: "seguir" }), params);

    expect(res.status).toBe(401);
  });
});
