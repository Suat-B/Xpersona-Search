/**
 * Awesome Lists Aggregator — discovers agents from curated GitHub awesome-* repos.
 * Parses markdown links from 10+ awesome lists related to AI agents, MCP, LLMs.
 */
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { fetchFileContent } from "../utils/github";
import { upsertAgent } from "../agent-upsert";

interface AwesomeRepo {
  owner: string;
  repo: string;
  file: string;
  branch: string;
  category: string;
}

const AWESOME_REPOS: AwesomeRepo[] = [
  { owner: "punkpeye", repo: "awesome-mcp-servers", file: "README.md", branch: "main", category: "mcp" },
  { owner: "wong2", repo: "awesome-mcp-servers", file: "README.md", branch: "main", category: "mcp" },
  { owner: "appcypher", repo: "awesome-mcp-servers", file: "README.md", branch: "main", category: "mcp" },
  { owner: "kyrolabs", repo: "awesome-langchain", file: "README.md", branch: "main", category: "langchain" },
  { owner: "e2b-dev", repo: "awesome-ai-agents", file: "README.md", branch: "main", category: "ai-agents" },
  { owner: "Shubhamsaboo", repo: "awesome-llm-apps", file: "README.md", branch: "main", category: "llm-apps" },
  { owner: "filipecalegario", repo: "awesome-generative-ai", file: "README.md", branch: "main", category: "generative-ai" },
  { owner: "f", repo: "awesome-chatgpt-prompts", file: "README.md", branch: "main", category: "chatgpt" },
  { owner: "humanloop", repo: "awesome-chatgpt", file: "README.md", branch: "master", category: "chatgpt" },
  { owner: "run-llama", repo: "llama-hub", file: "README.md", branch: "main", category: "llamaindex" },
  { owner: "steven2358", repo: "awesome-generative-ai", file: "README.md", branch: "master", category: "generative-ai" },
  { owner: "jxnl", repo: "awesome-ai-agents", file: "README.md", branch: "main", category: "ai-agents" },
];

interface ParsedLink {
  name: string;
  url: string;
  description: string;
}

function parseMarkdownLinks(md: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  const seen = new Set<string>();

  const patterns = [
    /-\s*\[([^\]]+)\]\(([^)]+)\)\s*[-–:]\s*([^\n]*)/g,
    /-\s*\*\*\[([^\]]+)\]\(([^)]+)\)\*\*\s*[-–:]\s*([^\n]*)/g,
    /\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|[^|]*\|\s*([^|\n]*)/g,
    /-\s*\[([^\]]+)\]\(([^)]+)\)\s*([^\n]*)/g,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(md)) !== null) {
      const [, name, url, description] = m;
      if (!name || !url) continue;

      const normalizedUrl = url.trim().replace(/\/$/, "");
      if (seen.has(normalizedUrl)) continue;

      if (!normalizedUrl.startsWith("http")) continue;
      if (normalizedUrl.includes("#")) continue;

      seen.add(normalizedUrl);
      links.push({
        name: name.trim(),
        url: normalizedUrl,
        description: (description ?? "").trim().slice(0, 500),
      });
    }
  }

  return links;
}

function classifyUrl(url: string): { sourcePrefix: string; protocols: string[] } {
  if (url.includes("github.com")) {
    return { sourcePrefix: "awesome-gh", protocols: ["OPENCLEW"] };
  }
  if (url.includes("npmjs.com")) {
    return { sourcePrefix: "awesome-npm", protocols: ["MCP", "OPENCLEW"] };
  }
  if (url.includes("pypi.org")) {
    return { sourcePrefix: "awesome-pypi", protocols: ["MCP"] };
  }
  if (url.includes("huggingface.co")) {
    return { sourcePrefix: "awesome-hf", protocols: [] };
  }
  return { sourcePrefix: "awesome-web", protocols: [] };
}

export async function crawlAwesomeLists(
  maxResults: number = 5000
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
  const seenSourceIds = new Set<string>();
  let totalFound = 0;

  try {
    for (const repo of AWESOME_REPOS) {
      if (totalFound >= maxResults) break;

      const content = await fetchFileContent(
        `${repo.owner}/${repo.repo}`,
        repo.file,
        repo.branch
      );
      if (!content) continue;

      const links = parseMarkdownLinks(content);

      for (const link of links) {
        if (totalFound >= maxResults) break;

        const { sourcePrefix, protocols } = classifyUrl(link.url);
        const sourceId = `${sourcePrefix}:${link.url.replace(/https?:\/\//, "").replace(/[^a-zA-Z0-9-_.]/g, ":")}`;

        if (seenSourceIds.has(sourceId)) continue;
        seenSourceIds.add(sourceId);

        const slug =
          generateSlug(`awesome-${repo.category}-${link.name}`) ||
          `awesome-${totalFound}`;

        const agentData = {
          sourceId,
          source: "CURATED_SEEDS" as const,
          name: link.name,
          slug,
          description: link.description || null,
          url: link.url,
          homepage: link.url,
          capabilities: [repo.category] as string[],
          protocols,
          languages: [] as string[],
          openclawData: {
            curated: true,
            awesomeList: `${repo.owner}/${repo.repo}`,
            category: repo.category,
          } as Record<string, unknown>,
          readme: link.description || "",
          safetyScore: 72,
          popularityScore: 55,
          freshnessScore: 65,
          performanceScore: 0,
          overallRank: 63,
          status: "ACTIVE" as const,
          lastCrawledAt: new Date(),
          nextCrawlAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };

        await upsertAgent(agentData, {
          name: agentData.name,
          slug: agentData.slug,
          description: agentData.description,
          url: agentData.url,
          homepage: agentData.homepage,
          capabilities: agentData.capabilities,
          openclawData: agentData.openclawData,
          readme: agentData.readme,
          lastCrawledAt: agentData.lastCrawledAt,
          nextCrawlAt: agentData.nextCrawlAt,
        });

        totalFound++;
      }

      await new Promise((r) => setTimeout(r, 500));
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
