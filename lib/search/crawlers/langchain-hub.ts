/**
 * LangChain Hub crawler — discovers agents/chains from GitHub repos
 * related to the LangChain ecosystem (LangGraph, LangChain templates, etc.).
 * Uses GitHub search + PyPI/npm for LangChain-related packages.
 */
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";
import { buildSearchableReadme } from "../utils/build-readme";

const LANGCHAIN_PYPI_TERMS = [
  "langchain",
  "langgraph",
  "langchain-community",
  "langchain-core",
  "langchain-openai",
  "langchain-anthropic",
  "langchain-google",
  "langchain-experimental",
  "langserve",
  "langchain-agent",
  "langchain-tools",
  "langchain-rag",
  "langchain-embeddings",
  "langchain-vectorstores",
];

const LANGCHAIN_NPM_TERMS = [
  "langchain",
  "@langchain/core",
  "@langchain/openai",
  "@langchain/anthropic",
  "@langchain/community",
  "@langchain/langgraph",
  "langchainjs",
];

interface PypiProject {
  info?: {
    name?: string;
    summary?: string;
    home_page?: string;
    project_urls?: Record<string, string>;
    keywords?: string;
  };
}

interface NpmSearchObject {
  package: {
    name: string;
    description?: string;
    keywords?: string[];
    links?: { homepage?: string; repository?: string; npm?: string };
    date?: string;
  };
  score?: { final?: number };
}

async function fetchPypiPackage(name: string): Promise<PypiProject | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      headers: { Accept: "application/json", "User-Agent": "Xpersona-Crawler/1.0" },
    });
    if (!res.ok) return null;
    return (await res.json()) as PypiProject;
  } catch { return null; }
}

async function searchNpm(term: string): Promise<NpmSearchObject[]> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(term)}&size=100`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data as { objects?: NpmSearchObject[] }).objects ?? [];
  } catch { return []; }
}

export async function crawlLangChainHub(
  maxResults: number = 2000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "CURATED_SEEDS",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const seenIds = new Set<string>();
  let totalFound = 0;

  try {
    for (const term of LANGCHAIN_PYPI_TERMS) {
      if (totalFound >= maxResults) break;

      const project = await fetchPypiPackage(term);
      const info = project?.info;
      const name = info?.name;
      if (!info || !name) continue;
      const sourceId = `langchain-pypi:${name}`;
      if (seenIds.has(sourceId)) continue;
      seenIds.add(sourceId);

      const urls = info.project_urls ?? {};
      const url = urls.Repository ?? urls["Source Code"] ?? urls.Homepage ?? info.home_page ?? `https://pypi.org/project/${name}/`;
      const slug = generateSlug(`langchain-${name.replace(/[._]/g, "-")}`) || `langchain-${totalFound}`;

      const agentData = {
        sourceId,
        source: "PYPI" as const,
        name,
        slug,
        description: info.summary ?? null,
        url,
        homepage: info.home_page ?? null,
        capabilities: (info.keywords ?? "").split(/[,;]/).map((k) => k.trim()).filter(Boolean).slice(0, 15),
        protocols: ["OPENCLEW"] as string[],
        languages: ["python"] as string[],
        openclawData: { langchain: true, pypi: true } as Record<string, unknown>,
        readme: buildSearchableReadme({
          description: info.summary,
          capabilities: (info.keywords ?? "").split(/[,;]/).map((k) => k.trim()).filter(Boolean).slice(0, 15),
          protocols: ["OPENCLEW"],
          languages: ["python"],
          extra: [name, "langchain"],
        }),
        safetyScore: 72,
        popularityScore: 60,
        freshnessScore: 70,
        performanceScore: 0,
        overallRank: 66,
        status: "ACTIVE" as const,
        lastCrawledAt: new Date(),
        nextCrawlAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      };

      await upsertAgent(agentData, {
        name: agentData.name, slug: agentData.slug, description: agentData.description,
        url: agentData.url, homepage: agentData.homepage,
        openclawData: agentData.openclawData, readme: agentData.readme,
        lastCrawledAt: agentData.lastCrawledAt, nextCrawlAt: agentData.nextCrawlAt,
      });
      totalFound++;
      await new Promise((r) => setTimeout(r, 200));
    }

    for (const term of LANGCHAIN_NPM_TERMS) {
      if (totalFound >= maxResults) break;

      const packages = await searchNpm(term);

      for (const obj of packages) {
        if (totalFound >= maxResults) break;

        const pkg = obj.package;
        if (!pkg.name.includes("langchain") && !pkg.name.includes("langgraph")) continue;

        const sourceId = `langchain-npm:${pkg.name}`;
        if (seenIds.has(sourceId)) continue;
        seenIds.add(sourceId);

        const url = pkg.links?.repository ?? pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`;
        const slug = generateSlug(`langchain-${pkg.name.replace(/[@/]/g, "-")}`) || `langchain-npm-${totalFound}`;

        const agentData = {
          sourceId,
          source: "NPM" as const,
          name: pkg.name,
          slug,
          description: pkg.description ?? null,
          url,
          homepage: pkg.links?.homepage ?? null,
          capabilities: (pkg.keywords ?? []).slice(0, 15),
          protocols: ["OPENCLEW"] as string[],
          languages: ["typescript"] as string[],
          npmData: { packageName: pkg.name, langchain: true } as Record<string, unknown>,
          openclawData: null as unknown as Record<string, unknown>,
          readme: buildSearchableReadme({
            description: pkg.description,
            capabilities: (pkg.keywords ?? []).slice(0, 15),
            protocols: ["OPENCLEW"],
            languages: ["typescript"],
            keywords: pkg.keywords,
            extra: [pkg.name, "langchain"],
          }),
          safetyScore: 70,
          popularityScore: Math.min(100, Math.round((obj.score?.final ?? 0) / 15)),
          freshnessScore: 70,
          performanceScore: 0,
          overallRank: 65,
          status: "ACTIVE" as const,
          lastCrawledAt: new Date(),
          nextCrawlAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        };

        await upsertAgent(agentData, {
          name: agentData.name, slug: agentData.slug, description: agentData.description,
          url: agentData.url, homepage: agentData.homepage,
          npmData: agentData.npmData, readme: agentData.readme,
          lastCrawledAt: agentData.lastCrawledAt, nextCrawlAt: agentData.nextCrawlAt,
        });
        totalFound++;
      }
      await new Promise((r) => setTimeout(r, 300));
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
