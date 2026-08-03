import type { GrantsSearchResult } from "@/lib/domain/grants";

type Entry = { expiresAt: number; payload: GrantsSearchResult };

const MAX_ENTRIES = 200;
const cache = new Map<string, Entry>();

function cloneResult(data: GrantsSearchResult): GrantsSearchResult {
  return JSON.parse(JSON.stringify(data)) as GrantsSearchResult;
}

function evictIfNeeded() {
  while (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

export function getBdnsSearchCacheTtlSeconds(): number {
  const raw = Number(process.env.BDNS_SEARCH_CACHE_TTL_SECONDS ?? "0");
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.floor(raw), 3600);
}

export function getCachedSearch(url: string): GrantsSearchResult | null {
  const ttl = getBdnsSearchCacheTtlSeconds();
  if (ttl <= 0) return null;

  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(url);
    return null;
  }
  return cloneResult(entry.payload);
}

export function setCachedSearch(url: string, data: GrantsSearchResult): void {
  const ttl = getBdnsSearchCacheTtlSeconds();
  if (ttl <= 0) return;

  evictIfNeeded();
  cache.set(url, {
    expiresAt: Date.now() + ttl * 1000,
    payload: cloneResult(data),
  });
}

/** Solo útil en tests o si se desea invalidar manualmente. */
export function clearBdnsSearchCache(): void {
  cache.clear();
}
