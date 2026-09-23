/**
 * Run alerts — diario de decisiones
 *
 * Orquesta el "gatillo" del dashboard: al abrirlo se generan las alertas
 * del día para el usuario. Flujo:
 *
 *  1. Ayudas NUEVAS desde la última visita (`profiles.last_seen_at`).
 *  2. Matcher determinista → matched / maybe / excluded.
 *  3. Una llamada Gemini (key del usuario) solo para matched+maybe.
 *  4. Guarda todo en `user_alerts` (upsert idempotente por user+grant).
 *  5. Avanza la marca de agua hasta la ayuda más reciente PROCESADA (no
 *     "ahora"): si hubo más nuevas que el tope, las que faltan siguen
 *     contando como nuevas en la próxima apertura.
 *
 * El dashboard NO es solo lo de hoy: es un DIARIO persistente. Por eso
 * esta orquestación solo produce las alertas frescas, y la ruta API las
 * fusiona con las ya guardadas en `user_alerts` (que conservan la
 * decisión de triaje del usuario).
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
import { matchGrant, matchGrants, type MatchOutcome } from "@/lib/matching/matcher";
import {
  hasAiConfigured,
  scoreGrantsForUser,
  type ScoreFallbackKind,
  type ScoreResult,
  type ScorableGrant,
} from "@/lib/ai/grant-scorer";
import {
  getGrantsSeenSince,
  getRecentGrants,
  type SeenGrant,
} from "@/lib/grants/feed";
import { upsertAlerts, upsertProfile, type AlertUpsertInput } from "@/lib/db";
import {
  isAlertDecision,
  isNoiseAlert,
  persistedAlertDTO,
  formatImpactRegions,
  mergeAlertLists,
  buildTabSummary,
  type AlertBucket,
  type AlertAiStatus,
  type AlertDecision,
  type AlertDTO,
  type PersistedAlertRow,
  type TabSummary,
} from "@/lib/dashboard/triage";

export type RunAlertsResult = {
  /** Solo las alertas frescas de ESTA visita (las persistidas se fusionan en la ruta). */
  alerts: AlertDTO[];
  aiStatus: "ok" | "fallback" | null;
  aiMessage: string | null;
  /** El usuario tiene su key de Gemini guardada (distingue "falta key" de "falló la IA"). */
  aiConfigured: boolean;
  /** Motivo del fallback: "no-key" | "transient" | "invalid"; null si no hubo fallback. */
  aiKind: ScoreFallbackKind | null;
};

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
  isNoiseAlert,
  persistedAlertDTO,
  formatImpactRegions,
  mergeAlertLists,
  buildTabSummary,
};

/* ------------------------------------------------------------------ */
/*  Puro: fila grants_seen → GrantItem con elegibilidad                */
/* ------------------------------------------------------------------ */

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((v) => String(v)).filter((v) => v.trim().length > 0)
    : [];
}

