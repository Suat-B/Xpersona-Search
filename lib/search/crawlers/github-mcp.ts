/**
 * GitHub MCP crawler with partitioned repo search and resilient checkpoints.
 */
import pLimit from "p-limit";
import { canProceed, recordFailure, recordSuccess } from "./source-health";
import { getCrawlMode, isHotOrWarm, type CrawlRuntimeOptions } from "./crawler-mode";
import { ackCandidate, failCandidate, leaseCandidates, requeueCandidate } from "./discovery-frontier";
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
import { calculateSafetyScoreDeep, calculateSafetyScoreFast } from "../scoring/safety";
import {
  calculatePopularityScore,
  calculateFreshnessScore,
  calculateOverallRank,
} from "../scoring/rank";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";
import {
  createGitHubRequestContext,
  fetchFileContent,
  fetchRepoDetails,
  searchCode,
  type GitHubRepo,
} from "../utils/github";
import { getRepoVisibility, shouldRecrawlSource } from "./github-agent-utils";
import { ingestAgentMedia } from "./media-ingestion";

const SOURCE = "GITHUB_MCP";
const CONCURRENCY = 4;
const SEARCH_QUERIES = [
  "topic:mcp-server",
  "topic:model-context-protocol",
  "model context protocol in:description",
  "mcp server in:description",
  "mcp stdio server",
  "tool-calling mcp in:description",
  "topic:mcp-tool",
  "@modelcontextprotocol/sdk in:readme",
] as const;
const CODE_FALLBACK_QUERIES = [
  "filename:package.json @modelcontextprotocol/sdk",
  "filename:package.json mcp-server",
  "\"mcpServers\" filename:package.json",
] as const;
const CODE_FALLBACK_PAGES = 2;

interface RepoSearchItem {
  id?: number;
  full_name?: string;
  description?: string | null;
  name?: string;
}

interface CrawlState {
  totalFound: number;
  skipped: number;
  deepSafetyUsed: number;
}

function hasMcpDependency(pkg: Record<string, unknown>): boolean {
  const deps = {
    ...((pkg.dependencies as Record<string, string>) ?? {}),
    ...((pkg.devDependencies as Record<string, string>) ?? {}),
    ...((pkg.peerDependencies as Record<string, string>) ?? {}),
  };
  const keys = Object.keys(deps).map((k) => k.toLowerCase());
  return (
    keys.some((k) => k.includes("mcp") || k.includes("modelcontextprotocol")) ||
    keys.some((k) => k === "@modelcontextprotocol/sdk")
  );
}

