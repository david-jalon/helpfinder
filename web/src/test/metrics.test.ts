import { beforeEach, describe, expect, it } from "vitest";
import {
  incrementMetric,
  metricSnapshot,
  resetMetrics,
} from "@/lib/observability/metrics";

describe("métricas del proceso", () => {
  beforeEach(() => resetMetrics());

  it("empieza a cero", () => {
    expect(metricSnapshot()).toEqual({
      bdns_429: 0,
      ai_fallback: 0,
      enriched_failed: 0,
    });
  });

  it("acumula incrementos por nombre", () => {
    incrementMetric("bdns_429");
    incrementMetric("bdns_429");
    incrementMetric("ai_fallback", 3);

    expect(metricSnapshot()).toEqual({
      bdns_429: 2,
      ai_fallback: 3,
      enriched_failed: 0,
    });
  });

  it("ignora incrementos inválidos", () => {
    incrementMetric("bdns_429", 0);
    incrementMetric("bdns_429", -5);
    incrementMetric("bdns_429", Number.NaN);

    expect(metricSnapshot().bdns_429).toBe(0);
  });

  it("la foto es una copia (no se puede mutar el contador)", () => {
    const snapshot = metricSnapshot();
    snapshot.bdns_429 = 99;

    expect(metricSnapshot().bdns_429).toBe(0);
  });
});
