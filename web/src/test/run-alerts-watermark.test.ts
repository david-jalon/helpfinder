import { describe, expect, it } from "vitest";
import {
  getNewGrantsLimit,
  nextWatermarkAt,
  nextWatermarkSeq,
} from "@/lib/dashboard/run-alerts";

describe("nextWatermarkSeq", () => {
  it("en la primera visita sin ayudas empieza en 0", () => {
    expect(nextWatermarkSeq(null, [])).toBe(0);
  });

  it("en la primera visita con ayudas usa el seq máximo procesado", () => {
    expect(
      nextWatermarkSeq(null, [{ seq: 10 }, { seq: 42 }, { seq: 7 }])
    ).toBe(42);
  });

  it("sin ayudas nuevas conserva el cursor anterior", () => {
    expect(nextWatermarkSeq(42, [])).toBe(42);
  });

  it("con ayudas nuevas avanza solo hasta el seq máximo procesado", () => {
    expect(
      nextWatermarkSeq(42, [{ seq: 43 }, { seq: 50 }, { seq: 47 }])
    ).toBe(50);
  });

  it("250 filas con el mismo timestamp se procesan en dos pasadas sin perder ninguna", () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({
      seq: index + 1,
      firstSeenAt: "2026-10-01T06:00:00.000Z",
    }));

    let lastSeq = 0;
    const processed: typeof rows = [];

    for (let pass = 0; pass < 2; pass += 1) {
      const batch = rows
        .filter((row) => row.seq > lastSeq)
        .slice(0, 200);

      processed.push(...batch);
      if (batch.length === 0) break;

      lastSeq = nextWatermarkSeq(lastSeq, batch);
    }

    expect(processed).toHaveLength(250);
    expect(lastSeq).toBe(250);
  });
});

describe("nextWatermarkAt", () => {
  const now = "2026-10-02T10:00:00.000Z";

  it("en la primera visita sin ayudas usa ahora", () => {
    expect(nextWatermarkAt(null, [], now)).toBe(now);
  });

  it("sin ayudas nuevas conserva la fecha anterior", () => {
    expect(
      nextWatermarkAt("2026-09-01T00:00:00.000Z", [], now)
    ).toBe("2026-09-01T00:00:00.000Z");
  });

  it("con ayudas usa la fecha de la ayuda con seq máximo", () => {
    expect(
      nextWatermarkAt(
        "2026-09-01T00:00:00.000Z",
        [
          { seq: 10, firstSeenAt: "2026-09-10T00:00:00.000Z" },
          { seq: 12, firstSeenAt: "2026-09-12T00:00:00.000Z" },
          { seq: 11, firstSeenAt: "2026-09-11T00:00:00.000Z" },
        ],
        now
      )
    ).toBe("2026-09-12T00:00:00.000Z");
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
