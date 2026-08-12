import { describe, expect, it } from "vitest";
import {
  deadlineState,
  deadlineView,
  parseAppDate,
} from "@/lib/domain/deadline";
import {
  toAppDate,
  parseTextAsDateOrText,
  resolveBound,
} from "@/lib/bdns/detail";

describe("parseAppDate", () => {
  it("parsa DD/MM/YYYY", () => {
    const d = parseAppDate("10/07/2026");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(10);
  });

  it("devuelve null para formato inválido", () => {
    expect(parseAppDate("2026-07-10")).toBeNull();
    expect(parseAppDate(null)).toBeNull();
    expect(parseAppDate("10/07/26")).toBeNull();
  });
});

describe("toAppDate", () => {
  it("convierte ISO a DD/MM/YYYY", () => {
    expect(toAppDate("2026-07-10")).toBe("10/07/2026");
  });

  it("devuelve null si no es una fecha ISO", () => {
    expect(toAppDate("10/07/2026")).toBeNull();
    expect(toAppDate(null)).toBeNull();
    expect(toAppDate(undefined)).toBeNull();
    expect(toAppDate("")).toBeNull();
  });
});

describe("parseTextAsDateOrText", () => {
  it("texto con fecha DD/MM/YYYY → fecha", () => {
    expect(parseTextAsDateOrText("03/09/2026")).toEqual({
      date: "03/09/2026",
      text: null,
    });
  });

  it("texto referencial → texto", () => {
    expect(parseTextAsDateOrText("DÍA SIGUIENTE DE SU PUBLICACIÓN EN EL BOP DE SEVILLA")).toEqual({
      date: null,
      text: "DÍA SIGUIENTE DE SU PUBLICACIÓN EN EL BOP DE SEVILLA",
    });
  });

  it("no string o vacío → null/null", () => {
    expect(parseTextAsDateOrText(null)).toEqual({ date: null, text: null });
    expect(parseTextAsDateOrText("  ")).toEqual({ date: null, text: null });
  });
});

describe("resolveBound (fechas del periodo de solicitud)", () => {
  it("fecha ISO en fechaInicioSolicitud gana sobre el texto", () => {
    expect(resolveBound("2018-07-07", "03/09/2026")).toEqual({
      date: "07/07/2018",
      text: null,
    });
  });

  it("sin fecha ISO, el texto con fecha DD/MM/YYYY se convierte a fecha (caso 923927)", () => {
    expect(resolveBound(null, "03/09/2026")).toEqual({
      date: "03/09/2026",
      text: null,
    });
  });

  it("sin fecha ISO, el texto referencial se conserva (caso Sevilla)", () => {
    expect(resolveBound(null, "DIECISIETE DÍAS DESPUÉS DE SU PUBLICACIÓN")).toEqual({
      date: null,
      text: "DIECISIETE DÍAS DESPUÉS DE SU PUBLICACIÓN",
    });
  });

  it("sin fecha ni texto → null/null", () => {
    expect(resolveBound(null, null)).toEqual({ date: null, text: null });
  });
});

describe("deadlineState / deadlineView", () => {
  const now = new Date(2026, 6, 10, 12, 0, 0); // 10/07/2026 12:00

  it("sin datos → sin-plazo", () => {
    expect(deadlineState(null, false, now).kind).toBe("sin-plazo");
    expect(deadlineView(deadlineState(null, false, now)).status).toBe("none");
  });

  it("openEnded → indefinido", () => {
    expect(deadlineState(null, true, now).kind).toBe("indefinido");
    expect(deadlineView(deadlineState(null, true, now)).label).toBe("Solicitud abierta");
  });

  it("fin en el futuro y lejano → abierta", () => {
    const state = deadlineState("20/08/2026", false, now);
    expect(state.kind).toBe("abierta");
    expect(deadlineView(state).status).toBe("open");
    expect(deadlineView(state).label).toBe("Plazo abierto");
  });

  it("fin dentro de pocos días → cierra pronto", () => {
    const state = deadlineState("13/07/2026", false, now);
    expect(state.kind).toBe("abierta");
    expect(deadlineView(state).status).toBe("soon");
    expect(deadlineView(state).label).toMatch(/Cierra en/);
  });

  it("fin en el pasado → cerrada", () => {
    const state = deadlineState("01/07/2026", false, now);
    expect(state.kind).toBe("cerrada");
    expect(deadlineView(state).status).toBe("closed");
    expect(deadlineView(state).label).toBe("Plazo cerrado");
  });
});
