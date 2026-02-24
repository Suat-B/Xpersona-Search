/**
 * Vercel Templates crawler with resilient repo-search-first strategy.
 */
import pLimit from "p-limit";
import { ackCandidate, leaseCandidates, requeueCandidate } from "./discovery-frontier";
import { getCrawlMode, isHotOrWarm, type CrawlRuntimeOptions } from "./crawler-mode";
import { runPartitionedRepoSearch } from "./github-search-runner";
import {
  checkpointJob,
  clearCheckpoint,
  completeJob,
  failJob,
  getCheckpoint,
  heartbeatJob,
  startJob,
  toJobMetricsFromGithubContext,
} from "./job-lifecycle";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";
import { buildSearchableReadme } from "../utils/build-readme";
import {
  calculatePopularityScore,
  calculateFreshnessScore,
  calculateOverallRank,
} from "../scoring/rank";
import { createGitHubRequestContext, fetchRepoDetails, searchCode } from "../utils/github";
import { getRepoVisibility, shouldRecrawlSource } from "./github-agent-utils";

const SOURCE = "VERCEL_TEMPLATES";
const CONCURRENCY = 4;
const SEARCH_QUERIES = [
  "topic:vercel-template ai",
  "topic:nextjs-template ai",
  "topic:vercel ai-sdk",
  "topic:ai-template nextjs",
  "vercel deploy ai in:description",
  "chatbot template nextjs",
  "ai sdk template vercel",
] as const;
const CODE_FALLBACK_QUERIES = [
  "filename:vercel.json ai",
  "filename:next.config.ts ai template",
] as const;
const CODE_FALLBACK_PAGES = 2;

interface RepoSearchItem {
  id?: number;
  full_name?: string;
  description?: string | null;
  name?: string;
}

function shouldContinueRun(
  startedAtMs: number,
  ctx: { requests: number },
  options?: CrawlRuntimeOptions
): boolean {
  const withinBudget =
    options?.githubBudget == null || ctx.requests < options.githubBudget;
  const withinTime =
    options?.timeBudgetMs == null || Date.now() - startedAtMs < options.timeBudgetMs;
  return withinBudget && withinTime;
}

async function processRepo(
  repoFullName: string,
  githubCtx: ReturnType<typeof createGitHubRequestContext>,
  options?: CrawlRuntimeOptions
): Promise<number> {
  const repo = await fetchRepoDetails(repoFullName, githubCtx);
  if (!repo) return 0;
  const hay = `${repo.name} ${repo.description ?? ""}`.toLowerCase();
  if (
    !hay.includes("vercel") &&
    !hay.includes("nextjs") &&
    !hay.includes("template")
  ) {
    return 0;
  }

  const sourceId = `vercel-template:${repo.id}`;
  const minRecrawlHours = Number(process.env.CRAWL_MIN_RECRAWL_HOURS ?? "6");
  if (Number.isFinite(minRecrawlHours) && minRecrawlHours > 0) {
    const allowed = await shouldRecrawlSource(sourceId, minRecrawlHours);
    if (!allowed) return 0;
  }

  const slug =
    generateSlug(`vercel-${repo.full_name.replace("/", "-")}`) || `vercel-${repo.id}`;
  const popularityScore = calculatePopularityScore(repo);
  const freshnessScore = calculateFreshnessScore(repo);
  const safetyScore = 68;
  const visibility = getRepoVisibility(repo);
  const now = new Date();

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
      safety: safetyScore,
      popularity: popularityScore,
      freshness: freshnessScore,
      performance: 0,
    }),
    visibility: visibility.visibility,
    publicSearchable: visibility.publicSearchable,
    status: "ACTIVE" as const,
    lastCrawledAt: now,
    nextCrawlAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  };

  await upsertAgent(agentData, {
    name: agentData.name,
    slug: agentData.slug,
    description: agentData.description,
    githubData: agentData.githubData,
    readme: agentData.readme,
    popularityScore: agentData.popularityScore,
    freshnessScore: agentData.freshnessScore,
    overallRank: agentData.overallRank,
    visibility: agentData.visibility,
    publicSearchable: agentData.publicSearchable,
    lastCrawledAt: agentData.lastCrawledAt,
    nextCrawlAt: agentData.nextCrawlAt,
  });
  return 1;
}

