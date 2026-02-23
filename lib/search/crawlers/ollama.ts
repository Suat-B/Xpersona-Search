/**
 * Ollama crawler — discovers models from the Ollama library.
 * API: https://ollama.com/api/tags (model listing) and search endpoint.
 */
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";
import { buildSearchableReadme } from "../utils/build-readme";

const OLLAMA_API = "https://ollama.com/api/tags";
const OLLAMA_SEARCH_API = "https://ollama.com/api/models/search";

interface OllamaModel {
  name?: string;
  description?: string;
  tags?: string[];
  pulls?: number;
  updated?: string;
  size?: number;
}

interface OllamaResponse {
  models?: OllamaModel[];
}

const SEARCH_TERMS = [
  "agent",
  "code",
  "chat",
  "llama",
  "mistral",
  "gemma",
  "phi",
  "qwen",
  "deepseek",
  "codellama",
  "wizard",
  "starcoder",
  "stable",
  "dolphin",
  "orca",
  "solar",
  "yi",
  "command-r",
  "nous",
  "hermes",
];

async function fetchOllamaModels(search?: string): Promise<OllamaModel[]> {
  try {
    const url = search
      ? `${OLLAMA_SEARCH_API}?q=${encodeURIComponent(search)}`
      : OLLAMA_API;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.app)",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data as OllamaResponse).models ?? (Array.isArray(data) ? data : []);
  } catch {
    return [];
  }
}

export async function crawlOllama(
  maxResults: number = 1000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "REPLICATE",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const seenIds = new Set<string>();
  let totalFound = 0;

  try {
    const allModels = await fetchOllamaModels();
    const allFromSearch: OllamaModel[] = [];

    for (const term of SEARCH_TERMS) {
      if (totalFound + allModels.length + allFromSearch.length >= maxResults * 2) break;
      const models = await fetchOllamaModels(term);
      allFromSearch.push(...models);
      await new Promise((r) => setTimeout(r, 300));
    }

    const combined = [...allModels, ...allFromSearch];

    for (const model of combined) {
      if (totalFound >= maxResults) break;

      const name = model.name ?? "";
      if (!name) continue;

      const sourceId = `ollama:${name}`;
      if (seenIds.has(sourceId)) continue;
      seenIds.add(sourceId);

      const slug = generateSlug(`ollama-${name.replace(/[/:]/g, "-")}`) || `ollama-${totalFound}`;
      const url = `https://ollama.com/library/${name.split(":")[0]}`;
      const pulls = model.pulls ?? 0;
      const popularityScore = Math.min(100, Math.round(Math.log10(pulls + 1) * 20));

      const updatedAt = model.updated ? new Date(model.updated) : new Date();
      const daysSince = (Date.now() - updatedAt.getTime()) / (24 * 60 * 60 * 1000);
      const freshnessScore = Math.round(100 * Math.exp(-daysSince / 90));

      const agentData = {
        sourceId,
        source: "REPLICATE" as const,
        name: name.split(":")[0],
        slug,
        description: model.description ?? `Ollama model: ${name}`,
        url,
        homepage: url,
        capabilities: (model.tags ?? []).slice(0, 15),
        protocols: [] as string[],
        languages: [] as string[],
        npmData: null,
        openclawData: {
          ollama: true,
          pulls,
          size: model.size,
          tags: model.tags,
        } as Record<string, unknown>,
        readme: buildSearchableReadme({
          description: model.description ?? `Ollama model: ${name}`,
          capabilities: (model.tags ?? []).slice(0, 15),
          tags: model.tags,
          extra: [name],
        }),
        safetyScore: 70,
        popularityScore,
        freshnessScore,
        performanceScore: 0,
        overallRank: Math.round(
          (70 * 0.3 + popularityScore * 0.2 + freshnessScore * 0.2) * 10
        ) / 10,
        status: "ACTIVE" as const,
        lastCrawledAt: new Date(),
        nextCrawlAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      await upsertAgent(agentData, {
        name: agentData.name, slug: agentData.slug, description: agentData.description,
        url: agentData.url, homepage: agentData.homepage,
        openclawData: agentData.openclawData,
        popularityScore: agentData.popularityScore, freshnessScore: agentData.freshnessScore,
        overallRank: agentData.overallRank,
        lastCrawledAt: agentData.lastCrawledAt, nextCrawlAt: agentData.nextCrawlAt,
      });
      totalFound++;
    }

    await db
      .update(crawlJobs)
      .set({ status: "COMPLETED", completedAt: new Date(), agentsFound: totalFound })
      .where(eq(crawlJobs.id, jobId));
  } catch (err) {
    await db
      .update(crawlJobs)
      .set({ status: "FAILED", completedAt: new Date(), error: err instanceof Error ? err.message : String(err) })
      .where(eq(crawlJobs.id, jobId));
    throw err;
  }

  return { total: totalFound, jobId };
}
