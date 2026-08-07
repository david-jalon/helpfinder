/**
 * Diario de decisiones
 *
 * Helpers PUROS del diario de alertas, sin dependencias de servidor ni BD:
 * se pueden importar desde componentes cliente sin arrastrar `next/headers`.
 *
 * Todo lo que usa la API (run-alerts.ts) lo reexporta desde aquí.
 */

import type { SeenGrant } from "@/lib/grants/feed";

export type AlertBucket = "matched" | "maybe" | "excluded";
export type AlertAiStatus = "ok" | "fallback" | "pending";
export type AlertDecision = "seguir" | "posible" | "denegada" | null;

export type AlertDTO = {
  /** id de la fila en user_alerts (para guardar el triaje). */
  id: string;
  grantId: string;
  title: string;
  organization: string | null;
  sourceUrl: string | null;
  bucket: AlertBucket;
  score: number | null;
  reason: string | null;
  matchReasons: string[];
  aiStatus: AlertAiStatus;
  /** Regla que descartó la ayuda ('beneficiario' | 'region'), o null. */
  rule: string | null;
  /** Triaje del usuario. null = pendiente (sin decidir aún). */
  decision: AlertDecision;
};

/** Fila mínima de `user_alerts` que necesita el mapeador puro. */
export type PersistedAlertRow = {
  id: string;
  grant_id: string;
  score: number | null;
  ai_reason: string | null;
  match_reasons: string[] | null;
  ai_status: string | null;
  bucket: string | null;
  decision: string | null;
};

/* ------------------------------------------------------------------ */
/*  Puro: validación del triaje aceptado por la API                    */
/* ------------------------------------------------------------------ */

const DECISIONS = new Set<string>(["seguir", "posible", "denegada"]);

export function isAlertDecision(
  value: unknown
): value is "seguir" | "posible" | "denegada" | null {
  return value === null || (typeof value === "string" && DECISIONS.has(value));
}

/* ------------------------------------------------------------------ */
/*  Puro: fila user_alerts persistida (+ grants_seen) → DTO            */
/* ------------------------------------------------------------------ */

export function persistedAlertDTO(
  row: PersistedAlertRow,
  grant: SeenGrant | null
): AlertDTO {
  const bucket =
    row.bucket === "matched" || row.bucket === "maybe" || row.bucket === "excluded"
      ? row.bucket
      : "excluded";

  return {
    id: row.id,
    grantId: row.grant_id,
    title: grant?.title ?? row.grant_id,
    organization: grant?.organization ?? null,
    sourceUrl: grant?.sourceUrl ?? null,
    bucket,
    score: row.score === null ? null : Number(row.score),
    reason: row.ai_reason,
    matchReasons: row.match_reasons ?? [],
    aiStatus:
      row.ai_status === "ok" || row.ai_status === "fallback" || row.ai_status === "pending"
        ? row.ai_status
        : "pending",
    rule: null,
    decision: isAlertDecision(row.decision) ? row.decision : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Puro: fusión de frescos (hoy) con persistidos (diario)             */
/* ------------------------------------------------------------------ */

export function mergeAlertLists(
  fresh: AlertDTO[],
  persisted: AlertDTO[]
): AlertDTO[] {
  const decisionByGrant = new Map(
    persisted.map((alert) => [alert.grantId, alert.decision])
  );
  const seenGrantIds = new Set<string>();
  const merged: AlertDTO[] = [];

  // Lo fresco primero (es lo que acaba de puntuarse / detectarse).
  for (const alert of fresh) {
    merged.push({
      ...alert,
      decision: decisionByGrant.get(alert.grantId) ?? alert.decision,
    });
    seenGrantIds.add(alert.grantId);
  }

  // El resto del diario, en el orden persistido (más reciente primero).
  // También se deduplica dentro de persistidos por si hubiera filas viejas.
  for (const alert of persisted) {
    if (seenGrantIds.has(alert.grantId)) continue;
    merged.push(alert);
    seenGrantIds.add(alert.grantId);
  }

  return merged;
}

/* ------------------------------------------------------------------ */
/*  Puro: clasificación de ruido para el UI                            */
/* ------------------------------------------------------------------ */

/**
 * ¿Es una alerta que no merece listarse en «Todas las nuevas»?
 *   - excluded por beneficiario: ayuda solo para personas jurídicas que
 *     nunca aplica a un particular (se listan solo las de otra región).
 *   - maybe sin señal IA: en modo fallback (sin key Gemini) y sin datos de
 *     elegibilidad, es ruido hasta que haya IA o datos.
 */
export function isNoiseAlert(alert: AlertDTO): boolean {
  return (
    (alert.bucket === "excluded" && alert.rule === "beneficiario") ||
    (alert.bucket === "maybe" && alert.aiStatus !== "ok")
  );
}

/* ------------------------------------------------------------------ */
/*  Puro: contadores por estado del diario (pestañas del UI)           */
/* ------------------------------------------------------------------ */

export type TabSummary = {
  pendientes: number;
  seguimiento: number;
  posibles: number;
  denegadas: number;
  total: number;
};

export function buildTabSummary(alerts: AlertDTO[]): TabSummary {
  const summary: TabSummary = {
    pendientes: 0,
    seguimiento: 0,
    posibles: 0,
    denegadas: 0,
    total: alerts.length,
  };

  for (const alert of alerts) {
    if (alert.decision === "seguir") summary.seguimiento++;
    else if (alert.decision === "posible") summary.posibles++;
    else if (alert.decision === "denegada") summary.denegadas++;
    else summary.pendientes++;
  }

  return summary;
}
