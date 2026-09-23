/**
 * Grant Scorer con IA (Gemini).
 *
 * Puntúa las ayudas que ya pasaron el pre-filtro (matcher) haciendo UNA
 * sola llamada batch a Gemini con la API key del PROPIO usuario.
 *
 * Reglas de oro:
 *   - La key sale de `profile.geminiApiKey` y se usa SOLO en el servidor.
 *   - Nunca viaja al navegador ni se loguea.
 *   - Ante saturación de Gemini (429/5xx) reintenta con backoff y prueba una
 *     cadena de modelos de respaldo antes de rendirse.
 *   - Fallback obligatorio: sin key o si fallan todos los modelos se devuelve
 *     el resultado del matcher con el motivo de la regla. Nunca se rompe.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GrantItem } from "@/lib/domain/grants";
import type { Profile } from "@/lib/domain/profile";
import type { MatchResult } from "@/lib/matching/matcher";

export type ScoredGrant = {
  grantId: string;
  /** 0–100: 0 = nada relevante, 100 = encaja perfectamente. */
  score: number;
  /** Una frase corta en español con el motivo. */
  reason: string;
};

/**
 * Por qué se cayó al fallback, para que el dashboard muestre el aviso
 * correcto (no es lo mismo "te falta la key" que "Gemini está saturado").
 */
export type ScoreFallbackKind = "no-key" | "transient" | "invalid";

export type ScoreResult =
  | { status: "ok"; results: ScoredGrant[]; model: string }
  | {
      status: "fallback";
      results: ScoredGrant[];
      message: string;
      kind: ScoreFallbackKind;
    };

export type ScorableGrant = {
  grant: GrantItem;
  match: MatchResult;
};

/* ------------------------------------------------------------------ */
/*  Configuración (por usuario: su key; el modelo es global)           */
/* ------------------------------------------------------------------ */

/** Modelo principal por defecto: el Flash estable más reciente (GA ago 2026). */
const DEFAULT_MODEL = "gemini-3.8-flash";

/**
 * Cadena de respaldo si el principal está saturado (503) o deja de existir.
 * IMPORTANTE: solo modelos Gemini 3.x vigentes. Los 2.0 están apagados y los
 * 2.5 tienen acceso restringido a cuentas antiguas, así que NO valen de plan B.
 */
const DEFAULT_FALLBACK_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

/** Estados transitorios de Gemini que merecen un reintento. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Cadena de modelos a probar, en orden y sin repetidos:
 * `GEMINI_MODEL` primero y luego `GEMINI_FALLBACK_MODELS` (o los de por defecto).
 */
