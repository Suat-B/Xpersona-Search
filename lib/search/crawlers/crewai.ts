/**
 * CrewAI crawler with partitioned repo search and resilient lifecycle tracking.
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
import {
  calculatePopularityScore,
  calculateFreshnessScore,
  calculateOverallRank,
} from "../scoring/rank";
import {
  createGitHubRequestContext,
  fetchFileContent,
  fetchRepoDetails,
  searchCode,
  type GitHubRepo,
} from "../utils/github";
import { getRepoVisibility, shouldRecrawlSource } from "./github-agent-utils";

const SOURCE = "CREWAI";
const CONCURRENCY = 4;
const SEARCH_QUERIES = [
  "topic:crewai",
  "crewai in:description",
  "crewai multi-agent in:description",
  "crew ai in:readme",
  "agent orchestration crewai",
] as const;
const CODE_FALLBACK_QUERIES = [
  "filename:crew.py crewai",
  "filename:agents.yaml crewai",
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
  repo: GitHubRepo,
  ctx: ReturnType<typeof createGitHubRequestContext>,
  options?: CrawlRuntimeOptions
): Promise<boolean> {
  const hay = `${repo.name} ${repo.description ?? ""}`.toLowerCase();
  if (!hay.includes("crewai")) return false;
  const sourceId = `crewai:${repo.id}`;
  const minRecrawlHours = Number(process.env.CRAWL_MIN_RECRAWL_HOURS ?? "6");
  if (Number.isFinite(minRecrawlHours) && minRecrawlHours > 0) {
    const allowed = await shouldRecrawlSource(sourceId, minRecrawlHours);
    if (!allowed) return false;
  }

  const readme = await fetchFileContent(repo.full_name, "README.md", repo.default_branch, ctx);
  const popularityScore = calculatePopularityScore(repo);
  const freshnessScore = calculateFreshnessScore(repo);
  const safetyScore = repo.stargazers_count > 10 ? 70 : 60;
  const slug =
    generateSlug(`crewai-${repo.full_name.replace("/", "-")}`) || `crewai-${repo.id}`;
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
    visibility: visibility.visibility,
    publicSearchable: visibility.publicSearchable,
    status: safetyScore >= 50 ? ("ACTIVE" as const) : ("PENDING_REVIEW" as const),
    lastCrawledAt: now,
    nextCrawlAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  };
  await upsertAgent(agentData, {
    name: agentData.name,
    slug: agentData.slug,
    description: agentData.description,
    githubData: agentData.githubData,
    readme: agentData.readme,
    safetyScore: agentData.safetyScore,
    popularityScore: agentData.popularityScore,
    freshnessScore: agentData.freshnessScore,
    overallRank: agentData.overallRank,
    visibility: agentData.visibility,
    publicSearchable: agentData.publicSearchable,
    status: agentData.status,
    lastCrawledAt: agentData.lastCrawledAt,
    nextCrawlAt: agentData.nextCrawlAt,
  });
  return true;
}

export async function crawlCrewAI(
  maxResults: number = 1000,
  options?: CrawlRuntimeOptions
): Promise<{ total: number; jobId: string }> {
  const mode = getCrawlMode(options);
  const workerId = options?.workerId ?? options?.lockOwner ?? `crawl:${process.pid}`;
  const { jobId } = await startJob({ source: SOURCE, mode, workerId });
  const githubCtx = createGitHubRequestContext();
  const seenIds = new Set<number>();
  const limit = pLimit(CONCURRENCY);
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
        const repo = await fetchRepoDetails(candidate.repoFullName, githubCtx);
        if (!repo) {
          await requeueCandidate(candidate.id, "Repo details unavailable", 30_000);
          skipped += 1;
          continue;
        }
        try {
          const inserted = await processRepo(repo, githubCtx, options);
          if (inserted) totalFound += 1;
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
                const repo = await fetchRepoDetails(item.full_name, githubCtx);
                if (!repo) return 0;
                const inserted = await processRepo(repo, githubCtx, options);
                if (!inserted) return 0;
                totalFound += 1;
                return 1;
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
                const repo = await fetchRepoDetails(fullName, githubCtx);
                if (!repo) continue;
                const inserted = await processRepo(repo, githubCtx, options);
                if (!inserted) continue;
                totalFound += 1;
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