export function grantItemFromSeen(row: SeenGrant): GrantItem {
  const eligibility = (row.eligibilityJson ?? {}) as Record<string, unknown>;

  return {
    id: row.numConvocatoria,
    title: row.title,
    organization: row.organization,
    publicationDate: row.publicationDate,
    deadlineDate: null,
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
    applicationStartDate:
      typeof eligibility.applicationStartDate === "string"
        ? eligibility.applicationStartDate
        : null,
    applicationEndDate:
      typeof eligibility.applicationEndDate === "string"
        ? eligibility.applicationEndDate
        : null,
    applicationStartText:
      typeof eligibility.applicationStartText === "string"
        ? eligibility.applicationStartText
        : null,
    applicationEndText:
      typeof eligibility.applicationEndText === "string"
        ? eligibility.applicationEndText
        : null,
    openEnded: eligibility.openEnded === true,
    amount:
      typeof eligibility.amount === "number" && Number.isFinite(eligibility.amount)
        ? eligibility.amount
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
      score: scoreEntry?.score ?? null,
      reason: scoreEntry?.reason ?? null,
      matchReasons: match.reasons,
      aiStatus: scoreEntry
        ? globalAiStatus === "fallback"
          ? "fallback"
          : "ok"
        : "pending",
      rule: match.rule,
      decision: null,
      impactRegions: formatImpactRegions(row?.eligibilityJson?.impactRegions),
      applicationStartDate:
        typeof row?.eligibilityJson?.applicationStartDate === "string"
          ? row.eligibilityJson.applicationStartDate
          : null,
      applicationEndDate:
        typeof row?.eligibilityJson?.applicationEndDate === "string"
          ? row.eligibilityJson.applicationEndDate
          : null,
      applicationStartText:
        typeof row?.eligibilityJson?.applicationStartText === "string"
          ? row.eligibilityJson.applicationStartText
          : null,
      applicationEndText:
        typeof row?.eligibilityJson?.applicationEndText === "string"
          ? row.eligibilityJson.applicationEndText
          : null,
      openEnded: row?.eligibilityJson?.openEnded === true,
      publicationDate: row?.publicationDate ?? null,
      amount:
        typeof row?.eligibilityJson?.amount === "number" &&
        Number.isFinite(row.eligibilityJson.amount)
          ? row.eligibilityJson.amount
          : null,
      beneficiaryTypes: stringArray(row?.eligibilityJson?.beneficiaryTypes),
    };
  };

  return [
    ...outcome.matched.map((m) => makeDto(m, "matched")),
    ...outcome.maybe.map((m) => makeDto(m, "maybe")),
  ];
}

/* ------------------------------------------------------------------ */
/*  Puro: re-bucketeo retroactivo de alertas persistidas               */
/* ------------------------------------------------------------------ */

export type RebucketUpdate = {
  grantId: string;
  bucket: AlertBucket;
  matchReasons: string[];
};

export type RebucketResult = {
  /** DTOs con el bucket y motivos recalculados (conservan triaje y score). */
  alerts: AlertDTO[];
  /** Cambios a escribir en `user_alerts` (solo los que cambian). */
  updates: RebucketUpdate[];
  /** ids de filas `user_alerts` que ya no aplican (reclasificadas excluded). */
  deletes: string[];
};

/**
 * Re-clasifica las alertas persistidas con el matcher ACTUAL, de modo que
 * los cambios de lógica o de perfil se propaguen a lo ya guardado.
 *
 * Conserva `decision`, `score`, `ai_reason` y `ai_status` de la fila; solo
 * recalcula `bucket` y `match_reasons` (que es lo que decide el UI).
 * `rule` se rellena desde el matcher para que el UI pueda cribar el ruido.
 *
 * El triaje del usuario es AUTORITATIVO: las filas con `decision` no nula
 * (seguir/posible/denegada) se conservan tal cual, sin re-bucketeo ni
 * borrado. Un «Seguir» desde la landing no debe desaparecer porque el
 * matcher (o la falta de elegibilidad aún sin enriquecer) lo clasifique
 * como excluded.
 *
 * Las filas SIN decidir (`decision = null`) son las únicas que se
 * re-bucketean; las que el matcher reclasifica como `excluded` ya no
 * aplican al perfil: no se devuelven en `alerts` ni en `updates`, sino
 * en `deletes`.
 */