export function getModels(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const configured = (process.env.GEMINI_FALLBACK_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  const fallbacks = configured.length > 0 ? configured : DEFAULT_FALLBACK_MODELS;
  return [...new Set([primary, ...fallbacks])];
}

function getMaxGrants(): number {
  const raw = Number(process.env.AI_MAX_GRANTS_PER_CALL ?? "10");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
}

function getRetryAttempts(): number {
  const raw = Number(process.env.AI_RETRY_ATTEMPTS ?? "2");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

function getRetryBaseMs(): number {
  const raw = Number(process.env.AI_RETRY_BASE_MS ?? "400");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 400;
}

function errorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

/** ¿Es un error pasajero de Gemini que conviene reintentar? */
export function isRetryableError(error: unknown): boolean {
  const status = errorStatus(error);
  return status !== null && RETRYABLE_STATUSES.has(status);
}

/** Espera exponencial con un poco de azar para no sincronizar reintentos. */
function backoffDelayMs(attempt: number, baseMs: number): number {
  return baseMs * 2 ** attempt + Math.random() * baseMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Un usuario "tiene IA configurada" si guardó su key en el perfil. */
export function hasAiConfigured(profile: Profile): boolean {
  return profile.geminiApiKey.trim().length > 0;
}

/* ------------------------------------------------------------------ */
/*  Prompt                                                             */
/* ------------------------------------------------------------------ */

const PROFILE_TYPE_LABEL: Record<Profile["profileType"], string> = {
  persona: "persona particular",
  autonomo: "autónomo/a",
  sociedad: "sociedad o empresa",
  asociacion: "asociación",
  fundacion: "fundación",
  otros: "otro tipo de entidad",
};

export function buildPrompt(profile: Profile, candidates: ScorableGrant[]): string {
  const contextParts = [
    `Tipo de perfil: ${PROFILE_TYPE_LABEL[profile.profileType]}`,
  ];
  if (profile.regiones.length > 0) {
    contextParts.push(`Regiones: ${profile.regiones.join(", ")}`);
  }
  if (profile.colectivos.length > 0) {
    contextParts.push(`Colectivos: ${profile.colectivos.join(", ")}`);
  }
  if (profile.keywords.trim()) {
    contextParts.push(`Palabras clave: ${profile.keywords.trim()}`);
  }
  if (profile.contextText.trim()) {
    contextParts.push(`Contexto: ${profile.contextText.trim()}`);
  }

  const grantsBlock = candidates
    .map(({ grant, match }) => {
      const parts = [`- id: ${grant.id}`, `  título: ${grant.title}`];
      if (grant.organization) parts.push(`  organismo: ${grant.organization}`);
      if (grant.beneficiaryTypes?.length)
        parts.push(`  beneficiario elegible: ${grant.beneficiaryTypes.join("; ")}`);
      if (grant.sectors?.length) parts.push(`  sector: ${grant.sectors.join("; ")}`);
      if (grant.impactRegions?.length)
        parts.push(`  regiones de impacto: ${grant.impactRegions.join("; ")}`);
      if (grant.purpose) parts.push(`  finalidad: ${grant.purpose}`);
      if (grant.instrumentType) parts.push(`  instrumento: ${grant.instrumentType}`);
      if (match.reasons.length > 0)
        parts.push(`  encaje preliminar: ${match.reasons.join("; ")}`);
      return parts.join("\n");
    })
    .join("\n");

  return `Eres un analista experto en subvenciones y ayudas públicas españolas.

PERFIL DEL USUARIO:
${contextParts.join("\n")}

CONVOCATORIAS CANDIDATAS (ya pre-filtradas, solo encajan a priori):
${grantsBlock}

TAREA:
Para cada convocatoria, puntúa de 0 a 100 lo bien que encaja con el perfil del usuario.
Devuelve ÚNICAMENTE un JSON válido (sin markdown, sin explicación fuera del JSON) con esta estructura:

[
  { "grantId": "<id>", "score": 0-100, "reason": "<1 frase corta en español>" }
]

CRITERIOS:
- 80-100: encaja perfectamente (beneficiario, región y objeto de la ayuda).
- 50-79: encaja bien pero con matices o datos parciales.
- 1-49: encaje flojo; quizá no merezca la pena.
- 0: no encaja con el perfil.

Responde SOLO con el array JSON.`;
}

/* ------------------------------------------------------------------ */
/*  Parser robusto de la respuesta                                     */
/* ------------------------------------------------------------------ */

export function parseAiResponse(
  raw: string,
  candidates: ScorableGrant[]
): ScoredGrant[] {
  const validIds = new Set(candidates.map((c) => c.grant.id));

  let arr: unknown;
  try {
    const cleaned = raw
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    arr = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!Array.isArray(arr)) return [];

  const scored: ScoredGrant[] = [];

  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;

    const grantId = String(obj.grantId ?? "");
    if (!validIds.has(grantId)) continue;

    const rawScore = Number(obj.score);
    const score = Number.isFinite(rawScore)
      ? Math.min(100, Math.max(0, Math.round(rawScore)))
      : 0;

    const reason = typeof obj.reason === "string" ? obj.reason.slice(0, 300) : "";

    scored.push({ grantId, score, reason });
  }

  return scored;
}

/* ------------------------------------------------------------------ */
/*  Fallback: los motivos del matcher sin IA                           */
/* ------------------------------------------------------------------ */

export function buildFallbackResults(candidates: ScorableGrant[]): ScoredGrant[] {
  return candidates.map(({ grant, match }) => {
    if (match.status === "matched") {
      return {
        grantId: grant.id,
        score: 70,
        reason:
          match.reasons.length > 0
            ? `Encaje por reglas: ${match.reasons.join("; ")}`
            : "Encaja con tu perfil según las reglas automáticas",
      };
    }
    return {
      grantId: grant.id,
      score: 50,
      reason: "Podría encajar pero falta información; revisa el detalle",
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Mensaje de error (se muestra en el aviso del dashboard)            */
/* ------------------------------------------------------------------ */

/**
 * Formatea el error real de Gemini para que el usuario (o el log) vea
 * la causa exacta en vez de un "algo falló" genérico.
 * El `message` del SDK ya suele incluir el detalle del servidor.
 */
export function formatScoringError(error: unknown): string {
  const err = error as { status?: unknown; statusText?: unknown; message?: unknown };

  const status = typeof err.status === "number" ? err.status : null;
  const statusText =
    typeof err.statusText === "string" && err.statusText.trim().length > 0
      ? err.statusText.trim()
      : "";
  const detail =
    typeof err.message === "string" && err.message.trim().length > 0
      ? err.message.trim().slice(0, 300)
      : "Error desconocido";

  const parts = [statusText, detail].filter((p) => p.length > 0);

  if (status === 429) {
    return `Cuota de Gemini agotada (429). ${parts.join(" ")}`.trim();
  }
  if (status === 503) {
    return `Gemini está saturado temporalmente (503). ${parts.join(" ")}`.trim();
  }
  if (status !== null) {
    return `Gemini respondió con error ${status}. ${parts.join(" ")}`.trim();
  }
  return `No se pudo puntuar con IA: ${parts.join(" ")}`.trim();
}

/* ------------------------------------------------------------------ */
/*  Llamada a Gemini con reintentos                                    */
/* ------------------------------------------------------------------ */

const SYSTEM_INSTRUCTION =
  "Responde siempre en español. Solo JSON, sin markdown.";

/**
 * Pide a Gemini un modelo concreto, reintentando con backoff si el error es
 * transitorio (429/5xx). Si el error no es reintentable (p. ej. 400/403) se
 * lanza de inmediato para no gastar tiempo ni probar más modelos.
 */
async function generateWithRetry(
  genAI: GoogleGenerativeAI,
  modelName: string,
  prompt: string
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const attempts = getRetryAttempts();
  const baseMs = getRetryBaseMs();
  let lastError: unknown;

  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text() ?? "";
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts) break;
      await sleep(backoffDelayMs(attempt, baseMs));
    }
  }

  throw lastError;
}

/* ------------------------------------------------------------------ */
/*  Función principal                                                  */
/* ------------------------------------------------------------------ */

/**
 * Puntúa las ayudas candidatas con la key del usuario.
 * Prueba la cadena de modelos (principal + respaldos) y reintenta ante
 * errores transitorios. Si no hay key o fallan TODOS los modelos, devuelve
 * el fallback con el motivo de las reglas del matcher. Nunca lanza.
 */
export async function scoreGrantsForUser(
  profile: Profile,
  candidates: ScorableGrant[]
): Promise<ScoreResult> {
  if (!hasAiConfigured(profile)) {
    return {
      status: "fallback",
      kind: "no-key",
      results: buildFallbackResults(candidates),
      message: "Sin API key de Gemini configurada",
    };
  }

  const filtered = candidates.slice(0, getMaxGrants());
  const models = getModels();
  if (filtered.length === 0) {
    return { status: "ok", results: [], model: models[0] };
  }

  const genAI = new GoogleGenerativeAI(profile.geminiApiKey);
  const prompt = buildPrompt(profile, filtered);

  let lastError: unknown;

  for (const modelName of models) {
    try {
      const raw = await generateWithRetry(genAI, modelName, prompt);
      const results = parseAiResponse(raw, filtered);

      if (results.length === 0) {
        return {
          status: "fallback",
          kind: "invalid",
          results: buildFallbackResults(filtered),
          message: "La IA no devolvió puntuaciones válidas",
        };
      }

      return { status: "ok", results, model: modelName };
    } catch (error) {
      lastError = error;
      // Un modelo inexistente (404) o saturado (5xx/429) se salta al
      // siguiente. Cualquier otro error (key inválida, prompt rechazado)
      // no mejora cambiando de modelo: se corta aquí.
      if (!isRetryableError(error) && errorStatus(error) !== 404) break;
    }
  }

  const message = formatScoringError(lastError);

  // Sin loguear la key: solo el error real, para diagnosticar.
  console.error(
    JSON.stringify({ event: "grant_score_error", detail: message })
  );

  return {
    status: "fallback",
    kind: isRetryableError(lastError) ? "transient" : "invalid",
    results: buildFallbackResults(filtered),
    message,
  };
}