export async function crawlVercelTemplates(
  maxResults: number = 1000,
  options?: CrawlRuntimeOptions
): Promise<{ total: number; jobId: string }> {
  const mode = getCrawlMode(options);
  const workerId = options?.workerId ?? options?.lockOwner ?? `crawl:${process.pid}`;
  const { jobId } = await startJob({ source: SOURCE, mode, workerId });
  const githubCtx = createGitHubRequestContext();
  const limit = pLimit(CONCURRENCY);
  const seenIds = new Set<number>();
  const startedAtMs = Date.now();
  let totalFound = 0;
  let skipped = 0;

  try {
    if (isHotOrWarm(options)) {
      const leased = await leaseCandidates({
        lockOwner: options?.lockOwner ?? SOURCE,
        limit: maxResults,
        minConfidence: mode === "hot" ? 80 : 50,
      });
      for (const candidate of leased) {
        if (totalFound >= maxResults) break;
        if (!shouldContinueRun(startedAtMs, githubCtx, options)) break;
        try {
          const added = await processRepo(candidate.repoFullName, githubCtx, options);
          totalFound += added;
          await ackCandidate(candidate.id);
        } catch {
          skipped += 1;
          await requeueCandidate(candidate.id, "Repo processing failed", 60_000);
        }
      }

      await completeJob(jobId, {
        agentsFound: totalFound,
        skipped,
        finishedReason: "completed_hot_warm",
        ...toJobMetricsFromGithubContext(githubCtx),
      });
      return { total: totalFound, jobId };
    }

    const checkpoint =
      (await getCheckpoint(SOURCE, mode)) ??
      ({
        emitted: 0,
      } as Record<string, unknown>);

    await runPartitionedRepoSearch<RepoSearchItem>({
      queries: [...SEARCH_QUERIES],
      maxResults,
      context: githubCtx,
      initialCursor: checkpoint,
      shouldContinue: () => shouldContinueRun(startedAtMs, githubCtx, options),
      onItems: async (items) => {
        const processed = await Promise.all(
          items.map((item) =>
            limit(async () => {
              if (!item.id || !item.full_name) return 0;
              if (seenIds.has(item.id)) return 0;
              seenIds.add(item.id);
              if (totalFound >= maxResults) return 0;
              try {
                const added = await processRepo(item.full_name, githubCtx, options);
                totalFound += added;
                return added;
              } catch {
                skipped += 1;
                return 0;
              }
            })
          )
        );
        return processed.reduce<number>((sum, n) => sum + n, 0);
      },
      onCheckpoint: async (cursor) => {
        await checkpointJob({
          jobId,
          source: SOURCE,
          mode,
          cursor: cursor as unknown as Record<string, unknown>,
          workerId,
          leaseMs: 15 * 60 * 1000,
        });
        await heartbeatJob(jobId, {
          agentsFound: totalFound,
          skipped,
          ...toJobMetricsFromGithubContext(githubCtx),
        });
      },
    });

    if (totalFound < maxResults) {
      for (const query of CODE_FALLBACK_QUERIES) {
        if (!shouldContinueRun(startedAtMs, githubCtx, options)) break;
        if (totalFound >= maxResults) break;
        for (let page = 1; page <= CODE_FALLBACK_PAGES; page++) {
          if (!shouldContinueRun(startedAtMs, githubCtx, options)) break;
          if (totalFound >= maxResults) break;
          try {
            const res = await searchCode(
              {
                q: query,
                sort: "indexed",
                order: "desc",
                per_page: 30,
                page,
              },
              githubCtx
            );
            const items =
              (res.data.items as Array<{
                repository?: { id?: number; full_name?: string };
              }>) ?? [];
            if (items.length === 0) break;
            for (const item of items) {
              if (totalFound >= maxResults) break;
              const repoId = item.repository?.id;
              const fullName = item.repository?.full_name;
              if (!repoId || !fullName) continue;
              if (seenIds.has(repoId)) continue;
              seenIds.add(repoId);
              try {
                const added = await processRepo(fullName, githubCtx, options);
                totalFound += added;
              } catch {
                skipped += 1;
              }
            }
          } catch {
            break;
          }
        }
      }
    }

    await clearCheckpoint(SOURCE, mode);
    await completeJob(jobId, {
      agentsFound: totalFound,
      skipped,
      finishedReason: shouldContinueRun(startedAtMs, githubCtx, options)
        ? "completed"
        : "budget_or_time_cutoff",
      ...toJobMetricsFromGithubContext(githubCtx),
    });
  } catch (err) {
    await failJob(jobId, err, {
      agentsFound: totalFound,
      skipped,
      ...toJobMetricsFromGithubContext(githubCtx),
    });
    throw err;
  }

  return { total: totalFound, jobId };
}
