/**
 * In-memory LRU cache with TTL for search results.
 * Keyed by a hash of normalized query + filters.
 * Avoids redundant DB hits for popular/trending queries.
 */

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 30_000; // 30 seconds

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES, ttlMs = DEFAULT_TTL_MS) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used) by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    // If key exists, delete first to refresh position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      } else {
        break;
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.ttlMs),
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * Prune expired entries. Call periodically to reclaim memory.
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}

/**
 * Builds a deterministic cache key from query parameters.
 */
export function buildCacheKey(params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k] ?? "")}`)
    .join("&");
  return sorted;
}

// Singleton instances for different cache domains
export const searchResultsCache = new LRUCache<unknown>(500, 30_000);
export const suggestCache = new LRUCache<unknown>(200, 30_000);
export const trendingCache = new LRUCache<unknown>(10, 5 * 60_000); // 5 min TTL

// Periodic pruning every 60 seconds
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    searchResultsCache.prune();
    suggestCache.prune();
    trendingCache.prune();
  }, 60_000);
}
