/**
 * Docker Hub crawler — discovers MCP/agent container images.
 * API: https://hub.docker.com/v2/search/repositories/
 */
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";

const DOCKER_HUB_API = "https://hub.docker.com/v2/search/repositories";
const PAGE_SIZE = 100;

const SEARCH_TERMS = [
  "mcp-server",
  "ai-agent",
  "openclaw",
  "mcp server",
  "model context protocol",
  "langchain agent",
];

interface DockerRepo {
  repo_name: string;
  short_description?: string;
  pull_count?: number;
  star_count?: number;
}

interface DockerSearchResponse {
  count?: number;
  results?: DockerRepo[];
  next?: string;
}

async function searchDockerHub(
  query: string,
  page: number = 1
): Promise<DockerSearchResponse> {
  const url = new URL(DOCKER_HUB_API);
  url.searchParams.set("query", query);
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.app)",
    },
  });
  if (!res.ok) return {};
  return (await res.json()) as DockerSearchResponse;
}

export async function crawlDockerHub(
  maxResults: number = 500
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "DOCKER",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const seenIds = new Set<string>();
  let totalFound = 0;

  try {
    for (const term of SEARCH_TERMS) {
      if (totalFound >= maxResults) break;

      let page = 1;

      while (totalFound < maxResults) {
        const data = await searchDockerHub(term, page);
        const results = data.results ?? [];
        if (results.length === 0) break;

        for (const repo of results) {
          if (totalFound >= maxResults) break;
          if (!repo.repo_name) continue;

          const sourceId = `docker:${repo.repo_name}`;
          if (seenIds.has(sourceId)) continue;
          seenIds.add(sourceId);

          const slug =
            generateSlug(`docker-${repo.repo_name.replace(/\//g, "-")}`) ||
            `docker-${totalFound}`;
          const url = `https://hub.docker.com/r/${repo.repo_name}`;
          const popularityScore = Math.min(
            100,
            Math.round((repo.pull_count ?? 0) / 1000)
          );

          const agentData = {
            sourceId,
            source: "DOCKER" as const,
            name: repo.repo_name.split("/").pop() ?? repo.repo_name,
            slug,
            description: repo.short_description ?? null,
            url,
            homepage: url,
            capabilities: [] as string[],
            protocols: ["MCP", "OPENCLEW"] as string[],
            languages: [] as string[],
            npmData: null,
            openclawData: {
              docker: true,
              pullCount: repo.pull_count,
              starCount: repo.star_count,
            } as Record<string, unknown>,
            readme: repo.short_description ?? "",
            safetyScore: 60,
            popularityScore,
            freshnessScore: 70,
            performanceScore: 0,
            overallRank: 62,
            status: "ACTIVE" as const,
            lastCrawledAt: new Date(),
            nextCrawlAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          };

          await db
            .insert(agents)
            .values(agentData)
            .onConflictDoUpdate({
              target: agents.sourceId,
              set: {
                name: agentData.name,
                description: agentData.description,
                url: agentData.url,
                openclawData: agentData.openclawData,
                popularityScore: agentData.popularityScore,
                lastCrawledAt: agentData.lastCrawledAt,
                nextCrawlAt: agentData.nextCrawlAt,
                updatedAt: new Date(),
              },
            });

          totalFound++;
        }

        page++;
        if (results.length < PAGE_SIZE) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

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
