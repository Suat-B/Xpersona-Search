import pLimit from "p-limit";
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { octokit, fetchRepoDetails, fetchFileContent } from "../utils/github";
import { parseSkillMd } from "../parsers/skill-md";
import { calculateSafetyScore } from "../scoring/safety";
import {
  calculatePopularityScore,
  calculateFreshnessScore,
  calculateOverallRank,
} from "../scoring/rank";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";

const CONCURRENCY = 3;
const PAGE_SIZE = 100; // GitHub code search max
const MAX_PAGES_PER_QUERY = 10; // GitHub caps at 1000 results (10 × 100)
const RATE_LIMIT_DELAY_MS = 1200;

const SEARCH_QUERIES = [
  "filename:SKILL.md openclaw",
  "filename:SKILL.md lang:typescript",
  "openclaw skill",
  "SKILL.md cursor",
  "filename:SKILL.md",
  "clawhub skill",
  "SKILL.md openclaw lang:python",
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function crawlOpenClawSkills(
  since?: Date,
  maxResults: number = 500
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "GITHUB_OPENCLEW",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const limit = pLimit(CONCURRENCY);
  const seenSourceIds = new Set<string>();

  let totalFound = 0;

  try {
    for (const searchQuery of SEARCH_QUERIES) {
      if (totalFound >= maxResults) break;
      let page = 1;

      while (totalFound < maxResults && page <= MAX_PAGES_PER_QUERY) {
        let data: { items?: Array<{ repository?: { full_name?: string } }> };
        try {
          const res = await octokit.rest.search.code({
            q: searchQuery,
            sort: "indexed",
            order: "desc",
            per_page: PAGE_SIZE,
            page,
          });
          data = res.data as { items?: Array<{ repository?: { full_name?: string } }> };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Cannot access beyond the first 1000 results") || (err as { status?: number })?.status === 422) {
            break; // Hit GitHub's 1000-result cap, move to next query
          }
          throw err;
        }

        const items = data?.items ?? [];
        if (items.length === 0) break;

        const repos = await Promise.all(
          items.map((item) =>
            limit(() =>
              fetchRepoDetails(item.repository?.full_name ?? "")
            )
          )
        );

        for (const repo of repos) {
          if (!repo || totalFound >= maxResults) continue;
          const sourceId = `github:${repo.id}`;
          if (seenSourceIds.has(sourceId)) continue;
          if (since && new Date(repo.updated_at) <= since) continue;

          const skillContent = await fetchFileContent(
            repo.full_name,
            "SKILL.md",
            repo.default_branch
          );
          if (!skillContent) continue;

          seenSourceIds.add(sourceId);
          const skillData = parseSkillMd(skillContent);
          const safetyScore = await calculateSafetyScore(repo, skillContent);
          const popularityScore = calculatePopularityScore(repo);
          const freshnessScore = calculateFreshnessScore(repo);

          const slug =
            generateSlug(repo.full_name.replace("/", "-")) || `agent-${repo.id}`;

          const agentData = {
            sourceId,
            source: "GITHUB_OPENCLEW" as const,
            name: skillData.name ?? repo.name,
            slug,
            description: skillData.description ?? repo.description ?? null,
            url: repo.html_url,
            homepage: skillData.homepage ?? null,
            capabilities: skillData.capabilities ?? [],
            protocols: skillData.protocols,
            languages: ["typescript"] as string[],
            githubData: {
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              lastCommit: repo.pushed_at,
              defaultBranch: repo.default_branch,
            },
            openclawData: skillData as unknown as Record<string, unknown>,
            readme: skillContent,
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
            nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          };

          await upsertAgent(agentData, {
            name: agentData.name,
            slug: agentData.slug,
            description: agentData.description,
            githubData: agentData.githubData,
            openclawData: agentData.openclawData,
            readme: agentData.readme,
            safetyScore: agentData.safetyScore,
            popularityScore: agentData.popularityScore,
            freshnessScore: agentData.freshnessScore,
            overallRank: agentData.overallRank,
            status: agentData.status,
            lastCrawledAt: agentData.lastCrawledAt,
            nextCrawlAt: agentData.nextCrawlAt,
          });

          totalFound++;
        }

        await sleep(RATE_LIMIT_DELAY_MS);
        page++;
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
