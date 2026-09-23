import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GrantItem } from "@/lib/domain/grants";
import type { Profile } from "@/lib/domain/profile";
import type { MatchResult } from "@/lib/matching/matcher";
import {
  buildFallbackResults,
  buildPrompt,
  formatScoringError,
  hasAiConfigured,
  parseAiResponse,
  scoreGrantsForUser,
} from "@/lib/ai/grant-scorer";
import type { ScorableGrant } from "@/lib/ai/grant-scorer";

// Mock del SDK de Google para controlar respuestas y errores sin red.
const { generateContent, modelsUsed } = vi.hoisted(() => ({
  generateContent: vi.fn(),
  modelsUsed: [] as string[],
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(options: { model: string }) {
      modelsUsed.push(options.model);
      return { generateContent };
    }
  },
}));

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: "u1",
    profileType: "sociedad",
    colectivos: [],
    regiones: ["madrileña"],
    keywords: "digitalización",
    contextText: "Empresa tecnológica",
    geminiApiKey: "",
    notificationEmail: "",
    emailDigestEnabled: false,
    lastSeenAt: null,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function makeGrant(overrides: Partial<GrantItem> = {}): GrantItem {
  return {
    id: "1",
    title: "Ayuda a la digitalización de pymes",
    organization: "Comunidad de Madrid",
    publicationDate: null,
    deadlineDate: null,
    amount: null,
    sourceUrl: null,
    beneficiaryTypes: ["PYME"],
    sectors: ["Digitalización"],
    impactRegions: ["ES13 - Comunidad de Madrid"],
    purpose: "Impulsar la digitalización",
    instrumentType: "Subvención",
    ...overrides,
  };
}

function makeCandidates(): ScorableGrant[] {
  const matches: MatchResult[] = [
    { id: "1", status: "matched", reasons: ["Coincide con tu región"], rule: null },
    { id: "2", status: "maybe", reasons: [], rule: null },
  ];

  return [
    {
      grant: makeGrant({ id: "1" }),
      match: matches[0],
    },
    {
      grant: makeGrant({ id: "2", title: "Ayuda sin datos claros" }),
      match: matches[1],
    },
  ];
}

describe("hasAiConfigured", () => {
  it("false si la key está vacía", () => {
    expect(hasAiConfigured(makeProfile())).toBe(false);
  });

  it("true si hay key", () => {
    expect(hasAiConfigured(makeProfile({ geminiApiKey: "abc" }))).toBe(true);
  });
});

describe("buildPrompt", () => {
  it("incluye el contexto del perfil y los ids candidatos", () => {
    const prompt = buildPrompt(makeProfile(), makeCandidates());
    expect(prompt).toContain("Tipo de perfil: sociedad o empresa");
    expect(prompt).toContain("digitalización");
    expect(prompt).toContain('"grantId"');
    expect(prompt).toContain("- id: 1");
    expect(prompt).toContain("- id: 2");
  });
});

describe("parseAiResponse", () => {
  it("limpia markdown y parsea scores válidos", () => {
    const raw = "```json\n[{\"grantId\":\"1\",\"score\":85,\"reason\":\"Encaja\"}]\n```";
    const results = parseAiResponse(raw, makeCandidates());
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ grantId: "1", score: 85 });
  });

  it("descarta ids que no estaban en la petición", () => {
    const raw = '[{"grantId":"999","score":90,"reason":"x"}]';
    expect(parseAiResponse(raw, makeCandidates())).toHaveLength(0);
  });

  it("acota el score a 0-100", () => {
    const raw = '[{"grantId":"1","score":250,"reason":"x"}]';
    expect(parseAiResponse(raw, makeCandidates())[0].score).toBe(100);
  });

  it("devuelve lista vacía si el JSON es inválido", () => {
    expect(parseAiResponse("no es json", makeCandidates())).toHaveLength(0);
  });

  it("devuelve lista vacía si no es un array", () => {
    expect(parseAiResponse('{"grantId":"1"}', makeCandidates())).toHaveLength(0);
  });
});

describe("buildFallbackResults", () => {
  it("matched → 70 con el motivo de la regla; maybe → 50", () => {
    const results = buildFallbackResults(makeCandidates());
    expect(results[0]).toMatchObject({
      grantId: "1",
      score: 70,
      reason: expect.stringContaining("Coincide con tu región"),
    });
    expect(results[1]).toMatchObject({ grantId: "2", score: 50 });
  });
});

