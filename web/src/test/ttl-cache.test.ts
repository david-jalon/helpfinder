import { describe, expect, it } from "vitest";
import { createTtlCache } from "@/lib/domain/ttl-cache";

describe("createTtlCache", () => {
  it("guarda y devuelve valores", () => {
    const cache = createTtlCache<string>({ maxEntries: 10, ttlMs: 1000 });

    cache.set("a", "hola");

    expect(cache.get("a")).toBe("hola");
    expect(cache.get("b")).toBeNull();
  });

  it("caduca pasado el TTL (tiempo inyectado)", () => {
    let now = 0;
    const cache = createTtlCache<string>({
      maxEntries: 10,
      ttlMs: 1000,
      now: () => now,
    });

    cache.set("a", "hola");
    now = 999;
    expect(cache.get("a")).toBe("hola");

    now = 1000;
    expect(cache.get("a")).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it("con ttl 0 no guarda nada (caché desactivada)", () => {
    const cache = createTtlCache<string>({ maxEntries: 10, ttlMs: 0 });

    cache.set("a", "hola");

    expect(cache.get("a")).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it("desaloja las entradas más antiguas al pasar de maxEntries", () => {
    const cache = createTtlCache<number>({ maxEntries: 2, ttlMs: 1000 });

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.size()).toBe(2);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("clear vacía la caché", () => {
    const cache = createTtlCache<number>({ maxEntries: 10, ttlMs: 1000 });
    cache.set("a", 1);

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get("a")).toBeNull();
  });
});
