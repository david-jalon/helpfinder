import { afterEach, describe, expect, it, vi } from "vitest";
import { isCronAuthorized } from "@/lib/cron/auth";

function request(authorization?: string): Request {
  return new Request("http://localhost/api/cron/enrich", {
    headers: authorization ? { authorization } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isCronAuthorized", () => {
  it("rechaza si no hay CRON_SECRET configurado", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronAuthorized(request("Bearer algo"))).toBe(false);
  });

  it("acepta el bearer correcto", () => {
    vi.stubEnv("CRON_SECRET", "secreto-de-prueba");
    expect(isCronAuthorized(request("Bearer secreto-de-prueba"))).toBe(true);
  });

  it("rechaza un bearer incorrecto o ausente", () => {
    vi.stubEnv("CRON_SECRET", "secreto-de-prueba");
    expect(isCronAuthorized(request("Bearer otro"))).toBe(false);
    expect(isCronAuthorized(request())).toBe(false);
  });
});
