/**
 * Curated seed lists crawler — discovers agents from awesome-openclaw-skills
 * and modelcontextprotocol/servers.
 */
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { fetchFileContent } from "../utils/github";

const AWESOME_OPENCLEW_REPO = "VoltAgent/awesome-openclaw-skills";
const MCP_SERVERS_REPO = "modelcontextprotocol/servers";

interface ParsedSkill {
  slug: string;
  owner: string;
  path: string;
  description: string;
  name: string;
}

interface ParsedMcpServer {
  name: string;
  url: string;
  description: string;
}

function parseAwesomeOpenClawSkills(md: string): ParsedSkill[] {
  const skills: ParsedSkill[] = [];
  const re =
    /-\s*\[([^\]]+)\]\((https:\/\/github\.com\/openclaw\/skills\/tree\/main\/skills\/([^/]+)\/([^/]+)\/SKILL\.md)\)\s*-\s*([^\n]*)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const [, name, , owner, slug, description] = m;
    skills.push({
      name: name?.trim() ?? "",
      slug: slug ?? "",
      owner: owner ?? "",
      path: `skills/${owner}/${slug}`,
      description: description?.trim().slice(0, 500) ?? "",
    });
  }
  return skills;
}

function parseMcpServersList(md: string): ParsedMcpServer[] {
  const servers: ParsedMcpServer[] = [];
  const re = /-\s*\*\*\[([^\]]+)\]\(([^)]+)\)\*\*\s*-\s*([^\n]*)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const [, name, url, description] = m;
    if (name && url && (url.includes("github.com") || url.includes("npmjs.com") || url.includes("http"))) {
      servers.push({
        name: name.trim(),
        url: url.trim(),
        description: description?.trim().slice(0, 500) ?? "",
      });
    }
  }
  return servers;
}

export async function crawlCuratedSeeds(
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
  let totalFound = 0;

  try {
    const awesomeMd = await fetchFileContent(
      AWESOME_OPENCLEW_REPO,
      "README.md",
      "main"
    );
    if (awesomeMd) {
      const skills = parseAwesomeOpenClawSkills(awesomeMd);
      for (const s of skills) {
        if (totalFound >= maxResults) break;

        const sourceId = `clawhub:${s.path.replace(/\//g, ":")}`;
        const slug =
          generateSlug(`curated-${s.owner}-${s.slug}`) || `curated-${totalFound}`;
        const url = `https://github.com/openclaw/skills/tree/main/${s.path}`;

        const agentData = {
          sourceId,
          source: "CLAWHUB" as const,
          name: s.name || s.slug,
          slug,
          description: s.description || null,
          url,
          homepage: null,
          capabilities: [] as string[],
          protocols: ["OPENCLEW"] as string[],
          languages: [] as string[],
          openclawData: { curated: true, category: "awesome-openclaw" } as Record<string, unknown>,
          readme: s.description || "",
          safetyScore: 75,
          popularityScore: 55,
          freshnessScore: 70,
          performanceScore: 0,
          overallRank: 65,
          status: "ACTIVE" as const,
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
              description: agentData.description,
              url: agentData.url,
              openclawData: agentData.openclawData,
              readme: agentData.readme,
              lastCrawledAt: agentData.lastCrawledAt,
              nextCrawlAt: agentData.nextCrawlAt,
              updatedAt: new Date(),
            },
          });

        totalFound++;
      }
    }

    const mcpMd = await fetchFileContent(MCP_SERVERS_REPO, "README.md", "main");
    if (mcpMd) {
      const servers = parseMcpServersList(mcpMd);
      const seen = new Set<string>();

      for (const s of servers) {
        if (totalFound >= maxResults) break;

        let sourceId: string;
        let source: "CURATED_SEEDS" | "GITHUB_MCP" | "NPM" = "CURATED_SEEDS";
        if (s.url.includes("github.com/") && !s.url.includes("tree/")) {
          const match = s.url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git|\/|$)/);
          const repo = match?.[1]?.replace(/\.git$/, "");
          if (repo) {
            sourceId = `curated-mcp:${repo.replace(/\//g, ":")}`;
            source = "CURATED_SEEDS";
          } else {
            sourceId = `curated-mcp:${s.name.toLowerCase().replace(/\s+/g, "-")}`;
          }
        } else if (s.url.includes("npmjs.com/package/")) {
          const match = s.url.match(/package\/(@?[^/]+(?:\/[^/?]+)?)/);
          const pkg = match?.[1];
          if (pkg) {
            sourceId = `npm:${pkg}`;
            source = "NPM";
          } else {
            sourceId = `curated-mcp:${s.name.toLowerCase().replace(/\s+/g, "-")}`;
          }
        } else {
          sourceId = `curated-mcp:${s.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")}`;
        }

        if (seen.has(sourceId)) continue;
        seen.add(sourceId);

        const slug =
          generateSlug(`curated-mcp-${s.name}`) || `curated-mcp-${totalFound}`;

        const agentData = {
          sourceId,
          source,
          name: s.name,
          slug,
          description: s.description || null,
          url: s.url,
          homepage: s.url,
          capabilities: [] as string[],
          protocols: ["MCP"] as string[],
          languages: [] as string[],
          openclawData: { curated: true, from: "mcp-servers-readme" } as Record<string, unknown>,
          readme: s.description || "",
          safetyScore: 70,
          popularityScore: 50,
          freshnessScore: 65,
          performanceScore: 0,
          overallRank: 61,
          status: "ACTIVE" as const,
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
              url: agentData.url,
              homepage: agentData.homepage,
              openclawData: agentData.openclawData,
              readme: agentData.readme,
              lastCrawledAt: agentData.lastCrawledAt,
              nextCrawlAt: agentData.nextCrawlAt,
              updatedAt: new Date(),
            },
          });

        totalFound++;
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
