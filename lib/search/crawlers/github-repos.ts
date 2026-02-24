/**
 * GitHub repository crawler with partitioned search, checkpoint resume, and
 * request-budget-aware resiliency.
 */
import pLimit from "p-limit";
import { canProceed, recordFailure, recordSuccess } from "./source-health";
import { getCrawlMode, isHotOrWarm, type CrawlRuntimeOptions } from "./crawler-mode";
import { ackCandidate, leaseCandidates, requeueCandidate } from "./discovery-frontier";
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
import { parseSkillMd } from "../parsers/skill-md";
import { calculateSafetyScoreDeep, calculateSafetyScoreFast } from "../scoring/safety";
import {
  calculatePopularityScore,
  calculateFreshnessScore,
  calculateOverallRank,
} from "../scoring/rank";
import { generateSlug } from "../utils/slug";
import { getAgentBySourceId, upsertAgent, upsertMediaAsset } from "../agent-upsert";
import {
  createGitHubRequestContext,
  fetchFileContent,
  fetchRepoDetails,
  type GitHubRepo,
} from "../utils/github";
import { getRepoVisibility, shouldRecrawlSource } from "./github-agent-utils";
import { discoverMediaAssets, fetchHomepageContent } from "./media-discovery";

const CONCURRENCY = 4;
const SOURCE = "GITHUB_REPOS";
const REPO_SEARCH_QUERIES = [
  "topic:ai-agent",
  "topic:llm-agent",
  "topic:chatbot",
  "topic:mcp-server",
  "topic:openclaw",
  "topic:langchain",
  "topic:llamaindex",
  "topic:cursor",
  "topic:claude-api",
  "agent in:description",
  "mcp server in:description",
  "openclaw in:description",
  "ai agent in:description",
  "llm agent in:description",
  "topic:autoagent",
  "topic:multi-agent",
  "topic:ai-assistant",
  "model context protocol in:description",
  "topic:claude",
  "topic:anthropic",
  "topic:autogen",
  "topic:crewai",
  "topic:smolagents",
  "topic:phidata",
  "topic:swarm",
  "topic:rag-agent",
  "topic:code-agent",
  "topic:web-agent",
  "topic:coding-agent",
  "topic:cursor-agent",
  "topic:windsurf",
  "topic:cline-agent",
  "topic:agentic",
  "topic:agent-framework",
  "topic:ai-chatbot",
  "topic:openai-agent",
  "topic:gemini-agent",
  "topic:function-calling",
  "topic:tool-use",
  "topic:autonomous-agent",
  "ai agent stars:>10",
  "mcp server stars:>5",
  "llm agent stars:>10",
  "chatbot stars:>50",
  "autonomous agent stars:>5",
  "topic:copilot",
  "topic:gpt-agent",
  "topic:ai-tool",
  "topic:llm-tool",
  "topic:agent-protocol",
  "topic:a2a-protocol",
  "agentic framework in:description",
  "autonomous agent in:description",
  "tool-calling agent in:description",
] as const;

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

