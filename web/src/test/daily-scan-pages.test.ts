import { describe, expect, it, vi } from "vitest";
import { fetchAllPages, type PageFetcher } from "@/lib/grants/daily-scan";

type Item = { id: string };

/**
 * `fetchAllPages` es la pieza pura que arregla el Fallo 2: recorre todas las
 * páginas de BDNS en vez de quedarse en la primera. Aquí se prueba con un
 * fetcher falso (sin red).
 */

/** Crea un fetcher que sirve `total` items de `pageSize` en pageo 1-based. */
function makeFetcher(total: number, pageSize: number) {
  return vi.fn(async (page: number): Promise<{ items: Item[]; total: number }> => {
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const items: Item[] = [];
    for (let i = start; i < end; i++) items.push({ id: String(i + 1) });
    return { items, total };
  }) satisfies PageFetcher<Item>;
}

describe("fetchAllPages", () => {
  it("recorre varias páginas hasta agotar el total", async () => {
    const fetcher = makeFetcher(125, 50);

    const result = await fetchAllPages(fetcher, 50, 10);

    expect(result.items).toHaveLength(125);
    expect(result.pagesFetched).toBe(3);
    expect(result.truncated).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("no pide una página de más cuando el total es múltiplo del pageSize", async () => {
    const fetcher = makeFetcher(100, 50);

    const result = await fetchAllPages(fetcher, 50, 10);

    expect(result.items).toHaveLength(100);
    expect(result.pagesFetched).toBe(2);
    expect(result.truncated).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("elimina duplicados por id entre páginas", async () => {
    const fetcher = vi
      .fn<PageFetcher<Item>>()
      .mockResolvedValueOnce({ items: [{ id: "1" }, { id: "2" }], total: 4 })
      .mockResolvedValueOnce({ items: [{ id: "2" }, { id: "3" }], total: 4 });

    // pageSize=2 con 4 de total: la 2ª página llega incompleta (2 items) pero
    // aún faltaría el id 4; el total la corta. Debe deduplicar el id 2.
    const result = await fetchAllPages(fetcher, 2, 10);

    expect(result.items.map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(result.truncated).toBe(false);
  });

  it("se detiene en maxPages y marca truncated=true", async () => {
    // Siempre hay más: 1000 items de 50 en 50 ⇒ nunca llega al total.
    const fetcher = vi.fn(async (page: number) => ({
      items: Array.from({ length: 50 }, (_, i) => ({ id: `${page}-${i}` })),
      total: 1000,
    }));

    const result = await fetchAllPages(fetcher, 50, 3);

    expect(result.pagesFetched).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.items).toHaveLength(150);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("con cero resultados no falla y no marca truncated", async () => {
    const fetcher = vi.fn(async () => ({ items: [], total: 0 }));

    const result = await fetchAllPages(fetcher, 50, 10);

    expect(result.items).toEqual([]);
    expect(result.pagesFetched).toBe(1);
    expect(result.truncated).toBe(false);
  });
});
