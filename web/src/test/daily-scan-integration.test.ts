import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchGrants: vi.fn(),
  enrich: vi.fn(),
  getPending: vi.fn(),
  countPending: vi.fn(),
  upsert: vi.fn(),
  knownIds: [] as string[],
}));

vi.mock("@/lib/bdns/client", () => ({
  searchGrants: mocks.searchGrants,
}));

vi.mock("@/lib/bdns/detail", () => ({
  enrichGrantsWithEligibility: mocks.enrich,
}));

vi.mock("@/lib/grants/feed", () => ({
  getGrantsNeedingEnrichment: mocks.getPending,
}));

vi.mock("@/lib/grants/seen-write", () => ({
  countPendingEnrichment: mocks.countPending,
  upsertGrantsSeen: mocks.upsert,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: (_column: string, chunk: string[]) =>
          Promise.resolve({
            data: mocks.knownIds
              .filter((id) => chunk.includes(id))
              .map((id) => ({ num_convocatoria: id })),
            error: null,
          }),
      }),
    }),
  }),
}));

import { dailyScan } from "@/lib/grants/daily-scan";

/**
 * Integración del pipeline del cron con BDNS y Supabase simulados:
 * 500 ayudas en 10 páginas, 100 ya conocidas → 400 nuevas; la mitad se
 * enriquece bien y la otra mitad queda pendiente. También se prueba el corte
 * por presupuesto a mitad de lectura.
 */

const TOTAL_GRANTS = 500;

function mockSearchPages(): void {
  mocks.searchGrants.mockImplementation(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const start = (page - 1) * pageSize;
      const count = Math.max(
        0,
        Math.min(pageSize, TOTAL_GRANTS - start)
      );
      const items = Array.from({ length: count }, (_, i) => ({
        id: String(start + i + 1),
        title: `Ayuda ${start + i + 1}`,
      }));

      return { items, total: TOTAL_GRANTS, page, pageSize };
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.knownIds = Array.from({ length: 100 }, (_, i) => String(i + 1));
  mocks.enrich.mockImplementation(
    async (
      items: { id: string }[],
      _concurrency?: number,
      _fetchFields?: unknown,
      shouldStop?: () => boolean
    ) => {
      const succeeded = new Set<string>();
      let stoppedEarly = false;

      for (const item of items) {
        if (shouldStop?.()) {
          stoppedEarly = true;
          break;
        }
        // Los pares se enriquecen; los impares fallan.
        if (Number(item.id) % 2 === 0) succeeded.add(item.id);
      }

      return { succeeded, stoppedEarly };
    }
  );
  mocks.getPending.mockResolvedValue([]);
  mocks.countPending.mockResolvedValue(0);
  mocks.upsert.mockResolvedValue(undefined);
  mockSearchPages();
});

describe("dailyScan (integración con BDNS y Supabase simulados)", () => {
  it("procesa 500 ayudas, guarda 400 nuevas y deja las fallidas pendientes", async () => {
    const result = await dailyScan({ budgetMs: 250_000 });

    expect(result.totalFetched).toBe(500);
    expect(result.pagesFetched).toBe(10);
    expect(result.truncated).toBe(false);
    expect(result.stopReason).toBe("complete");
    expect(result.newGrantsCount).toBe(400);
    expect(result.enrichedCount).toBe(200);
    expect(result.enrichedFailed).toBe(200);
    expect(result.newPendingCount).toBe(0);
    expect(result.retryEnrichedCount).toBe(0);
    expect(result.retrySkipped).toBe(false);
    expect(result.pendingBacklog).toBe(0);
    expect(mocks.searchGrants).toHaveBeenCalledTimes(10);

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const [savedItems, enrichedIds] = mocks.upsert.mock.calls[0];
    expect(savedItems).toHaveLength(400);
    expect((enrichedIds as Set<string>).size).toBe(200);
  });

  it("corta por presupuesto, guarda lo leído y salta el reintento", async () => {
    let clock = 0;
    mocks.knownIds = [];

    // Cada página tarda 3 s: con 5 s de presupuesto, la 3ª no se pide.
    mocks.searchGrants.mockImplementation(
      async ({ page, pageSize }: { page: number; pageSize: number }) => {
        clock += 3_000;
        const start = (page - 1) * pageSize;
        return {
          items: Array.from({ length: pageSize }, (_, i) => ({
            id: String(start + i + 1),
            title: `Ayuda ${start + i + 1}`,
          })),
          total: 1_000,
          page,
          pageSize,
        };
      }
    );

    const result = await dailyScan({ budgetMs: 5_000, now: () => clock });

    expect(result.stopReason).toBe("time_budget");
    expect(result.truncated).toBe(true);
    expect(result.pagesFetched).toBe(2);
    expect(result.totalFetched).toBe(100);
    expect(result.newGrantsCount).toBe(100);
    expect(result.enrichedCount).toBe(0);
    expect(result.newPendingCount).toBe(100);
    expect(result.retrySkipped).toBe(true);
    expect(result.retryEnrichedCount).toBe(0);
    expect(mocks.getPending).not.toHaveBeenCalled();

    // Se guarda lo leído aunque no se haya enriquecido.
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0]).toHaveLength(100);
  });
});
