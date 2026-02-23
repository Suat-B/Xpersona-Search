/**
 * AgentScape crawler — discovers agents from agentscape.cc open registry.
 * API: https://api.agentscape.cc/agents
 */
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";

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

interface AgentScapeResponse {
  agents?: AgentScapeAgent[];
  results?: AgentScapeAgent[];
  next?: string;
  nextCursor?: string;
  total?: number;
}

async function fetchAgentScapeAgents(cursor?: string): Promise<{ agents: AgentScapeAgent[]; next?: string }> {
  try {
    const url = new URL(AGENTSCAPE_API);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.app)",
      },
    });
    if (!res.ok) return { agents: [] };
    const data = await res.json();
    const agents = Array.isArray(data) ? data : (data as AgentScapeResponse).agents ?? (data as AgentScapeResponse).results ?? [];
    const next = Array.isArray(data) ? undefined : ((data as AgentScapeResponse).next ?? (data as AgentScapeResponse).nextCursor);
    return { agents, next };
  } catch {
    return { agents: [] };
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
    let cursor: string | undefined;
    const allAgents: AgentScapeAgent[] = [];

    do {
      const result = await fetchAgentScapeAgents(cursor);
      allAgents.push(...result.agents);
      cursor = result.next;
      if (result.agents.length === 0) break;
      await new Promise((r) => setTimeout(r, 300));
    } while (cursor && allAgents.length < maxResults);

    for (const agent of allAgents.slice(0, maxResults)) {
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
        safetyScore: 75,
        popularityScore: 50,
        freshnessScore: 70,
        performanceScore: 0,
        overallRank: 61,
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