function parsePackageJson(content: string): Record<string, unknown> | null {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractMcpMetadata(
  pkg: Record<string, unknown>,
  repo: GitHubRepo
): { name: string; description: string | null; capabilities: string[] } {
  const name = (pkg.name as string) ?? repo.name;
  const description = (pkg.description as string) ?? repo.description ?? null;
  const capabilities: string[] = [];
  const keywords = (pkg.keywords as string[] | undefined) ?? [];
  capabilities.push(...keywords.filter(Boolean));
  if (pkg.bin && typeof pkg.bin === "object") capabilities.push("cli");
  return { name, description, capabilities: [...new Set(capabilities)] };
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

function getDeepSafetyLimit(options?: CrawlRuntimeOptions): number {
  if (options?.deepSafetyLimit != null && options.deepSafetyLimit >= 0) {
    return options.deepSafetyLimit;
  }
  const envLimit = Number(process.env.CRAWL_DEEP_SAFETY_LIMIT_PER_JOB ?? "100");
  if (!Number.isFinite(envLimit) || envLimit < 0) return 100;
  return envLimit;
}

function shouldDeepSafety(repo: GitHubRepo, state: CrawlState, options?: CrawlRuntimeOptions): boolean {
  return state.deepSafetyUsed < getDeepSafetyLimit(options) && repo.stargazers_count >= 10;
}

async function processRepo(
  repo: GitHubRepo,
  state: CrawlState,
  ctx: ReturnType<typeof createGitHubRequestContext>,
  options?: CrawlRuntimeOptions,
  since?: Date
): Promise<boolean> {
  if (since && new Date(repo.updated_at) <= since) return false;
  const sourceId = `github-mcp:${repo.id}`;
  const minRecrawlHours = Number(process.env.CRAWL_MIN_RECRAWL_HOURS ?? "6");
  if (Number.isFinite(minRecrawlHours) && minRecrawlHours > 0) {
    const allowed = await shouldRecrawlSource(sourceId, minRecrawlHours);
    if (!allowed) return false;
  }

  const pkgContent = await fetchFileContent(
    repo.full_name,
    "package.json",
    repo.default_branch,
    ctx
  );
  if (!pkgContent) return false;
  const pkg = parsePackageJson(pkgContent);
  if (!pkg || !hasMcpDependency(pkg)) return false;

  const readme = await fetchFileContent(repo.full_name, "README.md", repo.default_branch, ctx);
  const contentForSafety = [pkgContent, readme ?? ""].join("\n");
  const fastSafety = calculateSafetyScoreFast(repo, contentForSafety);
  let safetyScore = fastSafety;
  if (shouldDeepSafety(repo, state, options)) {
    try {
      safetyScore = await calculateSafetyScoreDeep(repo, contentForSafety, ctx);
      state.deepSafetyUsed += 1;
    } catch {
      safetyScore = fastSafety;
    }
  }

  const popularityScore = calculatePopularityScore(repo);
  const freshnessScore = calculateFreshnessScore(repo);
  const { name, description, capabilities } = extractMcpMetadata(pkg, repo);
  const slug =
    generateSlug(`mcp-${repo.full_name.replace("/", "-")}`) || `mcp-${repo.id}`;
  const visibility = getRepoVisibility(repo);
  const now = new Date();

  const agentData = {
    sourceId,
    source: SOURCE,
    name,
    slug,
    description,
    url: repo.html_url,
    homepage: (pkg.homepage as string) ?? null,
    capabilities,
    protocols: ["MCP"] as string[],
    languages: ["typescript"] as string[],
    githubData: {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      lastCommit: repo.pushed_at,
      defaultBranch: repo.default_branch,
    },
    npmData: {
      packageName: pkg.name,
      version: pkg.version,
    } as Record<string, unknown>,
    openclawData: null as unknown as Record<string, unknown>,
    readme: readme ?? pkgContent,
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
    status: safetyScore >= 40 ? ("ACTIVE" as const) : ("PENDING_REVIEW" as const),
    lastCrawledAt: now,
    nextCrawlAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  };

  await upsertAgent(agentData, {
    name: agentData.name,
    slug: agentData.slug,
    description: agentData.description,
    homepage: agentData.homepage,
    githubData: agentData.githubData,
    npmData: agentData.npmData,
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

  await ingestAgentMedia({
    agentSourceId: sourceId,
    agentUrl: repo.html_url,
    homepageUrl: agentData.homepage,
    source: SOURCE,
    readmeOrHtml: agentData.readme,
    isHtml: false,
    allowHomepageFetch: true,
  });
  return true;
}

export async function crawlGitHubMCP(
  since?: Date,
  maxResults: number = 300,
  options?: CrawlRuntimeOptions
): Promise<{ total: number; jobId: string }> {
  const mode = getCrawlMode(options);
  const workerId = options?.workerId ?? options?.lockOwner ?? `crawl:${process.pid}`;
  const { jobId } = await startJob({ source: SOURCE, mode, workerId });
  const githubCtx = createGitHubRequestContext();
  const state: CrawlState = { totalFound: 0, skipped: 0, deepSafetyUsed: 0 };
  const seenSourceIds = new Set<string>();
  const limit = pLimit(CONCURRENCY);
  const startedAtMs = Date.now();

  try {
    if (isHotOrWarm(options)) {
      if (!canProceed(SOURCE)) {
        await completeJob(jobId, {
          agentsFound: 0,
          skipped: 1,
          finishedReason: "source_health_open",
          ...toJobMetricsFromGithubContext(githubCtx),
        });
        return { total: 0, jobId };
      }

      const leased = await leaseCandidates({
        lockOwner: options?.lockOwner ?? SOURCE,
        limit: maxResults,
        minConfidence: mode === "hot" ? 80 : 50,
      });

      for (const candidate of leased) {
        if (state.totalFound >= maxResults) break;
        if (!shouldContinueRun(startedAtMs, githubCtx, options)) break;
        const repo = await fetchRepoDetails(candidate.repoFullName, githubCtx);
        if (!repo) {
          await requeueCandidate(candidate.id, "Repo details unavailable", 30_000);
          state.skipped += 1;
          continue;
        }
        try {
          const inserted = await processRepo(repo, state, githubCtx, options, since);
          if (!inserted) {
            await failCandidate(candidate.id, "MCP dependency not found");
            state.skipped += 1;
            continue;
          }
          state.totalFound += 1;
          await ackCandidate(candidate.id);
        } catch {
          state.skipped += 1;
          await requeueCandidate(candidate.id, "Repo processing failed", 60_000);
        }
      }

      await completeJob(jobId, {
        agentsFound: state.totalFound,
        skipped: state.skipped,
        finishedReason: "completed_hot_warm",
        ...toJobMetricsFromGithubContext(githubCtx),
      });
      recordSuccess(SOURCE);
      return { total: state.totalFound, jobId };
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
              const sourceId = `github-mcp:${item.id}`;
              if (seenSourceIds.has(sourceId)) return 0;
              seenSourceIds.add(sourceId);
              if (state.totalFound >= maxResults) return 0;
              try {
                const repo = await fetchRepoDetails(item.full_name, githubCtx);
                if (!repo) return 0;
                const inserted = await processRepo(repo, state, githubCtx, options, since);
                if (!inserted) return 0;
                state.totalFound += 1;
                return 1;
              } catch {
                state.skipped += 1;
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
          agentsFound: state.totalFound,
          skipped: state.skipped,
          ...toJobMetricsFromGithubContext(githubCtx),
        });
      },
    });

    if (state.totalFound < maxResults) {
      for (const query of CODE_FALLBACK_QUERIES) {
        if (!shouldContinueRun(startedAtMs, githubCtx, options)) break;
        if (state.totalFound >= maxResults) break;
        for (let page = 1; page <= CODE_FALLBACK_PAGES; page++) {
          if (!shouldContinueRun(startedAtMs, githubCtx, options)) break;
          if (state.totalFound >= maxResults) break;
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
                repository?: { full_name?: string; id?: number };
              }>) ?? [];
            if (items.length === 0) break;
            for (const item of items) {
              if (state.totalFound >= maxResults) break;
              const repoId = item.repository?.id;
              const fullName = item.repository?.full_name;
              if (!repoId || !fullName) continue;
              const sourceId = `github-mcp:${repoId}`;
              if (seenSourceIds.has(sourceId)) continue;
              seenSourceIds.add(sourceId);
              try {
                const repo = await fetchRepoDetails(fullName, githubCtx);
                if (!repo) continue;
                const inserted = await processRepo(repo, state, githubCtx, options, since);
                if (!inserted) continue;
                state.totalFound += 1;
              } catch {
                state.skipped += 1;
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
      agentsFound: state.totalFound,
      skipped: state.skipped,
      finishedReason: shouldContinueRun(startedAtMs, githubCtx, options)
        ? "completed"
        : "budget_or_time_cutoff",
      ...toJobMetricsFromGithubContext(githubCtx),
    });
    recordSuccess(SOURCE);
  } catch (err) {
    recordFailure(SOURCE);
    await failJob(jobId, err, {
      agentsFound: state.totalFound,
      skipped: state.skipped,
      ...toJobMetricsFromGithubContext(githubCtx),
    });
    throw err;
  }

  return { total: state.totalFound, jobId };
}
