/**
 * URL Frontier — priority queue of discovered-but-not-yet-crawled URLs.
 * Persists to the crawl_frontier database table. Supports batch operations
 * for efficient frontier management during recursive discovery passes.
 */
import { db } from "@/lib/db";
import { crawlFrontier, agents } from "@/lib/db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import type { ExtractedLink } from "./link-extractor";
import {
  extractLinksFromReadme,
  extractLinksFromDependencies,
  extractLinksFromAgentCard,
} from "./link-extractor";

export interface FrontierEntry {
  id: string;
  url: string;
  priority: number;
  status: string;
  attempts: number;
}

export async function addToFrontier(
  links: ExtractedLink[],
  discoveredFromId?: string
): Promise<number> {
  let added = 0;

  for (const link of links) {
    try {
      await db
        .insert(crawlFrontier)
        .values({
          url: link.url,
          discoveredFrom: discoveredFromId ?? null,
          priority: link.priority,
          status: "PENDING",
          attempts: 0,
        })
        .onConflictDoUpdate({
          target: crawlFrontier.url,
          set: {
            priority: sql`GREATEST(${crawlFrontier.priority}, ${link.priority})`,
          },
        });
      added++;
    } catch {
      // duplicate URL or constraint violation — skip
    }
  }

  return added;
}

export async function fetchNextBatch(
  batchSize: number = 50
): Promise<FrontierEntry[]> {
  const rows = await db
    .select({
      id: crawlFrontier.id,
      url: crawlFrontier.url,
      priority: crawlFrontier.priority,
      status: crawlFrontier.status,
      attempts: crawlFrontier.attempts,
    })
    .from(crawlFrontier)
    .where(
      and(
        eq(crawlFrontier.status, "PENDING"),
        sql`${crawlFrontier.attempts} < 3`
      )
    )
    .orderBy(desc(crawlFrontier.priority))
    .limit(batchSize);

  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    await db
      .update(crawlFrontier)
      .set({
        status: "PROCESSING",
        lastAttemptAt: new Date(),
        attempts: sql`${crawlFrontier.attempts} + 1`,
      })
      .where(inArray(crawlFrontier.id, ids));
  }

  return rows;
}

export async function markCrawled(id: string): Promise<void> {
  await db
    .update(crawlFrontier)
    .set({ status: "CRAWLED" })
    .where(eq(crawlFrontier.id, id));
}

export async function markFailed(id: string): Promise<void> {
  await db
    .update(crawlFrontier)
    .set({ status: "PENDING" })
    .where(eq(crawlFrontier.id, id));
}

export async function getFrontierStats(): Promise<{
  pending: number;
  processing: number;
  crawled: number;
  failed: number;
}> {
  const rows = await db
    .select({
      status: crawlFrontier.status,
      count: sql<number>`count(*)::int`,
    })
    .from(crawlFrontier)
    .groupBy(crawlFrontier.status);

  const stats = { pending: 0, processing: 0, crawled: 0, failed: 0 };
  for (const row of rows) {
    const key = row.status.toLowerCase() as keyof typeof stats;
    if (key in stats) stats[key] = row.count;
  }
  return stats;
}

/**
 * Runs a single discovery pass: scans all recently-crawled agents,
 * extracts outbound links, and adds them to the frontier.
 */
export async function runDiscoveryPass(
  sinceHours: number = 24
): Promise<{ agentsScanned: number; linksAdded: number }> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const PAGE_SIZE = 500;
  let offset = 0;
  let agentsScanned = 0;
  let linksAdded = 0;

  while (true) {
    const batch = await db
      .select({
        id: agents.id,
        readme: agents.readme,
        agentCard: agents.agentCard,
        npmData: agents.npmData,
      })
      .from(agents)
      .where(sql`${agents.lastCrawledAt} >= ${since}`)
      .limit(PAGE_SIZE)
      .offset(offset);

    if (batch.length === 0) break;

    for (const agent of batch) {
      const links: ExtractedLink[] = [];

      if (agent.readme) {
        links.push(...extractLinksFromReadme(agent.readme));
      }

      if (agent.agentCard && typeof agent.agentCard === "object") {
        links.push(
          ...extractLinksFromAgentCard(agent.agentCard as Record<string, unknown>)
        );
      }

      if (agent.npmData && typeof agent.npmData === "object") {
        const npm = agent.npmData as Record<string, unknown>;
        const deps = (npm.dependencies as Record<string, string>) ?? {};
        const devDeps = (npm.devDependencies as Record<string, string>) ?? {};
        links.push(...extractLinksFromDependencies({ ...deps, ...devDeps }));
      }

      if (links.length > 0) {
        const added = await addToFrontier(links, agent.id);
        linksAdded += added;
      }
      agentsScanned++;
    }

    offset += PAGE_SIZE;
    if (batch.length < PAGE_SIZE) break;
  }

  return { agentsScanned, linksAdded };
}
