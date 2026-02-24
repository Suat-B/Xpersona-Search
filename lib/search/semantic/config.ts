import type { EmbeddingProvider } from "./provider";
import { OpenAIEmbeddingProvider } from "./openai-provider";

let providerCache: EmbeddingProvider | null | undefined;

export function isSemanticSearchEnabled(): boolean {
  return process.env.SEARCH_SEMANTIC_ENABLED !== "0";
}

export function getSemanticCandidatesLimit(): number {
  const raw = Number(process.env.SEARCH_SEMANTIC_CANDIDATES ?? "80");
  if (!Number.isFinite(raw) || raw <= 0) return 80;
  return Math.min(300, Math.max(10, Math.floor(raw)));
}

export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (providerCache !== undefined) return providerCache;

  const providerName = (process.env.SEARCH_EMBEDDING_PROVIDER ?? "openai").toLowerCase();
  if (providerName === "openai") {
    const model = process.env.SEARCH_EMBEDDING_MODEL ?? "text-embedding-3-small";
    const provider = new OpenAIEmbeddingProvider(model, 1536);
    providerCache = provider.isAvailable() ? provider : null;
    return providerCache;
  }

  providerCache = null;
  return providerCache;
}

