/**
 * NPM registry crawler — discovers OpenClaw/MCP packages from npm.
 * Uses registry.npmjs.org/-/v1/search.
 */
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { upsertAgent } from "../agent-upsert";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { buildSearchableReadme } from "../utils/build-readme";
import { ingestAgentMedia } from "./media-ingestion";

const NPM_SEARCH_URL = "https://registry.npmjs.org/-/v1/search";
const PAGE_SIZE = 250;

const SEARCH_TERMS = [
  "openclaw",
  "mcp-server",
  "@modelcontextprotocol",
  "@anthropic-ai mcp",
  "cursor mcp",
  "langchain agent",
  "agent llm",
  "llm agent",
  "claude api",
  "cursor agent",
  "chatbot",
  "ai-assistant",
  "llamaindex",
  "mcp",
  "openclaw skill",
  "ai agent",
  "autonomous agent",
  "crewai",
  "autogen",
  "function calling",
  "tool use",
  "agentic",
  "mcp tool",
  "mcp stdio",
  "multi-agent",
  "rag agent",
  "openai assistant",
  "claude agent",
  "gemini agent",
  "agent framework",
];

interface NpmPackage {
  name: string;
  description?: string;
  version?: string;
  keywords?: string[];
  links?: { homepage?: string; repository?: string; npm?: string };
  date?: string;
}

interface NpmSearchObject {
  package: NpmPackage;
  score?: { final?: number };
}

interface NpmSearchResponse {
  objects?: NpmSearchObject[];
  total?: number;
}

function isRelevantPackage(pkg: NpmPackage, broadMode = false): boolean {
  const name = pkg.name.toLowerCase();
  const desc = (pkg.description ?? "").toLowerCase();
  const keywords = (pkg.keywords ?? []).map((k) => String(k).toLowerCase());

  if (name.includes("openclaw") || desc.includes("openclaw")) return true;
  if (name.includes("mcp") || desc.includes("mcp") || desc.includes("model context protocol"))
    return true;
  if (name.includes("modelcontextprotocol")) return true;
  if (name.includes("langchain") || desc.includes("langchain")) return true;
  if ((name.includes("anthropic") || name.includes("cursor")) && (name.includes("mcp") || desc.includes("mcp")))
    return true;
  if (keywords.some((k) => k.includes("openclaw") || k.includes("mcp") || k.includes("agent")))
    return true;
  if (
    broadMode &&
    (name.includes("agent") ||
      name.includes("mcp") ||
      desc.includes(" ai agent") ||
      desc.includes("llm agent") ||
      desc.includes("chatbot") ||
      desc.includes("ai assistant") ||
      (desc.includes("llm") && desc.includes("agent")))
  )
    return true;

  return false;
}

function extractRepoUrl(links?: NpmPackage["links"]): string {
  const repo = links?.repository;
  if (typeof repo === "string") {
    const m = repo.match(/github\.com[/:]([\w-]+\/[\w.-]+)/);
    if (m) return `https://github.com/${m[1].replace(/\.git$/, "")}`;
  }
  return links?.npm ?? links?.homepage ?? "https://www.npmjs.com";
}

export async function crawlNpmPackages(
  maxResults: number = 200
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "NPM",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const seenSourceIds = new Set<string>();

  let totalFound = 0;

  try {
    for (const term of SEARCH_TERMS) {
      if (totalFound >= maxResults) break;

      let from = 0;

      while (totalFound < maxResults) {
        const url = `${NPM_SEARCH_URL}?text=${encodeURIComponent(term)}&size=${PAGE_SIZE}&from=${from}`;
        let data: NpmSearchResponse;

        try {
          const res = await fetch(url, {
            headers: { Accept: "application/json" },
          });
          if (!res.ok) break;
          data = (await res.json()) as NpmSearchResponse;
        } catch {
          break;
        }

        const objects = data.objects ?? [];
        if (objects.length === 0) break;

        for (const obj of objects) {
          if (totalFound >= maxResults) break;

          const pkg = obj.package;
          if (!pkg?.name) continue;

          const broadMode = process.env.CRAWL_BROAD_MODE === "1";
          if (!isRelevantPackage(pkg, broadMode)) continue;

          const sourceId = `npm:${pkg.name}`;
          if (seenSourceIds.has(sourceId)) continue;

          seenSourceIds.add(sourceId);

          const url_ = extractRepoUrl(pkg.links);
          const slug =
            generateSlug(`npm-${pkg.name.replace(/[@/]/g, "-")}`) ||
            `npm-${pkg.name.replace(/[@/]/g, "-")}`;
          const keywords = (pkg.keywords ?? []).filter(Boolean);

          const popularityScore = Math.min(
            100,
            Math.round((obj.score?.final ?? 0) / 20)
          );
          const date = pkg.date ? new Date(pkg.date) : new Date();
          const daysSince = (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
          const freshnessScore = Math.round(
            100 * Math.exp(-daysSince / 90)
          );

          const agentData = {
            sourceId,
            source: "NPM" as const,
            name: pkg.name,
            slug,
            description: pkg.description ?? null,
            url: url_,
            homepage: pkg.links?.homepage ?? null,
            capabilities: keywords.slice(0, 15),
            protocols: ["MCP", "OPENCLEW"] as string[],
            languages: ["typescript"] as string[],
            npmData: {
              packageName: pkg.name,
              version: pkg.version,
              date: pkg.date,
            } as Record<string, unknown>,
            openclawData: null as unknown as Record<string, unknown>,
            readme: buildSearchableReadme({
              description: pkg.description,
              capabilities: keywords.slice(0, 15),
              protocols: ["MCP", "OPENCLEW"],
              languages: ["typescript"],
              keywords,
            }),
            safetyScore: 72,
            popularityScore,
            freshnessScore,
            performanceScore: 0,
            overallRank: Math.round(
              (60 * 0.3 + popularityScore * 0.2 + freshnessScore * 0.2) * 10
            ) / 10,
            status: "ACTIVE" as const,
            lastCrawledAt: new Date(),
            nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          };

            await upsertAgent(agentData, {
              name: agentData.name,
              slug: agentData.slug,
              description: agentData.description,
              url: agentData.url,
              homepage: agentData.homepage,
              npmData: agentData.npmData,
              readme: agentData.readme,
              popularityScore: agentData.popularityScore,
              freshnessScore: agentData.freshnessScore,
              overallRank: agentData.overallRank,
              lastCrawledAt: agentData.lastCrawledAt,
              nextCrawlAt: agentData.nextCrawlAt,
            });
            await ingestAgentMedia({
              agentSourceId: sourceId,
              agentUrl: url_,
              homepageUrl: pkg.links?.homepage ?? null,
              source: "NPM",
              readmeOrHtml: agentData.readme,
              isHtml: false,
              allowHomepageFetch: true,
            });

          totalFound++;
        }

        from += PAGE_SIZE;
        if (objects.length < PAGE_SIZE) break;
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

    return { total: totalFound, jobId };
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
}
