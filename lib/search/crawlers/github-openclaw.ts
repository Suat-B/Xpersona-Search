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
  searchCode,
  type GitHubRepo,
} from "../utils/github";
import { getRepoVisibility, shouldRecrawlSource } from "./github-agent-utils";
import {
  discoverMediaAssets,
  fetchHomepageContent,
} from "./media-discovery";

const SOURCE = "GITHUB_OPENCLEW";
const CONCURRENCY = 4;
const SEARCH_QUERIES = [
  "topic:openclaw",
  "topic:cursor-skill",
  "topic:ai-skill",
  "openclaw skill in:description",
  "cursor skill in:description",
  "model context protocol skill",
  "agent skill in:description",
  "tooling skill openclaw",
] as const;
const CODE_FALLBACK_QUERIES = [
  "filename:SKILL.md openclaw",
  "filename:SKILL.md cursor",
  "\"protocols:\" filename:SKILL.md",
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
  const sourceId = `github:${repo.id}`;
  const minRecrawlHours = Number(process.env.CRAWL_MIN_RECRAWL_HOURS ?? "6");
  if (Number.isFinite(minRecrawlHours) && minRecrawlHours > 0) {
    const allowed = await shouldRecrawlSource(sourceId, minRecrawlHours);
    if (!allowed) return false;
  }

  const skillContent = await fetchFileContent(
    repo.full_name,
    "SKILL.md",
    repo.default_branch,
    ctx
  );
  if (!skillContent) return false;

  let skillData: ReturnType<typeof parseSkillMd>;
  try {
    skillData = parseSkillMd(skillContent);
  } catch {
    return false;
  }

  const fastSafety = calculateSafetyScoreFast(repo, skillContent);
  let safetyScore = fastSafety;
  if (shouldDeepSafety(repo, state, options)) {
    try {
      safetyScore = await calculateSafetyScoreDeep(repo, skillContent, ctx);
      state.deepSafetyUsed += 1;
    } catch {
      safetyScore = fastSafety;
    }
  }
  const popularityScore = calculatePopularityScore(repo);
  const freshnessScore = calculateFreshnessScore(repo);
  const slug = generateSlug(repo.full_name.replace("/", "-")) || `agent-${repo.id}`;
  const visibility = getRepoVisibility(repo);
  const now = new Date();

  const agentData = {
    sourceId,
    source: SOURCE,
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
    githubData: agentData.githubData,
    openclawData: agentData.openclawData,
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
        const readmeAssets = await discoverMediaAssets({
          sourcePageUrl: repo.html_url,
          markdownOrHtml: skillContent,
        });
        for (const asset of readmeAssets) {
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

export async function crawlOpenClawSkills(
  since?: Date,
  maxResults: number = 500,
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

      const minConfidence = mode === "hot" ? 80 : 50;
      const leased = await leaseCandidates({
        lockOwner: options?.lockOwner ?? SOURCE,
        limit: maxResults,
        minConfidence,
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
            await failCandidate(candidate.id, "SKILL.md not found or skipped");
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
              const sourceId = `github:${item.id}`;
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
              const sourceId = `github:${repoId}`;
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