describe("formatScoringError", () => {
  it("429 se etiqueta como cuota agotada y conserva el detalle", () => {
    const msg = formatScoringError({
      status: 429,
      statusText: "RESOURCE_EXHAUSTED",
      message: "Quota exceeded for metric generate_content_free_tier_requests",
    });
    expect(msg).toContain("Cuota de Gemini agotada (429)");
    expect(msg).toContain("RESOURCE_EXHAUSTED");
    expect(msg).toContain("Quota exceeded");
  });

  it("503 se etiqueta como saturación temporal y conserva el detalle", () => {
    const msg = formatScoringError({
      status: 503,
      statusText: "Service Unavailable",
      message: "This model is currently experiencing high demand",
    });
    expect(msg).toContain("saturado temporalmente (503)");
    expect(msg).toContain("high demand");
  });

  it("otros códigos muestran el status y el detalle", () => {
    const msg = formatScoringError({
      status: 403,
      statusText: "PERMISSION_DENIED",
      message: "API key not restricted",
    });
    expect(msg).toContain("error 403");
    expect(msg).toContain("API key not restricted");
  });

  it("sin status usa el prefijo genérico", () => {
    const msg = formatScoringError({ message: "NetworkError: getaddrinfo" });
    expect(msg).toContain("No se pudo puntuar con IA");
    expect(msg).toContain("NetworkError");
  });

  it("tolera errores vacíos o no objetos", () => {
    expect(formatScoringError({})).toContain("Error desconocido");
    expect(formatScoringError("raw string")).toContain("Error desconocido");
  });
});

describe("scoreGrantsForUser", () => {
  it("devuelve fallback sin key, sin tocar la red", async () => {
    const result = await scoreGrantsForUser(makeProfile(), makeCandidates());
    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.kind).toBe("no-key");
      expect(result.message).toContain("Sin API key");
      expect(result.results).toHaveLength(2);
      expect(result.results[0].grantId).toBe("1");
    }
  });

  it("con lista vacía devuelve ok sin resultados", async () => {
    const result = await scoreGrantsForUser(
      makeProfile({ geminiApiKey: "abc" }),
      []
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.results).toHaveLength(0);
    }
  });
});

describe("scoreGrantsForUser (reintentos y modelos)", () => {
  function aiError(status: number): Error & { status: number; statusText: string } {
    return Object.assign(new Error(`[GoogleGenerativeAI Error] error ${status}`), {
      status,
      statusText: status === 503 ? "Service Unavailable" : "Bad Request",
    });
  }

  function okResponse(payload: unknown) {
    return { response: { text: () => JSON.stringify(payload) } };
  }

  beforeEach(() => {
    generateContent.mockReset();
    modelsUsed.length = 0;
    vi.stubEnv("GEMINI_MODEL", "test-primary");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "test-fallback");
    vi.stubEnv("AI_RETRY_BASE_MS", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reintenta ante 503 y devuelve ok si el segundo intento funciona", async () => {
    vi.stubEnv("AI_RETRY_ATTEMPTS", "2");
    generateContent
      .mockRejectedValueOnce(aiError(503))
      .mockResolvedValueOnce(
        okResponse([{ grantId: "1", score: 90, reason: "Encaja" }])
      );

    const result = await scoreGrantsForUser(
      makeProfile({ geminiApiKey: "AIza-test" }),
      makeCandidates()
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model).toBe("test-primary");
      expect(result.results[0].score).toBe(90);
    }
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(modelsUsed).toEqual(["test-primary"]);
  });

  it("no reintenta ante un error no transitorio (400)", async () => {
    vi.stubEnv("AI_RETRY_ATTEMPTS", "2");
    generateContent.mockRejectedValue(aiError(400));

    const result = await scoreGrantsForUser(
      makeProfile({ geminiApiKey: "AIza-test" }),
      makeCandidates()
    );

    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.kind).toBe("invalid");
    }
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(modelsUsed).toEqual(["test-primary"]);
  });

  it("prueba el modelo de respaldo si el principal sigue con 503", async () => {
    vi.stubEnv("AI_RETRY_ATTEMPTS", "0");
    generateContent.mockRejectedValue(aiError(503));

    const result = await scoreGrantsForUser(
      makeProfile({ geminiApiKey: "AIza-test" }),
      makeCandidates()
    );

    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.kind).toBe("transient");
      expect(result.message).toContain("503");
    }
    expect(modelsUsed).toEqual(["test-primary", "test-fallback"]);
  });

  it("cambia de modelo si el principal no existe (404)", async () => {
    vi.stubEnv("AI_RETRY_ATTEMPTS", "0");
    generateContent
      .mockRejectedValueOnce(aiError(404))
      .mockResolvedValueOnce(
        okResponse([{ grantId: "1", score: 75, reason: "Vale" }])
      );

    const result = await scoreGrantsForUser(
      makeProfile({ geminiApiKey: "AIza-test" }),
      makeCandidates()
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model).toBe("test-fallback");
    }
    expect(modelsUsed).toEqual(["test-primary", "test-fallback"]);
  });
});
