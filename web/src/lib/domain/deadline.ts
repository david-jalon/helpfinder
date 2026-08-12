/**
 * Estado del plazo de solicitud de una ayuda, calculado a partir de la
 * fecha de fin de solicitud (DD/MM/YYYY) y la fecha de hoy.
 * Capa de dominio sin dependencias de infraestructura.
 */

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
 * Umbral de días restantes para etiquetar una convocatoria como «Cierra pronto».
 */
export const CLOSES_SOON_DAYS = 10;

export function deadlineState(
  endDate: string | null | undefined,
  openEnded?: boolean,
  now: Date = new Date()
): DeadlineState {
  if (!endDate && !openEnded) return { kind: "sin-plazo" };
  if (openEnded) return { kind: "indefinido" };

  const end = parseAppDate(endDate);
  if (!end) return { kind: "sin-plazo" };

  end.setHours(23, 59, 59, 999);
  if (end.getTime() < now.getTime()) return { kind: "cerrada" };

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / msPerDay);
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
