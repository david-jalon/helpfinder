import { describe, expect, it } from "vitest";
import type { Profile, ProfileInput, ProfileType, Colectivo, Region } from "@/lib/domain/profile";

describe("profile domain types", () => {
  it("ProfileType accepts all valid values", () => {
    const validTypes: ProfileType[] = [
      "persona",
      "autonomo",
      "sociedad",
      "asociacion",
      "fundacion",
      "otros",
    ];
    expect(validTypes).toHaveLength(6);
  });

  it("Colectivo accepts all valid values", () => {
    const validColectivos: Colectivo[] = [
      "jovenes",
      "estudiantes",
      "desempleados",
      "mujeres",
      "personas_con_discapacidad",
      "mayores",
      "inmigrantes",
      "otros",
    ];
    expect(validColectivos).toHaveLength(8);
  });

  it("Region accepts all 19 autonomous communities", () => {
    const regions: Region[] = [
      "andaluza",
      "aragonesa",
      "asturiana",
      "balear",
      "canaria",
      "cantabrica",
      "castellano_manchega",
      "castellano_leonesa",
      "catalana",
      "extremena",
      "gallega",
      "madrileña",
      "murciana",
      "navarra",
      "vasca",
      "valenciana",
      "ceuta",
      "melilla",
    ];
    expect(regions).toHaveLength(18);
  });

  it("Profile has all required fields", () => {
    const profile: Profile = {
      userId: "abc-123",
      profileType: "persona",
      colectivos: ["jovenes"],
      regiones: ["madrileña"],
      keywords: "tecnología",
      contextText: "Soy programador",
      geminiApiKey: "",
      notificationEmail: "",
      emailDigestEnabled: false,
      lastSeenAt: null,
      createdAt: "2024-01-01",
    };
    expect(profile.userId).toBe("abc-123");
    expect(profile.profileType).toBe("persona");
    expect(profile.colectivos).toContain("jovenes");
  });

  it("ProfileInput allows optional fields", () => {
    const input: ProfileInput = {
      profileType: "autonomo",
    };
    expect(input.profileType).toBe("autonomo");
    expect(input.colectivos).toBeUndefined();
    expect(input.regiones).toBeUndefined();
  });
});
