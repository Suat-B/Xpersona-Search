/**
 * Google Cloud Marketplace AI agents crawler.
 * Expects a structured JSON feed URL from GOOGLE_CLOUD_AGENT_CARDS_FEED_URL.
 * This keeps us on official structured data instead of brittle storefront scraping.
 */
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";

interface GoogleAgentCardFeedItem {
  id?: string;
  name?: string;
  description?: string;
  url?: string;
  homepage?: string;
  agentCardUrl?: string;
  repository?: string;
  capabilities?: string[];
  protocols?: string[];
  installCount?: number;
  verified?: boolean;
  featured?: boolean;
  updatedAt?: string;
}

type GoogleFeedResponse =
  | GoogleAgentCardFeedItem[]
  | { agents?: GoogleAgentCardFeedItem[] };

function getFeedUrl(): string | null {
  const url = process.env.GOOGLE_CLOUD_AGENT_CARDS_FEED_URL ?? "";
  return url.trim() || null;
}

function normalizeGoogleAgent(item: GoogleAgentCardFeedItem) {
  const id = item.id ?? item.agentCardUrl ?? item.url ?? crypto.randomUUID();
  const installCount = Math.max(0, Number(item.installCount ?? 0));
  const freshnessScore = item.updatedAt
    ? Math.max(30, Math.round(100 * Math.exp(-(Date.now() - new Date(item.updatedAt).getTime()) / (1000 * 60 * 60 * 24 * 180))))
    : 45;
  const popularityScore = Math.min(100, Math.round(Math.log10(installCount + 1) * 28));
  return {
    sourceId: `gcp-agent:${id}`,
    source: "GOOGLE_CLOUD_MARKETPLACE" as const,
    name: item.name?.trim() || "Google Cloud agent",
    slug: generateSlug(`gcp-agent-${item.name ?? id}`) || `gcp-agent-${Date.now()}`,
    description: item.description ?? null,
    url: item.url ?? item.agentCardUrl ?? item.homepage ?? "https://cloud.google.com/marketplace",
    homepage: item.homepage ?? item.repository ?? null,
    capabilities: (item.capabilities ?? []).slice(0, 20),
    protocols: (item.protocols ?? []).slice(0, 8),
    languages: [] as string[],
    agentCardUrl: item.agentCardUrl ?? null,
    openclawData: {
      discoverySignals: {
        installCount,
        verified: Boolean(item.verified),
        featured: Boolean(item.featured),
        hasManifest: Boolean(item.agentCardUrl),
        lastUpdatedAt: item.updatedAt ?? null,
        repoLinked: Boolean(item.repository || item.homepage),
        supportsMcp: (item.protocols ?? []).some((protocol) => protocol.toUpperCase() === "MCP"),
        supportsA2a: (item.protocols ?? []).some((protocol) => protocol.toUpperCase() === "A2A"),
      },
    } as Record<string, unknown>,
    readme: item.description ?? "",
    safetyScore: 82,
    popularityScore,
    freshnessScore,
    performanceScore: 0,
    overallRank: Math.round((62 + popularityScore * 0.18 + freshnessScore * 0.18) * 10) / 10,
    status: "ACTIVE" as const,
    lastCrawledAt: new Date(),
    nextCrawlAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  };
}

export async function crawlGoogleCloudMarketplace(
  maxResults: number = 500
): Promise<{ total: number; jobId: string }> {
  const feedUrl = getFeedUrl();
  if (!feedUrl) return { total: 0, jobId: "" };

  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "GOOGLE_CLOUD_MARKETPLACE",
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
    if (!res.ok) throw new Error(`Google Cloud feed returned ${res.status}`);
    const payload = (await res.json()) as GoogleFeedResponse;
    const items = Array.isArray(payload) ? payload : payload.agents ?? [];
    let totalFound = 0;

    for (const item of items.slice(0, maxResults)) {
      const agentData = normalizeGoogleAgent(item);
      await upsertAgent(agentData, {
        name: agentData.name,
        slug: agentData.slug,
        description: agentData.description,
        url: agentData.url,
        homepage: agentData.homepage,
        capabilities: agentData.capabilities,
        protocols: agentData.protocols,
        agentCardUrl: agentData.agentCardUrl,
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
