import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ upsert: mocks.upsert }),
  }),
}));

import { upsertGrantsSeen } from "@/lib/grants/seen-write";

/**
 * `upsertGrantsSeen` trocea la escritura para no superar el tamaño máximo de
 * petición de PostgREST. Con 500 ayudas simuladas deben salir 5 upserts de
 * 100 filas.
 */

function makeGrants(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    title: `Ayuda ${i + 1}`,
    organization: null,
    sourceUrl: null,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("upsertGrantsSeen", () => {
  it("trocea 500 filas en 5 upserts de 100", async () => {
    await upsertGrantsSeen(makeGrants(500), new Set());

    expect(mocks.upsert).toHaveBeenCalledTimes(5);

    for (const [rows] of mocks.upsert.mock.calls) {
      expect(rows).toHaveLength(100);
    }
  });

  it("no hace ninguna petición si no hay filas", async () => {
    await upsertGrantsSeen([], new Set());

    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("marca enriched_at solo en las ayudas que respondieron", async () => {
    await upsertGrantsSeen(
      [
        { id: "1", title: "A", organization: null, sourceUrl: null },
        { id: "2", title: "B", organization: null, sourceUrl: null },
      ],
      new Set(["2"])
    );

    const [rows] = mocks.upsert.mock.calls[0];

    expect(rows[0].enriched_at).toBeNull();
    expect(typeof rows[1].enriched_at).toBe("string");
  });

  it("propaga el error de Supabase", async () => {
    mocks.upsert.mockResolvedValue({ error: new Error("boom") });

    await expect(upsertGrantsSeen(makeGrants(1), new Set())).rejects.toThrow(
      "boom"
    );
  });
});
