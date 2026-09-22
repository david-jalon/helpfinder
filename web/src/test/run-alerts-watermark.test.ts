import { describe, expect, it } from "vitest";
import { getNewGrantsLimit, nextWatermark } from "@/lib/dashboard/run-alerts";

describe("nextWatermark", () => {
  const now = "2026-09-21T10:00:00.000Z";

  it("en la primera visita devuelve 'ahora' (sin backfill)", () => {
    expect(
      nextWatermark(null, [{ firstSeenAt: "2020-01-01T00:00:00.000Z" }], now)
    ).toBe(now);
  });

  it("sin ayudas nuevas conserva la marca anterior", () => {
    const prev = "2026-09-20T00:00:00.000Z";
    expect(nextWatermark(prev, [], now)).toBe(prev);
  });

  it("con ayudas avanza solo hasta la más reciente procesada", () => {
    const prev = "2026-09-01T00:00:00.000Z";
    const processed = [
      { firstSeenAt: "2026-09-10T00:00:00.000Z" },
      { firstSeenAt: "2026-09-15T00:00:00.000Z" },
      { firstSeenAt: "2026-09-12T00:00:00.000Z" },
    ];
    expect(nextWatermark(prev, processed, now)).toBe("2026-09-15T00:00:00.000Z");
  });

  it("no salta a 'ahora' si quedaron ayudas sin procesar", () => {
    // Simula un tope: solo se procesan 2 de las nuevas; la marca debe quedar
    // en la más reciente procesada, no en el momento actual.
    const prev = "2026-09-01T00:00:00.000Z";
    const watermark = nextWatermark(
      prev,
      [
        { firstSeenAt: "2026-09-02T00:00:00.000Z" },
        { firstSeenAt: "2026-09-03T00:00:00.000Z" },
      ],
      now
    );
    expect(watermark).toBe("2026-09-03T00:00:00.000Z");
    expect(watermark).not.toBe(now);
  });
});

describe("getNewGrantsLimit", () => {
  it("usa 200 por defecto", () => {
    expect(getNewGrantsLimit()).toBe(200);
  });

  it("respeta AI_MAX_NEW_GRANTS_PER_RUN", () => {
    process.env.AI_MAX_NEW_GRANTS_PER_RUN = "37";
    try {
      expect(getNewGrantsLimit()).toBe(37);
    } finally {
      delete process.env.AI_MAX_NEW_GRANTS_PER_RUN;
    }
  });
});
