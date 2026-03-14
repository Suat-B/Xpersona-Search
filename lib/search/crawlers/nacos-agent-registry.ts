/**
 * Nacos Agent Registry crawler.
 * Uses Nacos' structured feed when Nacos_AGENT_REGISTRY_FEED_URL is configured.
 */
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";

interface NacosAgent {
  id?: string;
  name?: string;
  description?: string;
  url?: string;
  homepage?: string;
  repository?: string;
  protocols?: string[];
  capabilities?: string[];
  version?: string;
  verified?: boolean;
  updatedAt?: string;
}

type NacosResponse =
  | NacosAgent[]
  | { agents?: NacosAgent[]; items?: NacosAgent[] };

function getFeedUrl(): string | null {
  const url = process.env.NACOS_AGENT_REGISTRY_FEED_URL ?? "";
  return url.trim() || null;
}

export async function crawlNacosAgentRegistry(
  maxResults: number = 500
): Promise<{ total: number; jobId: string }> {
  const feedUrl = getFeedUrl();
  if (!feedUrl) return { total: 0, jobId: "" };

  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "NACOS_AGENT_REGISTRY",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();

  try {
    const res = await fetch(feedUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.co)",
      },
    });
    if (!res.ok) throw new Error(`Nacos registry feed returned ${res.status}`);
    const payload = (await res.json()) as NacosResponse;
    const items = Array.isArray(payload) ? payload : payload.agents ?? payload.items ?? [];
    let totalFound = 0;

    for (const item of items.slice(0, maxResults)) {
      const freshnessScore = item.updatedAt
        ? Math.max(30, Math.round(100 * Math.exp(-(Date.now() - new Date(item.updatedAt).getTime()) / (1000 * 60 * 60 * 24 * 180))))
        : 42;
      const agentData = {
        sourceId: `nacos:${item.id ?? item.url ?? item.name ?? totalFound}`,
        source: "NACOS_AGENT_REGISTRY" as const,
        name: item.name?.trim() || "Nacos agent",
        slug: generateSlug(`nacos-${item.name ?? item.id ?? totalFound}`) || `nacos-${totalFound}`,
        description: item.description ?? null,
        url: item.url ?? item.homepage ?? item.repository ?? "https://nacos.io",
        homepage: item.homepage ?? item.repository ?? null,
        capabilities: (item.capabilities ?? []).slice(0, 20),
        protocols: (item.protocols ?? []).slice(0, 8),
        languages: [] as string[],
        openclawData: {
          nacos: {
            version: item.version ?? null,
          },
          discoverySignals: {
            verified: Boolean(item.verified),
            hasManifest: true,
            lastUpdatedAt: item.updatedAt ?? null,
            repoLinked: Boolean(item.repository || item.homepage),
            supportsMcp: (item.protocols ?? []).some((protocol) => protocol.toUpperCase() === "MCP"),
            supportsA2a: (item.protocols ?? []).some((protocol) => protocol.toUpperCase() === "A2A"),
          },
        } as Record<string, unknown>,
        readme: item.description ?? "",
        safetyScore: 80,
        popularityScore: item.verified ? 52 : 40,
        freshnessScore,
        performanceScore: 0,
        overallRank: Math.round((60 + (item.verified ? 6 : 0) + freshnessScore * 0.18) * 10) / 10,
        status: "ACTIVE" as const,
        lastCrawledAt: new Date(),
        nextCrawlAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      };

      await upsertAgent(agentData, {
        name: agentData.name,
        slug: agentData.slug,
        description: agentData.description,
        url: agentData.url,
        homepage: agentData.homepage,
        capabilities: agentData.capabilities,
        protocols: agentData.protocols,
        openclawData: agentData.openclawData,
        readme: agentData.readme,
        popularityScore: agentData.popularityScore,
        freshnessScore: agentData.freshnessScore,
        overallRank: agentData.overallRank,
        lastCrawledAt: agentData.lastCrawledAt,
        nextCrawlAt: agentData.nextCrawlAt,
      });
      totalFound += 1;
    }

    await db
      .update(crawlJobs)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        agentsFound: totalFound,
      })
      .where(eq(crawlJobs.id, jobId));
    return { total: totalFound, jobId };
  } catch (err) {
    await db
      .update(crawlJobs)
      .set({
        status: "FAILED",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(crawlJobs.id, jobId));
    throw err;
  }
}
