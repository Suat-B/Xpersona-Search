/**
 * GitHub MCP crawler — discovers MCP (Model Context Protocol) servers from GitHub.
 * Searches for package.json files that reference @modelcontextprotocol/sdk or mcp-server.
 */
import pLimit from "p-limit";
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  octokit,
  fetchRepoDetails,
  fetchFileContent,
  withGithubTimeout,
  isRetryableGitHubError,
  type GitHubRepo,
} from "../utils/github";
import { canProceed, recordFailure, recordSuccess } from "./source-health";
import { getCrawlMode, isHotOrWarm, type CrawlRuntimeOptions } from "./crawler-mode";
import { ackCandidate, failCandidate, leaseCandidates, requeueCandidate } from "./discovery-frontier";
import { calculateSafetyScore } from "../scoring/safety";
import {
  calculatePopularityScore,
  calculateFreshnessScore,
  calculateOverallRank,
} from "../scoring/rank";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";

const CONCURRENCY = 3;
const PAGE_SIZE = 100;
const MAX_PAGES_PER_QUERY = 10; // GitHub caps at 1000 results (10 × 100)
const RATE_LIMIT_DELAY_MS = 1200;

const SEARCH_QUERIES = [
  "filename:package.json @modelcontextprotocol/sdk",
  "filename:package.json mcp-server",
  "filename:package.json modelcontextprotocol",
  "filename:package.json @modelcontextprotocol",
  "mcp server typescript",
  "filename:mcp.json",
  '"mcpServers" filename:package.json',
  "filename:pyproject.toml mcp",
  "filename:pyproject.toml model-context-protocol",
  "filename:setup.py mcp-server",
  "mcp-server lang:go",
  "mcp-server lang:rust",
  "mcp-server lang:python",
  "mcp-server lang:java",
  "mcp-server lang:csharp",
  "model context protocol server",
  "topic:mcp-server",
  "topic:model-context-protocol",
  "mcp tool server",
  "mcp stdio server",
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
  if (pkg.bin && typeof pkg.bin === "object") {
    capabilities.push("cli");
  }
  return { name, description, capabilities: [...new Set(capabilities)] };
}

export async function crawlGitHubMCP(
  since?: Date,
  maxResults: number = 300,
  options?: CrawlRuntimeOptions
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "GITHUB_MCP",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const limit = pLimit(CONCURRENCY);
  const seenSourceIds = new Set<string>();

  let totalFound = 0;
  const sourceHealthKey = "GITHUB_MCP";
  const mode = getCrawlMode(options);

  try {
    if (isHotOrWarm(options)) {
      if (!canProceed(sourceHealthKey)) {
        await db
          .update(crawlJobs)
          .set({
            status: "COMPLETED",
            completedAt: new Date(),
            agentsFound: 0,
            skipped: 1,
          })
          .where(eq(crawlJobs.id, jobId));
        return { total: 0, jobId };
      }

      const leased = await leaseCandidates({
        lockOwner: options?.lockOwner ?? sourceHealthKey,
        limit: maxResults,
        minConfidence: mode === "hot" ? 80 : 50,
      });

      for (const candidate of leased) {
        if (totalFound >= maxResults) break;
        const repo = await fetchRepoDetails(candidate.repoFullName);
        if (!repo) {
          await requeueCandidate(candidate.id, "Repo details unavailable", 30_000);
          continue;
        }
        if (since && new Date(repo.updated_at) <= since) {
          await ackCandidate(candidate.id);
          continue;
        }

        const sourceId = `github-mcp:${repo.id}`;
        const pkgContent = await fetchFileContent(
          repo.full_name,
          "package.json",
          repo.default_branch
        );
        if (!pkgContent) {
          await failCandidate(candidate.id, "package.json not found");
          continue;
        }
        const pkg = parsePackageJson(pkgContent);
        if (!pkg || !hasMcpDependency(pkg)) {
          await failCandidate(candidate.id, "MCP dependency not found");
          continue;
        }

        const readme = await fetchFileContent(
          repo.full_name,
          "README.md",
          repo.default_branch
        );
        const contentForSafety = [pkgContent, readme ?? ""].join("\n");
        const safetyScore = await calculateSafetyScore(repo, contentForSafety);
        const popularityScore = calculatePopularityScore(repo);
        const freshnessScore = calculateFreshnessScore(repo);
        const { name, description, capabilities } = extractMcpMetadata(pkg, repo);
        const baseSlug = generateSlug(`mcp-${repo.full_name.replace("/", "-")}`);
        const slug = baseSlug || `mcp-${repo.id}`;

        const agentData = {
          sourceId,
          source: "GITHUB_MCP" as const,
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
          status:
            safetyScore >= 40 ? ("ACTIVE" as const) : ("PENDING_REVIEW" as const),
          lastCrawledAt: new Date(),
          nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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
          status: agentData.status,
          lastCrawledAt: agentData.lastCrawledAt,
          nextCrawlAt: agentData.nextCrawlAt,
        });

        await ackCandidate(candidate.id);
        totalFound++;
      }

      recordSuccess(sourceHealthKey);
    } else {
    for (const searchQuery of SEARCH_QUERIES) {
      if (totalFound >= maxResults) break;
      let page = 1;

      while (totalFound < maxResults && page <= MAX_PAGES_PER_QUERY) {
        let data: { items?: Array<{ repository?: { full_name?: string }; path?: string }> };
        try {
          const res = await withGithubTimeout(
            () =>
              octokit.rest.search.code({
                q: searchQuery,
                sort: "indexed",
                order: "desc",
                per_page: PAGE_SIZE,
                page,
              }),
            `search.code "${searchQuery}" page=${page}`
          );
          data = res.data as { items?: Array<{ repository?: { full_name?: string }; path?: string }> };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Cannot access beyond the first 1000 results") || (err as { status?: number })?.status === 422) {
            break; // Hit GitHub's 1000-result cap, move to next query
          }
          if (isRetryableGitHubError(err)) {
            console.warn(`[GITHUB_MCP] transient GitHub error on query "${searchQuery}" page ${page}: ${msg}`);
            break; // Skip this query page and continue crawl
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
          const sourceId = `github-mcp:${repo.id}`;
          if (seenSourceIds.has(sourceId)) continue;
          if (since && new Date(repo.updated_at) <= since) continue;

          const pkgContent = await fetchFileContent(
            repo.full_name,
            "package.json",
            repo.default_branch
          );
          if (!pkgContent) continue;

          const pkg = parsePackageJson(pkgContent);
          if (!pkg || !hasMcpDependency(pkg)) continue;

          seenSourceIds.add(sourceId);
          const readme = await fetchFileContent(
            repo.full_name,
            "README.md",
            repo.default_branch
          );
          const contentForSafety = [pkgContent, readme ?? ""].join("\n");
          const safetyScore = await calculateSafetyScore(repo, contentForSafety);
          const popularityScore = calculatePopularityScore(repo);
          const freshnessScore = calculateFreshnessScore(repo);

          const { name, description, capabilities } = extractMcpMetadata(
            pkg,
            repo
          );
          const baseSlug = generateSlug(
            `mcp-${repo.full_name.replace("/", "-")}`
          );
          const slug = baseSlug || `mcp-${repo.id}`;

          const agentData = {
            sourceId,
            source: "GITHUB_MCP" as const,
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
            status:
              safetyScore >= 40 ? ("ACTIVE" as const) : ("PENDING_REVIEW" as const),
            lastCrawledAt: new Date(),
            nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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
    recordFailure(sourceHealthKey);
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
