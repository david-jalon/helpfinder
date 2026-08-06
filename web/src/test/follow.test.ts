import { describe, expect, it } from "vitest";
import { validateFollowGrant } from "@/lib/dashboard/follow";

describe("validateFollowGrant (Seguir desde la landing)", () => {
  it("acepta un grant válido y lo normaliza", () => {
    const res = validateFollowGrant({
      id: "780021",
      title: "  Subvenciones para pymes  ",
      organization: "Ministerio de Industria",
      sourceUrl: "https://www.infosubvenciones.es/...",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.grant.id).toBe("780021");
      expect(res.grant.title).toBe("Subvenciones para pymes");
      expect(res.grant.organization).toBe("Ministerio de Industria");
      expect(res.grant.sourceUrl).toBe("https://www.infosubvenciones.es/...");
    }
  });

  it("convierte campos vacíos a null", () => {
    const res = validateFollowGrant({
      id: "1",
      title: "Ayuda",
      organization: "",
      sourceUrl: "",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.grant.organization).toBeNull();
      expect(res.grant.sourceUrl).toBeNull();
    }
  });

  it("rechaza un id que no es numérico", () => {
    const res = validateFollowGrant({ id: "abc", title: "Ayuda" });
    expect(res.ok).toBe(false);
  });

  it("rechaza un id vacío", () => {
    const res = validateFollowGrant({ id: "", title: "Ayuda" });
    expect(res.ok).toBe(false);
  });

  it("rechaza sin título", () => {
    const res = validateFollowGrant({ id: "1", title: "" });
    expect(res.ok).toBe(false);
  });

  it("rechaza un título excesivamente largo", () => {
    const res = validateFollowGrant({ id: "1", title: "X".repeat(501) });
    expect(res.ok).toBe(false);
  });

  it("rechaza cuerpo que no es objeto", () => {
    expect(validateFollowGrant(null).ok).toBe(false);
    expect(validateFollowGrant("nope").ok).toBe(false);
  });
});
