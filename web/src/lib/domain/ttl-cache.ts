/**
 * Caché en memoria con caducidad (TTL), pura y testeable.
 *
 * Se usa para no repetir llamadas caras a BDNS (búsquedas y detalles de
 * convocatoria). `now` es inyectable para poder testear la caducidad sin
 * esperar de verdad.
 */

export type TtlCacheOptions = {
  maxEntries: number;
  ttlMs: number;
  now?: () => number;
};

export type TtlCache<T> = {
  get(key: string): T | null;
  set(key: string, value: T): void;
  clear(): void;
  size(): number;
};

export function createTtlCache<T>({
  maxEntries,
  ttlMs,
  now = Date.now,
}: TtlCacheOptions): TtlCache<T> {
  const store = new Map<string, { expiresAt: number; value: T }>();

  function evictIfNeeded(): void {
    while (store.size > maxEntries) {
      const first = store.keys().next().value;
      if (first === undefined) break;
      store.delete(first);
    }
  }

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (now() >= entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value) {
      if (ttlMs <= 0) return;
      store.set(key, { expiresAt: now() + ttlMs, value });
      evictIfNeeded();
    },
    clear() {
      store.clear();
    },
    size() {
      return store.size;
    },
  };
}
