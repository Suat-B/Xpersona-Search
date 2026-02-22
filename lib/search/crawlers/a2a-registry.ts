/**
 * A2A Registry crawler — discovers agents from the A2A Protocol Registry.
 * Requires A2A_REGISTRY_URL env (e.g. https://api.a2a-registry.dev).
 * Gracefully no-ops if registry is unavailable.
 */
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { upsertAgent } from "../agent-upsert";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";

const DEFAULT_REGISTRY_URL = "https://api.a2a-registry.dev";

interface A2AAgentCard {
  name?: string;
  description?: string;
  url?: string;
  version?: string;
  protocol_version?: string;
  skills?: Array<{ id?: string; description?: string }>;
}

interface A2AAgentResponse {
  agent_id?: string;
  agent_card?: A2AAgentCard;
}

interface A2AListResponse {
  agents?: A2AAgentResponse[];
  count?: number;
}

function getRegistryUrl(): string | null {
  const url = process.env.A2A_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;
  return url.trim() || null;
}

export async function crawlA2ARegistry(
  maxResults: number = 200
): Promise<{ total: number; jobId: string }> {
  const baseUrl = getRegistryUrl();
  if (!baseUrl) {
    return { total: 0, jobId: "" };
  }

  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "GITHUB_A2A",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();

  try {
    let list: A2AListResponse;
    try {
      const res = await fetch(`${baseUrl}/agents`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`A2A registry returned ${res.status}`);
      }
      list = (await res.json()) as A2AListResponse;
    } catch (err) {
      console.warn("[A2A Crawl] Registry fetch failed:", err);
      await db
        .update(crawlJobs)
        .set({
          status: "FAILED",
          completedAt: new Date(),
          error: err instanceof Error ? err.message : String(err),
        })
        .where(eq(crawlJobs.id, jobId));
      return { total: 0, jobId };
    }

    const items = list.agents ?? [];
    let totalFound = 0;

    for (const item of items) {
      if (totalFound >= maxResults) break;

      const card = item.agent_card;
      const agentId = item.agent_id;
      if (!card?.name || !agentId) continue;

      const sourceId = `a2a:${agentId}`;
      const name = card.name;
      const description = card.description ?? null;
      const url = card.url ?? `https://a2a-registry.dev/agents/${agentId}`;
      const slug = generateSlug(`a2a-${agentId}-${name}`) || `a2a-${agentId}`;

      const capabilities: string[] = [];
      for (const skill of card.skills ?? []) {
        if (skill.id) capabilities.push(skill.id);
        if (skill.description) capabilities.push(skill.description.slice(0, 50));
      }

      const agentData = {
        sourceId,
        source: "GITHUB_A2A" as const,
        name,
        slug,
        description,
        url,
        homepage: card.url ?? null,
        capabilities: [...new Set(capabilities)].slice(0, 20),
        protocols: ["A2A"] as string[],
        languages: [] as string[],
        agentCard: card as unknown as Record<string, unknown>,
        githubData: null,
        readme: description,
        safetyScore: 70,
        popularityScore: 50,
        freshnessScore: 70,
        performanceScore: 0,
        overallRank: 63,
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
        agentCard: agentData.agentCard,
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
