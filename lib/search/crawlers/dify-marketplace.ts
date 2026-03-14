/**
 * Dify Marketplace crawler.
 * Uses the official marketplace templates API and normalizes high-signal
 * workflow templates into searchable agent-like listings.
 */
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";

const DIFY_TEMPLATES_API = "https://marketplace.dify.ai/api/v1/templates";

interface DifyTemplate {
  id?: string;
  publisher_type?: string;
  publisher_unique_handle?: string;
  template_name?: string;
  categories?: string[];
  deps_plugins?: string[];
  preferred_languages?: string[];
  overview?: string;
  readme?: string;
  partner_link?: string;
  version?: string;
  usage_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface DifyTemplatesResponse {
  code?: number;
  data?: {
    templates?: DifyTemplate[];
    total?: number;
  };
}

function scorePopularity(usageCount: number): number {
  if (usageCount <= 0) return 18;
  return Math.min(100, Math.round(Math.log10(usageCount + 1) * 32));
}

function scoreFreshness(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 40;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return 40;
  const daysSince = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(20, Math.round(100 * Math.exp(-daysSince / 180)));
}

export function normalizeDifyTemplate(template: DifyTemplate) {
  const id = template.id ?? "";
  const name = template.template_name?.trim() || `Dify template ${id}`;
  const slug =
    generateSlug(`dify-${template.publisher_unique_handle ?? "template"}-${name}`) ||
    `dify-${id}`;
  const usageCount = Math.max(0, Number(template.usage_count ?? 0));
  const popularityScore = scorePopularity(usageCount);
  const freshnessScore = scoreFreshness(template.updated_at ?? template.created_at ?? null);
  const capabilities = [
    "workflow",
    ...(template.categories ?? []),
    ...(template.deps_plugins ?? []).map((plugin) => plugin.split("/").pop() ?? plugin),
  ].slice(0, 20);
  const apiUrl = `${DIFY_TEMPLATES_API}/${encodeURIComponent(id)}`;
  return {
    sourceId: `dify:${id}`,
    source: "DIFY_MARKETPLACE" as const,
    name,
    slug,
    description: template.overview ?? null,
    url: apiUrl,
    homepage: template.partner_link?.trim() || null,
    capabilities,
    protocols: [] as string[],
    languages: (template.preferred_languages ?? []).slice(0, 10),
    openclawData: {
      dify: {
        publisherHandle: template.publisher_unique_handle ?? null,
        publisherType: template.publisher_type ?? null,
        version: template.version ?? null,
        usageCount,
        apiUrl,
        updatedAt: template.updated_at ?? null,
      },
      discoverySignals: {
        installCount: usageCount,
        verified: template.publisher_type === "organization",
        featured: usageCount >= 250,
        hasManifest: true,
        lastUpdatedAt: template.updated_at ?? template.created_at ?? null,
        repoLinked: Boolean(template.partner_link),
      },
    } as Record<string, unknown>,
    readme: template.readme ?? template.overview ?? "",
    safetyScore: 78,
    popularityScore,
    freshnessScore,
    performanceScore: 0,
    overallRank: Math.round((58 + popularityScore * 0.22 + freshnessScore * 0.18) * 10) / 10,
    status: "ACTIVE" as const,
    lastCrawledAt: new Date(),
    nextCrawlAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  };
}

async function fetchDifyPage(page: number, pageSize: number): Promise<{ items: DifyTemplate[]; total: number }> {
  const url = new URL(DIFY_TEMPLATES_API);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.co)",
    },
  });
  if (!res.ok) return { items: [], total: 0 };
  const payload = (await res.json()) as DifyTemplatesResponse;
  return {
    items: payload.data?.templates ?? [],
    total: Number(payload.data?.total ?? 0),
  };
}

export async function crawlDifyMarketplace(
  maxResults: number = 1000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "DIFY_MARKETPLACE",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  let totalFound = 0;

  try {
    let page = 1;
    const pageSize = 100;
    let total = Infinity;

    while (totalFound < maxResults && (page - 1) * pageSize < total) {
      const { items, total: reportedTotal } = await fetchDifyPage(page, pageSize);
      total = reportedTotal || total;
      if (items.length === 0) break;

      for (const item of items) {
        if (totalFound >= maxResults || !item.id) break;
        const agentData = normalizeDifyTemplate(item);
        await upsertAgent(agentData, {
          name: agentData.name,
          slug: agentData.slug,
          description: agentData.description,
          url: agentData.url,
          homepage: agentData.homepage,
          capabilities: agentData.capabilities,
          languages: agentData.languages,
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

      page += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
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