export function rebucketPersisted(
  profile: Profile,
  rows: PersistedAlertRow[],
  grantById: Map<string, SeenGrant>
): RebucketResult {
  const alerts: AlertDTO[] = [];
  const updates: RebucketUpdate[] = [];
  const deletes: string[] = [];

  for (const row of rows) {
    const grant = grantById.get(row.grant_id);
    if (!grant) {
      alerts.push(persistedAlertDTO(row, null));
      continue;
    }

    // El usuario ya decidió sobre esta ayuda: su triaje manda. Se conserva
    // tal cual (bucket, motivos y rule incluidos) y no se borra jamás.
    if (row.decision !== null && isAlertDecision(row.decision)) {
      alerts.push(persistedAlertDTO(row, grant));
      continue;
    }

    const result = matchGrant(profile, grantItemFromSeen(grant));

    if (result.status === "excluded") {
      deletes.push(row.id);
      continue;
    }

    const changed =
      row.bucket !== result.status ||
      (row.match_reasons ?? []).join("|") !== result.reasons.join("|");

    if (changed) {
      updates.push({
        grantId: row.grant_id,
        bucket: result.status,
        matchReasons: result.reasons,
      });
    }

    const rebucketedRow: PersistedAlertRow = {
      ...row,
      bucket: result.status,
      match_reasons: result.reasons,
    };
    const dto = persistedAlertDTO(rebucketedRow, grant);
    alerts.push({ ...dto, rule: result.rule });
  }

  return { alerts, updates, deletes };
}

/* ------------------------------------------------------------------ */
/*  Orquestación con BD (y Gemini si hace falta)                       */
/* ------------------------------------------------------------------ */

const DEFAULT_NEW_GRANTS_LIMIT = 200;

/** Cuántas ayudas nuevas se procesan como máximo al abrir el panel. */
export function getNewGrantsLimit(): number {
  const raw = Number(
    process.env.AI_MAX_NEW_GRANTS_PER_RUN ?? String(DEFAULT_NEW_GRANTS_LIMIT)
  );
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_NEW_GRANTS_LIMIT;
}

/**
 * Calcula la nueva marca de agua `last_seen_at`.
 * - Primera visita (prev null): ahora; no se revisa el histórico (sin backfill).
 * - Sin ayudas nuevas: se conserva la anterior (no se avanza en balde).
 * - Con ayudas: la fecha de la más reciente REALMENTE procesada, no "ahora".
 *   Si quedaron ayudas sin procesar por el tope, siguen contando como nuevas.
 */
export function nextWatermark(
  prev: string | null,
  processed: Pick<SeenGrant, "firstSeenAt">[],
  nowIso: string
): string {
  if (prev === null) return nowIso;
  if (processed.length === 0) return prev;

  let max = processed[0].firstSeenAt;
  for (const grant of processed) {
    if (grant.firstSeenAt > max) max = grant.firstSeenAt;
  }
  return max;
}

export async function runAlerts(profile: Profile): Promise<RunAlertsResult> {
  const limit = getNewGrantsLimit();

  // 1) Ayudas nuevas desde la última visita.
  //    - Primera visita: las más recientes (sin backfill).
  //    - Resto: desde la marca de agua, de la más antigua a la más nueva,
  //      para no saltarse ninguna si hay más que el tope.
  const lastSeenAt = profile.lastSeenAt;
  const isFirstVisit = lastSeenAt === null;
  const seenGrants = isFirstVisit
    ? await getRecentGrants(limit)
    : await getGrantsSeenSince(lastSeenAt, limit);

  // Para mostrar, lo más reciente primero (la marca de agua avanza sobre
  // `seenGrants`, que en la visita recurrente viene en orden ascendente).
  const orderedGrants = isFirstVisit ? seenGrants : [...seenGrants].reverse();

  // 2) Matcher determinista
  const items = orderedGrants.map(grantItemFromSeen);
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
  const dtos = buildAlertDTOs(orderedGrants, outcome, scoreResult);

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

  // 5) Avanzar la marca de agua SOLO hasta lo realmente procesado.
  const nowIso = new Date().toISOString();
  const watermark = nextWatermark(profile.lastSeenAt, seenGrants, nowIso);
  if (profile.lastSeenAt !== watermark) {
    await upsertProfile(profile.userId, { lastSeenAt: watermark });
  }

  return {
    alerts,
    aiStatus: scoreResult?.status ?? null,
    aiMessage:
      scoreResult?.status === "fallback"
        ? scoreResult.message
        : null,
    aiConfigured: hasAiConfigured(profile),
    aiKind: scoreResult?.status === "fallback" ? scoreResult.kind : null,
  };
}
