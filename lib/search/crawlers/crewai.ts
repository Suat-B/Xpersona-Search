/**
 * CrewAI crawler — discovers CrewAI agents from GitHub repos and PyPI packages.
 * Uses GitHub code search for crew.py files and PyPI search for crewai packages.
 */
import pLimit from "p-limit";
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { octokit, fetchRepoDetails, fetchFileContent } from "../utils/github";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";
import {
  calculatePopularityScore,
  calculateFreshnessScore,
  calculateOverallRank,
} from "../scoring/rank";

const CONCURRENCY = 3;
const PAGE_SIZE = 100;
const MAX_PAGES_PER_QUERY = 10;
const RATE_LIMIT_DELAY_MS = 1200;

const SEARCH_QUERIES = [
  "filename:crew.py crewai",
  "filename:crew.py from crewai",
  "topic:crewai",
  "crewai agent in:description",
  "crewai multi-agent",
  "filename:agents.yaml crewai",
  "filename:tasks.yaml crewai",
  "crewai crew stars:>5",
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function crawlCrewAI(
  maxResults: number = 1000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "GITHUB_REPOS",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const limit = pLimit(CONCURRENCY);
  const seenIds = new Set<number>();
  let totalFound = 0;

  try {
    for (const query of SEARCH_QUERIES) {
      if (totalFound >= maxResults) break;

      const isCodeSearch = query.startsWith("filename:") || query.includes("from crewai");
      let page = 1;

      while (totalFound < maxResults && page <= MAX_PAGES_PER_QUERY) {
        let items: Array<{ id?: number; full_name?: string; repository?: { full_name?: string } }> = [];

        try {
          if (isCodeSearch) {
            const res = await octokit.rest.search.code({
              q: query,
              sort: "indexed",
              order: "desc",
              per_page: PAGE_SIZE,
              page,
            });
            items = (res.data.items ?? []).map((item: { repository?: { full_name?: string; id?: number } }) => ({
              id: item.repository?.id,
              full_name: item.repository?.full_name,
            }));
          } else {
            const res = await octokit.rest.search.repos({
              q: query,
              sort: "stars",
              order: "desc",
              per_page: PAGE_SIZE,
              page,
            });
            items = res.data.items ?? [];
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Cannot access beyond") || (err as { status?: number })?.status === 422) break;
          throw err;
        }

        if (items.length === 0) break;

        for (const item of items) {
          if (totalFound >= maxResults) break;
          if (!item.full_name) continue;

          const repoId = item.id ?? 0;
          if (seenIds.has(repoId)) continue;
          seenIds.add(repoId);

          const repo = await limit(() => fetchRepoDetails(item.full_name!));
          if (!repo) continue;

          const sourceId = `crewai:${repo.id}`;
          const readme = await limit(() =>
            fetchFileContent(repo.full_name, "README.md", repo.default_branch)
          );

          const popularityScore = calculatePopularityScore(repo);
          const freshnessScore = calculateFreshnessScore(repo);
          const safetyScore = repo.stargazers_count > 10 ? 70 : 60;

          const slug = generateSlug(`crewai-${repo.full_name.replace("/", "-")}`) || `crewai-${totalFound}`;

          const agentData = {
            sourceId,
            source: "GITHUB_REPOS" as const,
            name: repo.name,
            slug,
            description: repo.description ?? null,
            url: repo.html_url,
            homepage: null,
            capabilities: ["crewai", "multi-agent"] as string[],
            protocols: ["OPENCLEW"] as string[],
            languages: ["python"] as string[],
            githubData: {
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              lastCommit: repo.pushed_at,
              defaultBranch: repo.default_branch,
            },
            openclawData: { crewai: true } as Record<string, unknown>,
            readme: readme ?? repo.description ?? "",
            safetyScore,
            popularityScore,
            freshnessScore,
            performanceScore: 0,
            overallRank: calculateOverallRank({
              safety: safetyScore,
              popularity: popularityScore,
              freshness: freshnessScore,
              performance: 0,
            }),
            status: safetyScore >= 50 ? ("ACTIVE" as const) : ("PENDING_REVIEW" as const),
            lastCrawledAt: new Date(),
            nextCrawlAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          };

          await upsertAgent(agentData, {
            name: agentData.name, slug: agentData.slug, description: agentData.description,
            githubData: agentData.githubData, readme: agentData.readme,
            safetyScore: agentData.safetyScore, popularityScore: agentData.popularityScore,
            freshnessScore: agentData.freshnessScore, overallRank: agentData.overallRank,
            status: agentData.status,
            lastCrawledAt: agentData.lastCrawledAt, nextCrawlAt: agentData.nextCrawlAt,
          });
          totalFound++;
        }

        await sleep(RATE_LIMIT_DELAY_MS);
        page++;
        if (items.length < PAGE_SIZE) break;
      }
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
