/**
 * Langflow starter projects crawler.
 * Uses LANGFLOW_STARTER_PROJECTS_URL when configured.
 */
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";

interface LangflowStarterProject {
  id?: string;
  name?: string;
  description?: string;
  repository?: string;
  homepage?: string;
  tags?: string[];
  updatedAt?: string;
}

type LangflowResponse =
  | LangflowStarterProject[]
  | { starterProjects?: LangflowStarterProject[]; projects?: LangflowStarterProject[] };

function getFeedUrl(): string | null {
  const url = process.env.LANGFLOW_STARTER_PROJECTS_URL ?? "";
  return url.trim() || null;
}

export async function crawlLangflowStarterProjects(
  maxResults: number = 500
): Promise<{ total: number; jobId: string }> {
  const feedUrl = getFeedUrl();
  if (!feedUrl) return { total: 0, jobId: "" };

  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "LANGFLOW_STARTER_PROJECTS",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();

  try {
    const res = await fetch(feedUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.co)",
      },
    });
    if (!res.ok) throw new Error(`Langflow feed returned ${res.status}`);
    const payload = (await res.json()) as LangflowResponse;
    const projects = Array.isArray(payload)
      ? payload
      : payload.starterProjects ?? payload.projects ?? [];
    let totalFound = 0;

    for (const project of projects.slice(0, maxResults)) {
      const sourceId = `langflow:${project.id ?? project.repository ?? project.name ?? totalFound}`;
      const freshnessScore = project.updatedAt
        ? Math.max(30, Math.round(100 * Math.exp(-(Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24 * 200))))
        : 45;
      const agentData = {
        sourceId,
        source: "LANGFLOW_STARTER_PROJECTS" as const,
        name: project.name?.trim() || "Langflow starter project",
        slug: generateSlug(`langflow-${project.name ?? project.id ?? totalFound}`) || `langflow-${totalFound}`,
        description: project.description ?? null,
        url: project.repository ?? project.homepage ?? "https://www.langflow.org",
        homepage: project.homepage ?? project.repository ?? null,
        capabilities: (project.tags ?? ["workflow", "starter project"]).slice(0, 20),
        protocols: [] as string[],
        languages: [] as string[],
        openclawData: {
          discoverySignals: {
            hasManifest: true,
            lastUpdatedAt: project.updatedAt ?? null,
            repoLinked: Boolean(project.repository || project.homepage),
          },
        } as Record<string, unknown>,
        readme: project.description ?? "",
        safetyScore: 78,
        popularityScore: 40,
        freshnessScore,
        performanceScore: 0,
        overallRank: Math.round((58 + freshnessScore * 0.18) * 10) / 10,
        status: "ACTIVE" as const,
        lastCrawledAt: new Date(),
        nextCrawlAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
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
        freshnessScore: agentData.freshnessScore,
        overallRank: agentData.overallRank,
        lastCrawledAt: agentData.lastCrawledAt,
        nextCrawlAt: agentData.nextCrawlAt,
      });
      totalFound += 1;
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
