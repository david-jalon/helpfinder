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
  /** Regiones de impacto limpias (sin prefijo BDNS), p.ej. "Madrid". */
  impactRegions: string[];
  /** Fechas del periodo de solicitud (formato DD/MM/YYYY, null si no aplica). */
  applicationStartDate: string | null;
  applicationEndDate: string | null;
  /** Texto referencial del plazo (ej. "DÍA SIGUIENTE DE SU PUBLICACIÓN"). */
  applicationStartText: string | null;
  applicationEndText: string | null;
  /** true = se puede solicitar indefinidamente. */
  openEnded: boolean;
  /** Fecha de publicación (DD/MM/YYYY o ISO, según la fuente), para inferir plazos referenciales. */
  publicationDate: string | null;
  /** Presupuesto total de la convocatoria en euros (BDNS «presupuestoTotal»), o null. */
  amount: number | null;
  /** Tipos de beneficiario elegibles (BDNS «tiposBeneficiarios»). */
  beneficiaryTypes: string[];
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

/**
 * Extrae regiones de impacto de la elegibilidad (o null) y las devuelve
 * limpias: "ES300 - Madrid" → "Madrid". Deduplica y descarta vacías.
 */
export function formatImpactRegions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.replace(/^ES\d{2,3}\s*-\s*/i, "").trim();
    if (!name) continue;
    seen.add(name);
  }
  return Array.from(seen);
}

export function isAlertDecision(
  value: unknown
): value is "seguir" | "posible" | "denegada" | null {
  return value === null || (typeof value === "string" && DECISIONS.has(value));
}

/* ------------------------------------------------------------------ */
/*  Puro: acciones de triaje visibles según el estado actual            */
/* ------------------------------------------------------------------ */

export type TriageAction =
  | { key: "seguir"; label: string }
  | { key: "posible"; label: string }
  | { key: "denegada"; label: string }
  | { key: "eliminar"; label: string };

/**
 * Botones de triaje que se muestran en una tarjeta según su `decision`.
 * El botón del estado actual se oculta (la ayuda ya está ahí); en su
 * lugar, una ayuda denegada ofrece «Eliminar» (borrado definitivo).
 * - null (pendiente)      → Seguir · Posible · Denegar
 * - "seguir"              → Posible · Denegar
 * - "posible"             → Seguir · Denegar
 * - "denegada"            → Seguir · Posible · Eliminar
 */
export function triageActionsFor(decision: AlertDecision): TriageAction[] {
  const base: TriageAction[] = [
    { key: "seguir", label: "Seguir" },
    { key: "posible", label: "Posible" },
    { key: "denegada", label: "Denegar" },
  ];

  const actions = base.filter((action) => action.key !== decision);

  if (decision === "denegada") {
    actions.push({ key: "eliminar", label: "Eliminar" });
  }

  return actions;
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
    impactRegions: formatImpactRegions(grant?.eligibilityJson?.impactRegions),
    applicationStartDate:
      typeof grant?.eligibilityJson?.applicationStartDate === "string"
        ? grant.eligibilityJson.applicationStartDate
        : null,
    applicationEndDate:
      typeof grant?.eligibilityJson?.applicationEndDate === "string"
        ? grant.eligibilityJson.applicationEndDate
        : null,
    applicationStartText:
      typeof grant?.eligibilityJson?.applicationStartText === "string"
        ? grant.eligibilityJson.applicationStartText
        : null,
    applicationEndText:
      typeof grant?.eligibilityJson?.applicationEndText === "string"
        ? grant.eligibilityJson.applicationEndText
        : null,
    openEnded: grant?.eligibilityJson?.openEnded === true,
    publicationDate: grant?.publicationDate ?? null,
    amount:
      typeof grant?.eligibilityJson?.amount === "number" &&
      Number.isFinite(grant.eligibilityJson.amount)
        ? grant.eligibilityJson.amount
        : null,
    beneficiaryTypes: Array.isArray(grant?.eligibilityJson?.beneficiaryTypes)
      ? grant.eligibilityJson.beneficiaryTypes
          .map((v: unknown) => String(v))
          .filter((v: string) => v.trim().length > 0)
      : [],
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
 * ¿Es una alerta que no merece listarse? Las `excluded` no se guardan ni
 * se muestran; este filtro es una red de seguridad por si quedara alguna
 * fila sin limpiar. Los `maybe` SÍ se listan («Quizás te interesen»).
 */
export function isNoiseAlert(alert: AlertDTO): boolean {
  return alert.bucket === "excluded";
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
