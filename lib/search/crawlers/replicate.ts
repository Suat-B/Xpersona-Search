/**
 * Replicate crawler — discovers AI models/agents from replicate.com.
 * Requires REPLICATE_API_TOKEN. API: https://api.replicate.com/v1/models
 */
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { upsertAgent } from "../agent-upsert";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";

const REPLICATE_API = "https://api.replicate.com/v1/models";

interface ReplicateModel {
  url?: string;
  owner?: string;
  name?: string;
  description?: string;
  run_count?: number;
}

interface ReplicateResponse {
  results?: ReplicateModel[];
  next?: string;
}

async function fetchReplicateModels(
  token: string,
  cursor?: string
): Promise<ReplicateResponse> {
  const url = new URL(REPLICATE_API);
  if (cursor) url.searchParams.set("cursor", cursor);
  url.searchParams.set("limit", "100");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.app)",
    },
  });
  if (!res.ok) return {};
  return (await res.json()) as ReplicateResponse;
}

export async function crawlReplicate(
  maxResults: number = 1000
): Promise<{ total: number; jobId: string }> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return { total: 0, jobId: "" };
  }

  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "REPLICATE",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const seenIds = new Set<string>();
  let totalFound = 0;
  let cursor: string | undefined;

  try {
    do {
      const data = await fetchReplicateModels(token, cursor);
      const results = data.results ?? [];
      cursor = data.next;

      for (const model of results) {
        if (totalFound >= maxResults) break;
        if (!model.url && !model.owner) continue;

        const id = model.url ?? `${model.owner}/${model.name}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const sourceId = `replicate:${id}`;
        const slug =
          generateSlug(`replicate-${id.replace(/\//g, "-")}`) || `replicate-${totalFound}`;
        const url = `https://replicate.com/${id}`;

        const popularityScore = Math.min(100, Math.round((model.run_count ?? 0) / 10000));

        const agentData = {
          sourceId,
          source: "REPLICATE" as const,
          name: model.name ?? id.split("/").pop() ?? id,
          slug,
          description: model.description ?? null,
          url,
          homepage: url,
          capabilities: [] as string[],
          protocols: [] as string[],
          languages: [] as string[],
          npmData: null,
          openclawData: {
            replicate: true,
            runCount: model.run_count,
            owner: model.owner,
          } as Record<string, unknown>,
          readme: model.description ?? "",
          safetyScore: 75,
          popularityScore,
          freshnessScore: 70,
          performanceScore: 0,
          overallRank: 65,
          status: "ACTIVE" as const,
          lastCrawledAt: new Date(),
          nextCrawlAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };

          await upsertAgent(agentData, {
            name: agentData.name,
            slug: agentData.slug,
            description: agentData.description,
            url: agentData.url,
            openclawData: agentData.openclawData,
            popularityScore: agentData.popularityScore,
            lastCrawledAt: agentData.lastCrawledAt,
            nextCrawlAt: agentData.nextCrawlAt,
          });

        totalFound++;
      }

      await new Promise((r) => setTimeout(r, 300));
    } while (cursor && totalFound < maxResults);

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
