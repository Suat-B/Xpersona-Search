/**
 * Smithery.ai crawler — discovers MCP servers from the Smithery registry.
 * API: https://smithery.ai (scraping server listing pages + GitHub links).
 */
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";
import { ingestAgentMedia } from "./media-ingestion";

const SMITHERY_API = "https://registry.smithery.ai/servers";

interface SmitheryServer {
  qualifiedName?: string;
  displayName?: string;
  description?: string;
  homepage?: string;
  useCount?: number;
  createdAt?: string;
  tools?: Array<{ name?: string; description?: string }>;
  connections?: Array<{ type?: string }>;
}

interface SmitheryResponse {
  servers?: SmitheryServer[];
  pagination?: { currentPage?: number; totalPages?: number; totalCount?: number };
  pageSize?: number;
}

async function fetchSmitheryPage(page: number = 1, pageSize: number = 100): Promise<SmitheryResponse> {
  const url = new URL(SMITHERY_API);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.app)",
      },
    });
    if (!res.ok) return {};
    return (await res.json()) as SmitheryResponse;
  } catch {
    return {};
  }
}

export async function crawlSmithery(
  maxResults: number = 2000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "MCP_REGISTRY",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const seenIds = new Set<string>();
  let totalFound = 0;

  try {
    let page = 1;
    let totalPages = 1;

    do {
      const data = await fetchSmitheryPage(page, 100);
      const servers = data.servers ?? [];
      totalPages = data.pagination?.totalPages ?? 1;

      for (const server of servers) {
        if (totalFound >= maxResults) break;

        const name = server.displayName ?? server.qualifiedName ?? "";
        if (!name) continue;

        const qualifiedName = server.qualifiedName ?? name.toLowerCase().replace(/\s+/g, "-");
        const sourceId = `smithery:${qualifiedName}`;
        if (seenIds.has(sourceId)) continue;
        seenIds.add(sourceId);

        const slug =
          generateSlug(`smithery-${qualifiedName.replace(/[/@]/g, "-")}`) ||
          `smithery-${totalFound}`;
        const url = server.homepage ?? `https://smithery.ai/server/${qualifiedName}`;

        const capabilities: string[] = [];
        for (const tool of server.tools ?? []) {
          if (tool.name) capabilities.push(tool.name);
        }

        const popularityScore = Math.min(100, Math.round((server.useCount ?? 0) / 50));
        const createdAt = server.createdAt ? new Date(server.createdAt) : new Date();
        const daysSince = (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
        const freshnessScore = Math.round(100 * Math.exp(-daysSince / 120));

        const agentData = {
          sourceId,
          source: "MCP_REGISTRY" as const,
          name,
          slug,
          description: server.description ?? null,
          url,
          homepage: server.homepage ?? null,
          capabilities: [...new Set(capabilities)].slice(0, 20),
          protocols: ["MCP"] as string[],
          languages: [] as string[],
          openclawData: {
            smithery: true,
            qualifiedName,
            useCount: server.useCount,
            connectionTypes: server.connections?.map((c) => c.type),
          } as Record<string, unknown>,
          readme: server.description ?? "",
          safetyScore: 73,
          popularityScore,
          freshnessScore,
          performanceScore: 0,
          overallRank: Math.round(
            (73 * 0.3 + popularityScore * 0.2 + freshnessScore * 0.2) * 10
          ) / 10,
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
          openclawData: agentData.openclawData,
          popularityScore: agentData.popularityScore,
          freshnessScore: agentData.freshnessScore,
          overallRank: agentData.overallRank,
          lastCrawledAt: agentData.lastCrawledAt,
          nextCrawlAt: agentData.nextCrawlAt,
        });
        await ingestAgentMedia({
          agentSourceId: sourceId,
          agentUrl: url,
          homepageUrl: server.homepage ?? null,
          source: "MCP_REGISTRY",
          readmeOrHtml: server.description ?? "",
          isHtml: false,
          allowHomepageFetch: true,
        });

        totalFound++;
      }

      page++;
      if (servers.length === 0) break;
      await new Promise((r) => setTimeout(r, 400));
    } while (page <= totalPages && totalFound < maxResults);

    await db
      .update(crawlJobs)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        agentsFound: totalFound,
      })
      .where(eq(crawlJobs.id, jobId));
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

  return { total: totalFound, jobId };
}
