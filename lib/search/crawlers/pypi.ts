/**
 * PyPI crawler — discovers MCP servers, OpenClaw skills, agent packages from Python.
 * Uses PyPI JSON API: /pypi/{package}/json (search has no public API).
 */
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { upsertAgent } from "../agent-upsert";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";

const PYPI_BASE = "https://pypi.org";
const PAGE_SIZE = 20;

const SEARCH_TERMS = [
  "mcp",
  "model-context-protocol",
  "openclaw",
  "mcp-server",
  "mcp server",
  "langchain agent",
  "llamaindex agent",
  "ai agent",
  "llm agent",
  "chatbot",
  "claude",
  "anthropic",
  "openai agent",
  "langchain",
  "llamaindex",
  "crewai",
  "autogen agent",
  "smolagents",
  "phidata",
  "autonomous agent",
  "agent framework python",
  "llm tool",
  "function calling",
  "tool use llm",
  "rag agent",
  "embedding agent",
  "multi agent",
  "agentic",
];

/** Known PyPI packages (MCP/agent ecosystem) when search is unavailable */
const SEED_PACKAGES = [
  "mcp",
  "mcp-server",
  "model-context-protocol",
  "openai-mcp-server",
  "anthropic-mcp",
  "langchain",
  "langgraph",
  "langchain-openai",
  "llama-index",
  "llama-index-agent",
  "openai",
  "anthropic",
  "cursor-mcp",
  "mcp-client",
  "mcp-sdk",
  "openclaw",
];

interface PypiProject {
  info?: {
    name?: string;
    summary?: string;
    description?: string;
    home_page?: string;
    project_url?: string;
    project_urls?: Record<string, string>;
    keywords?: string;
    classifiers?: string[];
  };
}

function extractProjectUrl(info: PypiProject["info"]): string {
  const urls = info?.project_urls ?? {};
  return (
    urls.Repository ??
    urls["Source Code"] ??
    urls.Homepage ??
    info?.home_page ??
    `${PYPI_BASE}/project/${info?.name ?? ""}/`
  );
}

function isRelevantPackage(info: PypiProject["info"], broadMode: boolean): boolean {
  if (!info?.name) return false;
  const name = info.name.toLowerCase();
  const summary = (info.summary ?? "").toLowerCase();
  const desc = (info.description ?? "").toLowerCase().slice(0, 2000);
  const keywords = (info.keywords ?? "").toLowerCase();
  const classifiers = (info.classifiers ?? []).join(" ").toLowerCase();
  const combined = `${name} ${summary} ${keywords} ${classifiers} ${desc}`;

  if (
    combined.includes("mcp") ||
    combined.includes("model context protocol") ||
    combined.includes("modelcontextprotocol")
  )
    return true;
  if (combined.includes("openclaw")) return true;
  if (
    (combined.includes("langchain") || combined.includes("llama-index")) &&
    (combined.includes("agent") || combined.includes("chat"))
  )
    return true;
  if (
    broadMode &&
    (combined.includes(" ai agent") ||
      combined.includes("llm agent") ||
      combined.includes("chatbot") ||
      (combined.includes("agent") && combined.includes("llm")))
  )
    return true;

  return false;
}

const MAX_PYPI_PAGES = 10;

async function searchPypiHtml(term: string, maxPages: number = MAX_PYPI_PAGES): Promise<string[]> {
  const names = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const url = `${PYPI_BASE}/search/?q=${encodeURIComponent(term)}&page=${page}`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "text/html",
          "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.app)",
        },
      });
      if (!res.ok) break;
      const html = await res.text();
      const prevSize = names.size;
      const re = /\/project\/([a-zA-Z0-9._-]+)\//g;
      let m;
      while ((m = re.exec(html)) !== null) names.add(m[1]);
      if (names.size === prevSize) break;
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      break;
    }
  }

  return [...names];
}

async function fetchProjectJson(name: string): Promise<PypiProject | null> {
  try {
    const res = await fetch(`${PYPI_BASE}/pypi/${encodeURIComponent(name)}/json`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.app)",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as PypiProject;
  } catch {
    return null;
  }
}

export async function crawlPypiPackages(
  maxResults: number = 2000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "PYPI",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const seenSourceIds = new Set<string>();
  const broadMode = process.env.CRAWL_BROAD_MODE === "1";
  let totalFound = 0;

  const packageNames = new Set<string>(SEED_PACKAGES);
  for (const term of SEARCH_TERMS) {
    if (packageNames.size >= maxResults * 2) break;
    const found = await searchPypiHtml(term);
    found.forEach((n) => packageNames.add(n));
  }

  try {
    for (const name of packageNames) {
      if (totalFound >= maxResults) break;

      const sourceId = `pypi:${name}`;
      if (seenSourceIds.has(sourceId)) continue;

      const project = await fetchProjectJson(name);
      if (!project?.info) continue;

      if (!isRelevantPackage(project.info, broadMode)) continue;
      seenSourceIds.add(sourceId);

      const info = project.info;
      const slug =
        generateSlug(`pypi-${name.replace(/[._]/g, "-")}`) || `pypi-${totalFound}`;

      const agentData = {
        sourceId,
        source: "PYPI" as const,
        name: info.name ?? name,
        slug,
        description: info.summary ?? info.description?.slice(0, 500) ?? null,
        url: extractProjectUrl(info),
        homepage: info.home_page ?? null,
        capabilities: (info.keywords ?? "")
          .split(/[,;]/)
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, 15),
        protocols: ["MCP", "OPENCLEW"] as string[],
        languages: ["python"] as string[],
        npmData: null,
        openclawData: {
          pypi: true,
          classifiers: info.classifiers?.slice(0, 10),
        } as Record<string, unknown>,
        readme: info.summary ?? "",
        safetyScore: 75,
        popularityScore: 50,
        freshnessScore: 60,
        performanceScore: 0,
        overallRank: 58,
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
        openclawData: agentData.openclawData,
        readme: agentData.readme,
        lastCrawledAt: agentData.lastCrawledAt,
        nextCrawlAt: agentData.nextCrawlAt,
      });

      totalFound++;
      if (totalFound % 50 === 0) {
        await new Promise((r) => setTimeout(r, 500));
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
