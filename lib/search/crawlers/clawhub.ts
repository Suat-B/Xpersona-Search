/**
 * ClawHub crawler — discovers OpenClaw skills from the official registry.
 * Uses openclaw/skills GitHub repo (archives ClawHub) when ClawHub API is unavailable.
 */
import pLimit from "p-limit";
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { octokit, fetchFileContent } from "../utils/github";
import { parseSkillMd } from "../parsers/skill-md";
import { generateSlug } from "../utils/slug";

const SKILLS_REPO = "openclaw/skills";
const CONCURRENCY = 5;
const RATE_LIMIT_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function crawlClawHub(
  maxResults: number = 5000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "CLAWHUB",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const limit = pLimit(CONCURRENCY);

  let totalFound = 0;

  try {
    const { data: treeData } = await octokit.rest.git.getTree({
      owner: "openclaw",
      repo: "skills",
      tree_sha: "main",
      recursive: "1",
    });

    const tree = treeData.tree as Array<{ path?: string; type?: string }>;
    const skillPaths = tree
      .filter((n) => n.path?.endsWith("/SKILL.md") && n.type === "blob")
      .map((n) => n.path!)
      .slice(0, maxResults);

    for (const path of skillPaths) {
      if (totalFound >= maxResults) break;

      const pathBase = path.replace(/\/SKILL\.md$/, "");
      const parts = pathBase.split("/");
      const slugFromPath = parts[parts.length - 1] ?? "skill";
      const sourceId = `clawhub:${pathBase.replace(/\//g, ":")}`;

      const skillContent = await limit(() =>
        fetchFileContent(SKILLS_REPO, path, "main")
      );
      if (!skillContent) continue;

      const skillData = parseSkillMd(skillContent);
      const name = skillData.name ?? slugFromPath;
      const slug =
        generateSlug(`clawhub-${pathBase.replace(/\//g, "-")}`) ||
        `clawhub-${totalFound}`;
      const url = `https://github.com/${SKILLS_REPO}/tree/main/${pathBase}`;

      const agentData = {
        sourceId,
        source: "CLAWHUB" as const,
        name,
        slug,
        description: skillData.description ?? null,
        url,
        homepage: skillData.homepage ?? null,
        capabilities: skillData.capabilities ?? [],
        protocols: skillData.protocols,
        languages: ["typescript"] as string[],
        openclawData: skillData as unknown as Record<string, unknown>,
        readme: skillContent,
        safetyScore: 70,
        popularityScore: 50,
        freshnessScore: 70,
        performanceScore: 0,
        overallRank: 62,
        status: "ACTIVE" as const,
        lastCrawledAt: new Date(),
        nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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
      if (totalFound % 100 === 0) await sleep(RATE_LIMIT_DELAY_MS);
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
