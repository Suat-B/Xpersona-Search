/**
 * GitHub repository search crawler — discovers AI agent repos via topic/keyword search.
 * Uses repos search (up to 1k per query); run 50+ distinct queries for volume.
 */
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

const CONCURRENCY = 3;
const PAGE_SIZE = 100;
const MAX_PAGES_PER_QUERY = 10; // GitHub caps at 1000 results (10 × 100)
const RATE_LIMIT_DELAY_MS = 1500;

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
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isLikelyAgent(repo: { description?: string | null; name?: string }): boolean {
  const desc = (repo.description ?? "").toLowerCase();
  const name = (repo.name ?? "").toLowerCase();
  const combined = `${name} ${desc}`;

  if (
    combined.includes("agent") ||
    combined.includes("mcp") ||
    combined.includes("openclaw") ||
    combined.includes("chatbot") ||
    combined.includes("llm") ||
    combined.includes("langchain") ||
    combined.includes("model context protocol")
  )
    return true;
  return false;
}

export async function crawlGitHubRepos(
  maxResults: number = 5000
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
    for (const query of REPO_SEARCH_QUERIES) {
      if (totalFound >= maxResults) break;

      let page = 1;

      while (totalFound < maxResults && page <= MAX_PAGES_PER_QUERY) {
        let data: { items?: Array<{ id?: number; full_name?: string; description?: string | null; name?: string }> };
        try {
          const res = await octokit.rest.search.repos({
            q: query,
            sort: "stars",
            order: "desc",
            per_page: PAGE_SIZE,
            page,
          });
          data = res.data as { items?: Array<{ id?: number; full_name?: string; description?: string | null; name?: string }> };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Cannot access beyond the first 1000 results") || (err as { status?: number })?.status === 422) {
            break; // Hit GitHub's 1000-result cap, move to next query
          }
          throw err;
        }

        const items = data?.items ?? [];
        if (items.length === 0) break;

        for (const item of items) {
          if (totalFound >= maxResults) break;
          if (!item.id || !item.full_name) continue;
          if (seenIds.has(item.id)) continue;
          if (!isLikelyAgent(item)) continue;

          seenIds.add(item.id);

          const repo = await limit(() =>
            fetchRepoDetails(item.full_name!)
          );
          if (!repo) continue;

          const sourceId = `github:${repo.id}`;
          let description = repo.description;
          let capabilities: string[] = [];
          let protocols = ["OPENCLEW"] as string[];

          const skillContent = await limit(() =>
            fetchFileContent(repo.full_name, "SKILL.md", repo.default_branch)
          );
          if (skillContent) {
            const skillData = parseSkillMd(skillContent);
            description = skillData.description ?? description;
            capabilities = skillData.capabilities ?? [];
            protocols = skillData.protocols;
          } else {
            const pkgContent = await limit(() =>
              fetchFileContent(repo.full_name, "package.json", repo.default_branch)
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
                    (k) =>
                      k.includes("mcp") || k.includes("modelcontextprotocol")
                  )
                ) {
                  protocols = ["MCP", "OPENCLEW"];
                }
              } catch {
                /* ignore */
              }
            }
          }

          const safetyScore = await calculateSafetyScore(repo, skillContent ?? "");
          const popularityScore = calculatePopularityScore(repo);
          const freshnessScore = calculateFreshnessScore(repo);

          const slug =
            generateSlug(repo.full_name.replace("/", "-")) ||
            `github-${repo.id}`;

          const agentData = {
            sourceId,
            source: "GITHUB_REPOS" as const,
            name: repo.name,
            slug,
            description: description ?? null,
            url: repo.html_url,
            homepage: null,
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
            readme: skillContent ?? description ?? "",
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

          await db
            .insert(agents)
            .values(agentData)
            .onConflictDoUpdate({
              target: agents.sourceId,
              set: {
                name: agentData.name,
                slug: agentData.slug,
                description: agentData.description,
                capabilities: agentData.capabilities,
                protocols: agentData.protocols,
                githubData: agentData.githubData,
                readme: agentData.readme,
                safetyScore: agentData.safetyScore,
                popularityScore: agentData.popularityScore,
                freshnessScore: agentData.freshnessScore,
                overallRank: agentData.overallRank,
                status: agentData.status,
                lastCrawledAt: agentData.lastCrawledAt,
                nextCrawlAt: agentData.nextCrawlAt,
                updatedAt: new Date(),
              },
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
