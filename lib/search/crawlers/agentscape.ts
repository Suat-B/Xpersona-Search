/**
 * AgentScape crawler — discovers agents from agentscape.cc open registry.
 * API: https://api.agentscape.cc/agents
 */
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";

const AGENTSCAPE_API = "https://api.agentscape.cc/agents";

interface AgentScapeAgent {
  id?: string;
  name?: string;
  description?: string;
  endpoint?: string;
  organization?: string;
  tags?: string[];
  openapi_url?: string;
}

async function fetchAgentScapeAgents(): Promise<AgentScapeAgent[]> {
  try {
    const res = await fetch(AGENTSCAPE_API, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.app)",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.agents ?? data.results ?? [];
  } catch {
    return [];
  }
}

export async function crawlAgentScape(
  maxResults: number = 500
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "AGENTSCAPE",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  let totalFound = 0;

  try {
    const agentList = await fetchAgentScapeAgents();

    for (const agent of agentList.slice(0, maxResults)) {
      if (!agent.name && !agent.id) continue;

      const sourceId = `agentscape:${agent.id ?? agent.name ?? totalFound}`;
      const slug =
        generateSlug(`agentscape-${agent.name ?? agent.id ?? ""}`) ||
        `agentscape-${totalFound}`;
      const url = agent.endpoint ?? agent.openapi_url ?? `https://agentscape.cc/agents/${agent.id ?? ""}`;

      const agentData = {
        sourceId,
        source: "AGENTSCAPE" as const,
        name: agent.name ?? agent.id ?? "Unknown",
        slug,
        description: agent.description ?? null,
        url,
        homepage: agent.endpoint ?? null,
        capabilities: (agent.tags ?? []).slice(0, 15),
        protocols: ["A2A"] as string[],
        languages: [] as string[],
        npmData: null,
        openclawData: {
          agentscape: true,
          organization: agent.organization,
          openapiUrl: agent.openapi_url,
        } as Record<string, unknown>,
        readme: agent.description ?? "",
        safetyScore: 65,
        popularityScore: 50,
        freshnessScore: 70,
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
            description: agentData.description,
            url: agentData.url,
            homepage: agentData.homepage,
            capabilities: agentData.capabilities,
            openclawData: agentData.openclawData,
            readme: agentData.readme,
            lastCrawledAt: agentData.lastCrawledAt,
            nextCrawlAt: agentData.nextCrawlAt,
            updatedAt: new Date(),
          },
        });

      totalFound++;
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
