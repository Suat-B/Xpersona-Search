import { LRUCache } from "@/lib/search/cache";

const queryEmbeddingCache = new LRUCache<number[]>(250, 5 * 60_000);

function keyFor(provider: string, model: string, query: string): string {
  return `${provider}:${model}:${query.trim().toLowerCase()}`;
}

export async function getOrCreateQueryEmbedding(
  provider: string,
  model: string,
  query: string,
  loader: () => Promise<number[]>
): Promise<number[]> {
  const key = keyFor(provider, model, query);
  const cached = queryEmbeddingCache.get(key);
  if (cached) return cached;
  const vector = await loader();
  queryEmbeddingCache.set(key, vector);
  return vector;
}

