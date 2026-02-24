interface CacheEntry {
  value: number[];
  expiresAt: number;
}

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 250;
const cache = new Map<string, CacheEntry>();

function keyFor(provider: string, model: string, query: string): string {
  return `${provider}:${model}:${query.trim().toLowerCase()}`;
}

function pruneExpired(now = Date.now()): void {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function evictOldestIfNeeded(): void {
  while (cache.size >= MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (!first) break;
    cache.delete(first);
  }
}

export async function getOrCreateQueryEmbedding(
  provider: string,
  model: string,
  query: string,
  loader: () => Promise<number[]>
): Promise<number[]> {
  const key = keyFor(provider, model, query);
  const now = Date.now();
  pruneExpired(now);

  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    // LRU behavior via delete+set.
    cache.delete(key);
    cache.set(key, existing);
    return existing.value;
  }

  const value = await loader();
  evictOldestIfNeeded();
  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