function isLikelyAgent(repo: { description?: string | null; name?: string }): boolean {
  const desc = (repo.description ?? "").toLowerCase();
  const name = (repo.name ?? "").toLowerCase();
  const combined = `${name} ${desc}`;
  const signals = [
    "agent",
    "mcp",
    "openclaw",
    "chatbot",
    "llm",
    "langchain",
    "model context protocol",
    "crewai",
    "autogen",
    "smolagent",
    "phidata",
    "agentic",
    "autonomous",
    "tool-use",
    "function-calling",
    "copilot",
    "assistant",
    "llamaindex",
    "rag",
    "swarm",
    "multi-agent",
    "a2a",
  ];
  return signals.some((s) => combined.includes(s));
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
  const limit = getDeepSafetyLimit(options);
  if (state.deepSafetyUsed >= limit) return false;
  return repo.stargazers_count >= 20;
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

async function buildRepoSignals(
  repo: GitHubRepo,
  ctx: ReturnType<typeof createGitHubRequestContext>
): Promise<{
  description: string | null;
  capabilities: string[];
  protocols: string[];
  readme: string;
}> {
  let description = repo.description;
  let capabilities: string[] = [];
  let protocols = ["OPENCLEW"] as string[];

  const skillContent = await fetchFileContent(
    repo.full_name,
    "SKILL.md",
    repo.default_branch,
    ctx
  );
  if (skillContent) {
    try {
      const skillData = parseSkillMd(skillContent);
      description = skillData.description ?? description;
      capabilities = skillData.capabilities ?? [];
      protocols = skillData.protocols;
    } catch {
      // malformed SKILL.md should not fail repo ingestion
    }
  } else {
    const pkgContent = await fetchFileContent(
      repo.full_name,
      "package.json",
      repo.default_branch,
      ctx
    );
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent) as Record<string, unknown>;
        const deps = {
          ...((pkg.dependencies as Record<string, string>) ?? {}),
          ...((pkg.devDependencies as Record<string, string>) ?? {}),
        };
        if (
          Object.keys(deps).some(
            (k) => k.includes("mcp") || k.includes("modelcontextprotocol")
          )
        ) {
          protocols = ["MCP", "OPENCLEW"];
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  return {
    description: description ?? null,
    capabilities,
    protocols,
    readme: skillContent ?? description ?? "",
  };
}

async function upsertRepoAsAgent(
  repo: GitHubRepo,
  state: CrawlState,
  ctx: ReturnType<typeof createGitHubRequestContext>,
  options?: CrawlRuntimeOptions
): Promise<boolean> {
  if (repo.fork) return false;
  const sourceId = `github:${repo.id}`;
  const minRecrawlHours = Number(process.env.CRAWL_MIN_RECRAWL_HOURS ?? "6");
  if (Number.isFinite(minRecrawlHours) && minRecrawlHours > 0) {
    const allowed = await shouldRecrawlSource(sourceId, minRecrawlHours);
    if (!allowed) return false;
  }

  const { description, capabilities, protocols, readme } = await buildRepoSignals(
    repo,
    ctx
  );

  const fastSafety = calculateSafetyScoreFast(repo, readme);
  let safetyScore = fastSafety;
  if (shouldDeepSafety(repo, state, options)) {
    try {
      safetyScore = await calculateSafetyScoreDeep(repo, readme, ctx);
      state.deepSafetyUsed += 1;
    } catch {
      safetyScore = fastSafety;
    }
  }

  const popularityScore = calculatePopularityScore(repo);
  const freshnessScore = calculateFreshnessScore(repo);
  const slug =
    generateSlug(repo.full_name.replace("/", "-")) || `github-${repo.id}`;
  const visibility = getRepoVisibility(repo);
  const now = new Date();

  const agentData = {
    sourceId,
    source: SOURCE,
    name: repo.name,
    slug,
    description,
    url: repo.html_url,
    homepage: repo.homepage ?? null,
    capabilities,
    protocols,
    languages: ["typescript"] as string[],
    githubData: {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      lastCommit: repo.pushed_at,
      defaultBranch: repo.default_branch,
    },
    npmData: null,
    openclawData: null,
    readme,
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
    nextCrawlAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  };

  await upsertAgent(agentData, {
    name: agentData.name,
    slug: agentData.slug,
    description: agentData.description,
    homepage: agentData.homepage,
    capabilities: agentData.capabilities,
    protocols: agentData.protocols,
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

  if (process.env.SEARCH_MEDIA_VERTICAL_ENABLED === "1") {
    try {
      const agent = await getAgentBySourceId(sourceId);
      if (agent) {
        const assets = await discoverMediaAssets({
          sourcePageUrl: repo.html_url,
          markdownOrHtml: readme,
        });
        for (const asset of assets) {
          await upsertMediaAsset({
            agentId: agent.id,
            source: SOURCE,
            assetKind: asset.assetKind,
            artifactType: asset.artifactType,
            url: asset.url,
            sourcePageUrl: asset.sourcePageUrl,
            sha256: asset.sha256,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize,
            title: asset.title,
            caption: asset.caption,
            altText: asset.altText,
            isPublic: asset.isPublic,
            qualityScore: asset.qualityScore,
            safetyScore: asset.safetyScore,
          });
        }
        if (agentData.homepage) {
          const homepageContent = await fetchHomepageContent(agentData.homepage);
          if (homepageContent) {
            const homepageAssets = await discoverMediaAssets({
              sourcePageUrl: agentData.homepage,
              markdownOrHtml: homepageContent,
              isHtml: true,
            });
            for (const asset of homepageAssets) {
              await upsertMediaAsset({
                agentId: agent.id,
                source: "HOMEPAGE",
                assetKind: asset.assetKind,
                artifactType: asset.artifactType,
                url: asset.url,
                sourcePageUrl: asset.sourcePageUrl,
                sha256: asset.sha256,
                mimeType: asset.mimeType,
                byteSize: asset.byteSize,
                title: asset.title,
                caption: asset.caption,
                altText: asset.altText,
                isPublic: asset.isPublic,
                qualityScore: asset.qualityScore,
                safetyScore: asset.safetyScore,
              });
            }
          }
        }
      }
    } catch {
      // Keep media extraction non-fatal for crawler reliability.
    }
  }

  return true;
}

export async function crawlGitHubRepos(
  maxResults: number = 5000,
  options?: CrawlRuntimeOptions
): Promise<{ total: number; jobId: string }> {
  const mode = getCrawlMode(options);
  const workerId = options?.workerId ?? options?.lockOwner ?? `crawl:${process.pid}`;
  const { jobId } = await startJob({ source: SOURCE, mode, workerId });
  const githubCtx = createGitHubRequestContext();
  const state: CrawlState = { totalFound: 0, skipped: 0, deepSafetyUsed: 0 };
  const seenRepoIds = new Set<number>();
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
          const inserted = await upsertRepoAsAgent(repo, state, githubCtx, options);
          if (inserted) state.totalFound += 1;
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
      queries: [...REPO_SEARCH_QUERIES],
      maxResults,
      context: githubCtx,
      initialCursor: checkpoint,
      shouldContinue: () => shouldContinueRun(startedAtMs, githubCtx, options),
      onItems: async (items) => {
        const results = await Promise.all(
          items.map((item) =>
            limit(async () => {
              if (state.totalFound >= maxResults) return 0;
              if (!item.id || !item.full_name) return 0;
              if (seenRepoIds.has(item.id)) return 0;
              if (!isLikelyAgent(item)) return 0;
              seenRepoIds.add(item.id);

              try {
                const repo = await fetchRepoDetails(item.full_name, githubCtx);
                if (!repo) return 0;
                const inserted = await upsertRepoAsAgent(repo, state, githubCtx, options);
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
        return results.reduce<number>((sum, n) => sum + n, 0);
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
