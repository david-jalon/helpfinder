/**
 * Run alerts — Fase 11 · Diario de decisiones — Fase 12
 *
 * Orquesta el "gatillo" del dashboard: al abrirlo se generan las alertas
 * del día para el usuario. Flujo:
 *
 *  1. Ayudas NUEVAS desde la última visita (`profiles.last_seen_at`).
 *  2. Matcher determinista (Fase 10) → matched / maybe / excluded.
 *  3. Una llamada Gemini (key del usuario) solo para matched+maybe.
 *  4. Guarda todo en `user_alerts` (upsert idempotente por user+grant).
 *  5. Avanza la marca de agua: `last_seen_at = ahora`.
 *
 * El dashboard NO es solo lo de hoy: es un DIARIO persistente. Por eso
 * esta orquestación solo produce las alertas frescas, y la ruta API las
 * fusiona con las ya guardadas en `user_alerts` (que conservan la
 * decisión de triaje del usuario, Fase 12).
 *
 * Las partes puras (sin BD ni red) están separadas para poder testearlas
 * y para que el cliente del dashboard no arrastre código de servidor:
 *   - grantItemFromSeen: fila grants_seen → GrantItem con elegibilidad.
 *   - buildAlertDTOs: matcher + score → DTOs frescos.
 *   - persistedAlertDTO / mergeAlertLists / isAlertDecision / buildTabSummary
 *     viven en `triage.ts` (módulo sin dependencias de servidor).
 */

import type { GrantItem } from "@/lib/domain/grants";
import type { Profile } from "@/lib/domain/profile";
import { matchGrants, type MatchOutcome } from "@/lib/matching/matcher";
import {
  scoreGrantsForUser,
  type ScoreResult,
  type ScorableGrant,
} from "@/lib/ai/grant-scorer";
import { getGrantsSeenSince, type SeenGrant } from "@/lib/grants/feed";
import { upsertAlerts, upsertProfile, type AlertUpsertInput } from "@/lib/db";
import {
  isAlertDecision,
  persistedAlertDTO,
  mergeAlertLists,
  buildTabSummary,
  type AlertBucket,
  type AlertAiStatus,
  type AlertDecision,
  type AlertDTO,
  type PersistedAlertRow,
  type TabSummary,
} from "@/lib/dashboard/triage";

export type {
  AlertBucket,
  AlertAiStatus,
  AlertDecision,
  AlertDTO,
  PersistedAlertRow,
  TabSummary,
};

export {
  isAlertDecision,
  persistedAlertDTO,
  mergeAlertLists,
  buildTabSummary,
};

export type RunAlertsResult = {
  /** Solo las alertas frescas de ESTA visita (las persistidas se fusionan en la ruta). */
  alerts: AlertDTO[];
  aiStatus: "ok" | "fallback" | null;
  aiMessage: string | null;
};

/* ------------------------------------------------------------------ */
/*  Puro: fila grants_seen → GrantItem con elegibilidad                */
/* ------------------------------------------------------------------ */

export function grantItemFromSeen(row: SeenGrant): GrantItem {
  const eligibility = (row.eligibilityJson ?? {}) as Record<string, unknown>;
  const stringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.map((v) => String(v)).filter((v) => v.trim().length > 0)
      : [];

  return {
    id: row.numConvocatoria,
    title: row.title,
    organization: row.organization,
    publicationDate: null,
    deadlineDate: null,
    amount: null,
    sourceUrl: row.sourceUrl,
    beneficiaryTypes: stringArray(eligibility.beneficiaryTypes),
    sectors: stringArray(eligibility.sectors),
    impactRegions: stringArray(eligibility.impactRegions),
    purpose:
      typeof eligibility.purpose === "string" ? eligibility.purpose : null,
    instrumentType:
      typeof eligibility.instrumentType === "string"
        ? eligibility.instrumentType
        : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Puro: matcher + score → DTOs frescos para el UI                    */
/* ------------------------------------------------------------------ */

export function buildAlertDTOs(
  seenGrants: SeenGrant[],
  outcome: MatchOutcome,
  scoreResult: ScoreResult | null
): AlertDTO[] {
  const byGrantId = new Map(seenGrants.map((row) => [row.numConvocatoria, row]));
  const scores = new Map(
    (scoreResult?.results ?? []).map((r) => [r.grantId, r])
  );
  const globalAiStatus = scoreResult?.status ?? null;

  const makeDto = (
    match: MatchOutcome["matched"][number],
    bucket: AlertBucket
  ): AlertDTO => {
    const row = byGrantId.get(match.id);
    const scoreEntry = scores.get(match.id);

    return {
      id: "",
      grantId: match.id,
      title: row?.title ?? match.id,
      organization: row?.organization ?? null,
      sourceUrl: row?.sourceUrl ?? null,
      bucket,
      score: bucket === "excluded" ? null : (scoreEntry?.score ?? null),
      reason: bucket === "excluded" ? null : (scoreEntry?.reason ?? null),
      matchReasons: match.reasons,
      aiStatus:
        bucket === "excluded"
          ? "pending"
          : globalAiStatus === "ok"
            ? "ok"
            : globalAiStatus === "fallback"
              ? "fallback"
              : "pending",
      decision: null,
    };
  };

  return [
    ...outcome.matched.map((m) => makeDto(m, "matched")),
    ...outcome.maybe.map((m) => makeDto(m, "maybe")),
    ...outcome.excluded.map((m) => makeDto(m, "excluded")),
  ];
}

/* ------------------------------------------------------------------ */
/*  Orquestación con BD (y Gemini si hace falta)                       */
/* ------------------------------------------------------------------ */

export async function runAlerts(profile: Profile): Promise<RunAlertsResult> {
  // 1) Ayudas nuevas desde la última visita
  const seenGrants = await getGrantsSeenSince(profile.lastSeenAt);

  // 2) Matcher determinista
  const items = seenGrants.map(grantItemFromSeen);
  const outcome = matchGrants(profile, items);

  // 3) Una llamada Gemini SOLO con matched+maybe (key del usuario)
  const byId = new Map(items.map((item) => [item.id, item]));
  const candidates: ScorableGrant[] = [...outcome.matched, ...outcome.maybe]
    .map((match) => {
      const grant = byId.get(match.id);
      return grant ? { grant, match } : null;
    })
    .filter((c): c is ScorableGrant => c !== null);

  const scoreResult =
    candidates.length > 0
      ? await scoreGrantsForUser(profile, candidates)
      : null;

  // 4) Persistir alertas (upsert idempotente) y recuperar sus ids
  const dtos = buildAlertDTOs(seenGrants, outcome, scoreResult);

  const upsertInputs: AlertUpsertInput[] = dtos.map((d) => ({
    grantId: d.grantId,
    score: d.score,
    aiReason: d.reason,
    matchReasons: d.matchReasons,
    aiStatus: d.aiStatus,
    bucket: d.bucket,
  }));

  const inserted = await upsertAlerts(profile.userId, upsertInputs);
  const idByGrant = new Map(inserted.map((r) => [r.grant_id, r.id]));
  const alerts = dtos.map((d) => ({ ...d, id: idByGrant.get(d.grantId) ?? "" }));

  // 5) Avanzar la marca de agua para la próxima visita
  const nowIso = new Date().toISOString();
  if (profile.lastSeenAt !== nowIso) {
    await upsertProfile(profile.userId, { lastSeenAt: nowIso });
  }

  return {
    alerts,
    aiStatus: scoreResult?.status ?? null,
    aiMessage:
      scoreResult?.status === "fallback"
        ? scoreResult.message
        : null,
  };
}
