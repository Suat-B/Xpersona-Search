/**
 * Vercel Templates crawler — discovers AI/agent templates from the Vercel marketplace.
 * Uses GitHub search for Vercel AI SDK templates and deploy-ready agent projects.
 */
import pLimit from "p-limit";
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { octokit, fetchRepoDetails, isRetryableGitHubError, withGithubTimeout } from "../utils/github";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";
import { buildSearchableReadme } from "../utils/build-readme";
import {
  calculatePopularityScore,
  calculateFreshnessScore,
  calculateOverallRank,
} from "../scoring/rank";
import { ackCandidate, leaseCandidates, requeueCandidate } from "./discovery-frontier";
import { getCrawlMode, isHotOrWarm, type CrawlRuntimeOptions } from "./crawler-mode";

const CONCURRENCY = 3;
const PAGE_SIZE = 100;
const MAX_PAGES_PER_QUERY = 5;
const RATE_LIMIT_DELAY_MS = 1500;

const SEARCH_QUERIES = [
  "topic:vercel-template ai",
  "topic:nextjs-template ai agent",
  "topic:vercel ai-sdk",
  "filename:vercel.json ai agent",
  "topic:ai-template nextjs",
  "vercel deploy ai agent in:description",
  "ai chatbot template nextjs",
  "ai sdk template vercel",
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function crawlVercelTemplates(
  maxResults: number = 1000,
  options?: CrawlRuntimeOptions
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
  const mode = getCrawlMode(options);

  try {
    if (isHotOrWarm(options)) {
      const leased = await leaseCandidates({
        lockOwner: options?.lockOwner ?? "VERCEL_TEMPLATES",
        limit: maxResults,
        minConfidence: mode === "hot" ? 80 : 50,
      });
      for (const candidate of leased) {
        const repo = await fetchRepoDetails(candidate.repoFullName);
        if (!repo) {
          await requeueCandidate(candidate.id, "Repo details unavailable", 30_000);
          continue;
        }
        const hay = `${repo.name} ${repo.description ?? ""}`.toLowerCase();
        if (!hay.includes("vercel") && !hay.includes("nextjs") && !hay.includes("template")) {
          await ackCandidate(candidate.id);
          continue;
        }

        const sourceId = `vercel-template:${repo.id}`;
        const slug = generateSlug(`vercel-${repo.full_name.replace("/", "-")}`) || `vercel-${totalFound}`;
        const popularityScore = calculatePopularityScore(repo);
        const freshnessScore = calculateFreshnessScore(repo);
        const safetyScore = 68;

        const agentData = {
          sourceId,
          source: "GITHUB_REPOS" as const,
          name: repo.name,
          slug,
          description: repo.description ?? null,
          url: repo.html_url,
          homepage: null,
          capabilities: ["vercel", "template", "nextjs"] as string[],
          protocols: [] as string[],
          languages: ["typescript"] as string[],
          githubData: {
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            lastCommit: repo.pushed_at,
            defaultBranch: repo.default_branch,
          },
          openclawData: { vercelTemplate: true } as Record<string, unknown>,
          readme: buildSearchableReadme({
            description: repo.description,
            capabilities: ["vercel", "template", "nextjs"],
            languages: ["typescript"],
            extra: [repo.name, "vercel", "ai", "template"],
          }),
          safetyScore,
          popularityScore,
          freshnessScore,
          performanceScore: 0,
          overallRank: calculateOverallRank({
            safety: safetyScore, popularity: popularityScore,
            freshness: freshnessScore, performance: 0,
          }),
          status: "ACTIVE" as const,
          lastCrawledAt: new Date(),
          nextCrawlAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };

        await upsertAgent(agentData, {
          name: agentData.name, slug: agentData.slug, description: agentData.description,
          githubData: agentData.githubData, readme: agentData.readme,
          popularityScore: agentData.popularityScore, freshnessScore: agentData.freshnessScore,
          overallRank: agentData.overallRank,
          lastCrawledAt: agentData.lastCrawledAt, nextCrawlAt: agentData.nextCrawlAt,
        });
        await ackCandidate(candidate.id);
        totalFound++;
      }
    } else {
    for (const query of SEARCH_QUERIES) {
      if (totalFound >= maxResults) break;

      const isCodeSearch = query.startsWith("filename:");
      let page = 1;

      while (totalFound < maxResults && page <= MAX_PAGES_PER_QUERY) {
        let repoNames: string[] = [];

        try {
          if (isCodeSearch) {
            const res = await withGithubTimeout(
              () =>
                octokit.rest.search.code({
                  q: query, sort: "indexed", order: "desc",
                  per_page: PAGE_SIZE, page,
                }),
              `search.code "${query}" page=${page}`
            );
            repoNames = (res.data.items ?? [])
              .map((item: { repository?: { full_name?: string } }) => item.repository?.full_name)
              .filter(Boolean) as string[];
          } else {
            const res = await withGithubTimeout(
              () =>
                octokit.rest.search.repos({
                  q: query, sort: "stars", order: "desc",
                  per_page: PAGE_SIZE, page,
                }),
              `search.repos "${query}" page=${page}`
            );
            repoNames = (res.data.items ?? [])
              .map((item: { full_name?: string }) => item.full_name)
              .filter(Boolean) as string[];
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Cannot access beyond") || (err as { status?: number })?.status === 422) break;
          if (isRetryableGitHubError(err)) break;
          throw err;
        }

        if (repoNames.length === 0) break;

        for (const fullName of repoNames) {
          if (totalFound >= maxResults) break;

          const repo = await limit(() => fetchRepoDetails(fullName));
          if (!repo) continue;
          if (seenIds.has(repo.id)) continue;
          seenIds.add(repo.id);

          const sourceId = `vercel-template:${repo.id}`;
          const slug = generateSlug(`vercel-${repo.full_name.replace("/", "-")}`) || `vercel-${totalFound}`;
          const popularityScore = calculatePopularityScore(repo);
          const freshnessScore = calculateFreshnessScore(repo);
          const safetyScore = 68;

          const agentData = {
            sourceId,
            source: "GITHUB_REPOS" as const,
            name: repo.name,
            slug,
            description: repo.description ?? null,
            url: repo.html_url,
            homepage: null,
            capabilities: ["vercel", "template", "nextjs"] as string[],
            protocols: [] as string[],
            languages: ["typescript"] as string[],
            githubData: {
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              lastCommit: repo.pushed_at,
              defaultBranch: repo.default_branch,
            },
            openclawData: { vercelTemplate: true } as Record<string, unknown>,
            readme: buildSearchableReadme({
              description: repo.description,
              capabilities: ["vercel", "template", "nextjs"],
              languages: ["typescript"],
              extra: [repo.name, "vercel", "ai", "template"],
            }),
            safetyScore,
            popularityScore,
            freshnessScore,
            performanceScore: 0,
            overallRank: calculateOverallRank({
              safety: safetyScore, popularity: popularityScore,
              freshness: freshnessScore, performance: 0,
            }),
            status: "ACTIVE" as const,
            lastCrawledAt: new Date(),
            nextCrawlAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          };

          await upsertAgent(agentData, {
            name: agentData.name, slug: agentData.slug, description: agentData.description,
            githubData: agentData.githubData, readme: agentData.readme,
            popularityScore: agentData.popularityScore, freshnessScore: agentData.freshnessScore,
            overallRank: agentData.overallRank,
            lastCrawledAt: agentData.lastCrawledAt, nextCrawlAt: agentData.nextCrawlAt,
          });
          totalFound++;
        }

        await sleep(RATE_LIMIT_DELAY_MS);
        page++;
        if (repoNames.length < PAGE_SIZE) break;
      }
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
