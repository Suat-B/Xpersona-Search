import { db } from "@/lib/db";
import { agents, crawlFrontier, mediaWebFrontier } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { enqueueTasks } from "./queue";
import { sha256Hex } from "./hash";
import { normalizePublicHttpsUrl } from "./url-policy";
import type { TaskEnqueueInput } from "./types";
import { extractLinksFromReadme } from "@/lib/search/discovery/link-extractor";

function makeFetchTaskKey(url: string): string {
  return `fetch:${sha256Hex(url.toLowerCase())}`;
}

function makeSeedTaskKey(scope: string): string {
  return `seed:${scope}`;
}

export async function enqueueSeedTask(scope = "default", priority = 100): Promise<number> {
  return enqueueTasks([
    {
      taskType: "seed",
      taskKey: makeSeedTaskKey(scope),
      payload: { reason: scope },
      priority,
    },
  ]);
}

export async function seedFetchTasks(params?: {
  limitAgents?: number;
  limitFrontier?: number;
  limitMediaFrontier?: number;
}): Promise<{ queued: number }> {
  const limitAgents = params?.limitAgents ?? 1500;
  const limitFrontier = params?.limitFrontier ?? 5000;
  const limitMediaFrontier = params?.limitMediaFrontier ?? 5000;
  const tasks: TaskEnqueueInput[] = [];

  const topAgents = await db
    .select({
      id: agents.id,
      sourceId: agents.sourceId,
      source: agents.source,
      url: agents.url,
      homepage: agents.homepage,
      readme: agents.readme,
    })
    .from(agents)
    .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)))
    .orderBy(desc(agents.overallRank), desc(agents.updatedAt))
    .limit(limitAgents);

  for (const row of topAgents) {
    const urls = [row.url, row.homepage].filter((v): v is string => Boolean(v));
    for (const raw of urls) {
      const normalized = normalizePublicHttpsUrl(raw);
      if (!normalized) continue;
      tasks.push({
        taskType: "fetch",
        taskKey: makeFetchTaskKey(normalized),
        payload: {
          url: normalized,
          source: row.source,
          sourceId: row.sourceId,
        },
        priority: 80,
      });
    }
    if (row.readme && row.readme.length > 0) {
      const links = extractLinksFromReadme(row.readme)
        .map((link) => normalizePublicHttpsUrl(link.url))
        .filter((url): url is string => Boolean(url))
        .slice(0, 12);
      for (const link of links) {
        tasks.push({
          taskType: "fetch",
          taskKey: makeFetchTaskKey(link),
          payload: {
            url: link,
            source: row.source,
            sourceId: row.sourceId,
            parentUrl: row.url,
          },
          priority: 50,
        });
      }
    }
  }

  const frontierRows = await db
    .select({
      url: crawlFrontier.url,
      originSource: crawlFrontier.originSource,
      confidence: crawlFrontier.confidence,
    })
    .from(crawlFrontier)
    .where(and(inArray(crawlFrontier.status, ["PENDING", "PROCESSING"])))
    .orderBy(desc(crawlFrontier.priority), desc(crawlFrontier.discoveryAt))
    .limit(limitFrontier);

  for (const row of frontierRows) {
    const normalized = normalizePublicHttpsUrl(row.url);
    if (!normalized) continue;
    tasks.push({
      taskType: "fetch",
      taskKey: makeFetchTaskKey(normalized),
      payload: {
        url: normalized,
        source: row.originSource ?? "FRONTIER",
      },
      priority: Number(row.confidence ?? 0),
    });
  }

  const mediaRows = await db
    .select({
      url: mediaWebFrontier.url,
      source: mediaWebFrontier.source,
      priority: mediaWebFrontier.priority,
      status: mediaWebFrontier.status,
    })
    .from(mediaWebFrontier)
    .where(inArray(mediaWebFrontier.status, ["PENDING", "RUNNING", "COMPLETED"]))
    .orderBy(desc(mediaWebFrontier.priority), desc(mediaWebFrontier.updatedAt))
    .limit(limitMediaFrontier);

  for (const row of mediaRows) {
    const normalized = normalizePublicHttpsUrl(row.url);
    if (!normalized) continue;
    tasks.push({
      taskType: "fetch",
      taskKey: makeFetchTaskKey(normalized),
      payload: {
        url: normalized,
        source: row.source ?? "MEDIA_WEB",
      },
      priority: Math.max(10, Number(row.priority ?? 0)),
    });
  }

  const queued = await enqueueTasks(tasks);
  return { queued };
}
