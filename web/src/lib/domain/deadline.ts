/**
 * Estado del plazo de solicitud de una ayuda, calculado a partir de la
 * fecha de fin de solicitud (DD/MM/YYYY) y la fecha de hoy.
 * Capa de dominio sin dependencias de infraestructura.
 */

import { inferDateFromPublicationText } from "./reltext-date";

export type DeadlineState =
  | { kind: "indefinido" } // abierto: se puede solicitar sin fecha de cierre
  | { kind: "abierta"; daysLeft: number | null }
  | { kind: "cerrada" }
  | { kind: "sin-plazo" }; // no hay datos de plazo

export type DeadlineView = {
  label: string;
  status: "open" | "soon" | "closed" | "indefinido" | "none";
};

export function parseAppDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Acepta tanto DD/MM/YYYY como ISO (YYYY-MM-DD), que es el formato que la
 * BDNS usa en `fechaRecepcion` del listado.
 */
export function parseFlexDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ddmm = parseAppDate(value);
  if (ddmm) return ddmm;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return null;
  const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Resuelve la fecha efectiva de un límite del plazo (inicio o fin):
 *  1. `date` concreto (applicationStartDate/EndDate) gana siempre.
 *  2. Si `date` no existe pero hay `text` referencial y `publicationDate`,
 *     se intenta inferir la fecha (días/meses después de la publicación).
 * Devuelve { date, inferred } donde `inferred=true` marca que salió del texto.
 */
export function resolveEffectiveDate(
  date: string | null | undefined,
  text: string | null | undefined,
  publicationDate: Date | null
): { date: Date | null; inferred: boolean } {
  const parsed = parseFlexDate(date);
  if (parsed) return { date: parsed, inferred: false };
  const inferred = inferDateFromPublicationText(text, publicationDate);
  return { date: inferred, inferred: inferred !== null };
}

/**
 * Resultado de resolver el plazo completo de una ayuda a fechas efectivas.
 */
export type EffectiveDeadline = {
  start: Date | null;
  end: Date | null;
  /** true si al menos un límite salió de una inferencia a partir del texto. */
  inferred: boolean;
  /** true si no hay ninguna fecha calculable (solo texto sin base o nada). */
  byAnnouncement: boolean;
};

export function resolveEffectiveDeadline(args: {
  startDate: string | null | undefined;
  startText: string | null | undefined;
  endDate: string | null | undefined;
  endText: string | null | undefined;
  openEnded?: boolean;
  publicationDate: string | null | undefined;
}): EffectiveDeadline {
  const pub = parseFlexDate(args.publicationDate);

  if (args.openEnded) {
    const start = resolveEffectiveDate(args.startDate, args.startText, pub);
    return { start: start.date, end: null, inferred: start.inferred, byAnnouncement: false };
  }

  const start = resolveEffectiveDate(args.startDate, args.startText, pub);
  const end = resolveEffectiveDate(args.endDate, args.endText, pub);

  const hasAny = start.date !== null || end.date !== null;
  return {
    start: start.date,
    end: end.date,
    inferred: start.inferred || end.inferred,
    byAnnouncement: !hasAny,
  };
}

/**
 * Umbral de días restantes para etiquetar una convocatoria como «Cierra pronto».
 */
export const CLOSES_SOON_DAYS = 10;

export function deadlineState(
  end: Date | string | null | undefined,
  openEnded?: boolean,
  now: Date = new Date()
): DeadlineState {
  if (!end && !openEnded) return { kind: "sin-plazo" };
  if (openEnded) return { kind: "indefinido" };

  const endDate = typeof end === "string" || end === null || end === undefined
    ? parseFlexDate(end)
    : end;
  if (!endDate) return { kind: "sin-plazo" };

  endDate.setHours(23, 59, 59, 999);
  if (endDate.getTime() < now.getTime()) return { kind: "cerrada" };

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / msPerDay);
  return { kind: "abierta", daysLeft };
}

export function deadlineView(state: DeadlineState): DeadlineView {
  switch (state.kind) {
    case "indefinido":
      return { label: "Solicitud abierta", status: "indefinido" };
    case "sin-plazo":
      return { label: "", status: "none" };
    case "cerrada":
      return { label: "Plazo cerrado", status: "closed" };
    case "abierta":
      if (state.daysLeft !== null && state.daysLeft <= CLOSES_SOON_DAYS) {
        return {
          label:
            state.daysLeft <= 0
              ? "¡Cierra hoy!"
              : `Cierra en ${state.daysLeft} día${state.daysLeft === 1 ? "" : "s"}`,
          status: "soon",
        };
      }
      return { label: "Plazo abierto", status: "open" };
  }
}
