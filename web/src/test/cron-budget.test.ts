import { describe, expect, it } from "vitest";
import { createTimeBudget, getCronBudgetMs } from "@/lib/cron/budget";

/**
 * El cron debe dejar de empezar trabajo nuevo antes de que Vercel lo mate.
 * El presupuesto es puro y usa un reloj inyectable, así que se prueba sin
 * esperas reales.
 */

describe("createTimeBudget", () => {
  it("mide tiempo transcurrido y restante con el reloj inyectado", () => {
    let t = 1_000;
    const budget = createTimeBudget(10_000, () => t);

    expect(budget.elapsedMs()).toBe(0);
    expect(budget.remainingMs()).toBe(10_000);
    expect(budget.expired()).toBe(false);

    t = 5_000;

    expect(budget.elapsedMs()).toBe(4_000);
    expect(budget.remainingMs()).toBe(6_000);
    expect(budget.hasAtLeast(6_000)).toBe(true);
    expect(budget.hasAtLeast(6_001)).toBe(false);
  });

  it("nunca devuelve valores negativos al pasarse del total", () => {
    let t = 0;
    const budget = createTimeBudget(1_000, () => t);

    t = 5_000;

    expect(budget.remainingMs()).toBe(0);
    expect(budget.expired()).toBe(true);
    expect(budget.hasAtLeast(1)).toBe(false);
  });

  it("con un total inválido nace expirado", () => {
    const budget = createTimeBudget(0);

    expect(budget.totalMs).toBe(0);
    expect(budget.expired()).toBe(true);
  });
});

describe("getCronBudgetMs", () => {
  it("usa 250 s por defecto (50 s de margen sobre los 300 s de Vercel)", () => {
    expect(getCronBudgetMs("")).toBe(250_000);
    expect(getCronBudgetMs("no-es-un-numero")).toBe(250_000);
    expect(getCronBudgetMs("-5")).toBe(250_000);
  });

  it("respeta un valor válido", () => {
    expect(getCronBudgetMs("120000")).toBe(120_000);
  });

  it("no permite superar el máximo de Vercel", () => {
    expect(getCronBudgetMs("999000")).toBe(290_000);
  });

  it("no permite valores por debajo del mínimo útil", () => {
    expect(getCronBudgetMs("1000")).toBe(5_000);
  });
});
