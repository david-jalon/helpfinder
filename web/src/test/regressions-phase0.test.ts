import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GrantItem } from "@/lib/domain/grants";
import type { Profile } from "@/lib/domain/profile";
import { fetchGrantEligibility } from "@/lib/bdns/detail";
import { resetBdnsHttpForTests } from "@/lib/bdns/http";
import { nextWatermarkSeq } from "@/lib/dashboard/run-alerts";
import { scoreGrantsForUser, type ScorableGrant } from "@/lib/ai/grant-scorer";
import type { MatchResult } from "@/lib/matching/matcher";
import {
  bdnsDetailFixture,
  createBdnsFetch,
  stubBdnsFetch,
} from "./helpers/bdns-mock";

/**
 * Fase 0 — Tests de regresión "en rojo".
 *
 * Cada test describe el comportamiento DESEADO. Como los fallos todavía no
 * están arreglados, se marcan con `it.fails`: la suite sigue verde, pero si
 * alguien arregla el fallo sin actualizar el test, el `it.fails` se pondrá en
 * rojo y nos avisará de que toca convertirlo en `it`.
 *
 * Fallos cubiertos aquí:
 *   F1 — BDNS 429 sin reintento.
 *   F2 — marca de agua con `first_seen_at` empatados.
 *   F4 — región vacía excluida en vez de `maybe`.
 *   F6 — tope de 10 candidatos en el scoring.
 *
 * F5 (botón «Reintentar» de IA) se reproducirá en la Fase 5, cuando exista
 * el endpoint de re-puntuación y se pueda probar el flujo completo.
 */

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: "u1",
    profileType: "persona",
    colectivos: [],
    regiones: ["madrileña"],
    keywords: "",
    contextText: "",
    geminiApiKey: "",
    notificationEmail: "",
    emailDigestEnabled: false,
    lastSeenAt: null,
    lastSeenSeq: null,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function makeGrant(overrides: Partial<GrantItem> = {}): GrantItem {
  return {
    id: "1",
    title: "Ayuda de prueba",
    organization: "Ayuntamiento de Prueba",
    publicationDate: "2026-10-29",
    deadlineDate: null,
    amount: null,
    sourceUrl: null,
    beneficiaryTypes: ["PERSONAS FÍSICAS"],
    sectors: [],
    impactRegions: ["ES13 - Comunidad de Madrid"],
    purpose: null,
    instrumentType: null,
    ...overrides,
  };
}

function makeMatch(id: string): MatchResult {
  return { id, status: "matched", reasons: [], rule: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateContent.mockReset();
  resetBdnsHttpForTests();
  vi.stubEnv("BDNS_MAX_CONCURRENCY", "1");
  vi.stubEnv("BDNS_MIN_INTERVAL_MS", "0");
  vi.stubEnv("BDNS_RETRIES", "2");
  vi.stubEnv("BDNS_RETRY_BASE_MS", "1");
  vi.stubEnv("BDNS_RETRY_AFTER_MAX_MS", "50");
  vi.stubEnv("BDNS_TIMEOUT_MS", "1000");
});

afterEach(() => {
  resetBdnsHttpForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Fase 0 — regresiones conocidas", () => {
  it("F1: fetchGrantEligibility reintenta un 429 y termina devolviendo datos", async () => {
    const id = `f1-${Date.now()}`;
    let attempts = 0;
    const bdns = createBdnsFetch(() => {
      attempts += 1;
      if (attempts === 1) {
        return { status: 429, headers: { "Retry-After": "1" } };
      }
      return { body: bdnsDetailFixture(id) };
    });

    stubBdnsFetch(bdns);

    const result = await fetchGrantEligibility(id);

    expect(attempts).toBeGreaterThan(1);
    expect(result).not.toBeNull();
    expect(result?.impactRegions).toEqual(["ES13 - Comunidad de Madrid"]);
  });

  it("F1b: un 204 de BDNS se marca como enriquecido sin datos", async () => {
    const id = `f1b-${Date.now()}`;
    const bdns = createBdnsFetch(() => ({ status: 204 }));

    stubBdnsFetch(bdns);

    const result = await fetchGrantEligibility(id);

    expect(result).not.toBeNull();
    expect(result?.noContent).toBe(true);
    expect(result?.impactRegions).toEqual([]);
    expect(bdns.calls).toHaveLength(1);
  });

  it("F2: con 250 filas del mismo timestamp, las 250 se procesan en dos pasadas", () => {
    const sharedTimestamp = "2026-10-01T06:00:00.000Z";
    const rows = Array.from({ length: 250 }, (_, index) => ({
      id: `g${index + 1}`,
      seq: index + 1,
      firstSeenAt: sharedTimestamp,
    }));

    let lastSeq = 0;
    const processed: typeof rows = [];

    // La app pide 200 por pasada y usa `.gt(seq, lastSeq)`.
    for (let pass = 0; pass < 2; pass += 1) {
      const batch = rows
        .filter((row) => row.seq > lastSeq)
        .slice(0, 200);

      processed.push(...batch);
      if (batch.length === 0) break;

      lastSeq = nextWatermarkSeq(lastSeq, batch);
    }

    expect(processed).toHaveLength(250);
  });

  it.fails("F6: 15 candidatos deben puntuarse todos, no solo los 10 primeros", async () => {
    const candidates: ScorableGrant[] = Array.from({ length: 15 }, (_, index) => {
      const id = String(index + 1);
      return { grant: makeGrant({ id }), match: makeMatch(id) };
    });

    generateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify(
            candidates.map((candidate) => ({
              grantId: candidate.grant.id,
              score: 80,
              reason: "Encaja",
            }))
          ),
      },
    });

    const result = await scoreGrantsForUser(
      makeProfile({ geminiApiKey: "AIza-test" }),
      candidates
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.results).toHaveLength(15);
    }
  });
});
