import { enqueueTasks, leaseTasks, completeTask, retryTask, failTask, reapStaleLeasedTasks } from "./queue";
import type { CrawlTaskType, QueuedTask, TaskEnqueueInput } from "./types";
import { fetchAndExtractPublicPage } from "./fetch-extract";
import { getDomainFromUrl, normalizePublicHttpsUrl } from "./url-policy";
import { db } from "@/lib/db";
import { crawlCheckpoints } from "@/lib/db/schema";
import {
  recordDomainFailure,
  recordDomainSuccess,
  shouldAllowDomainFetch,
} from "./domain-policy";
import { buildChunkDocuments, upsertSearchDocuments } from "./documents";
import { sha256Hex } from "./hash";
import { seedFetchTasks } from "./seed";
import type { SearchDocumentInput } from "./documents";

interface WorkerOptions {
  workerId: string;
  taskTypes: CrawlTaskType[];
  concurrency?: number;
  pollIntervalMs?: number;
  leaseMs?: number;
}

interface FetchTaskPayload {
  url?: string;
  source?: string;
  sourceId?: string;
  parentUrl?: string;
}

interface ExtractTaskPayload {
  url?: string;
  source?: string;
  sourceId?: string;
  title?: string | null;
  plainText?: string | null;
  links?: string[];
}

interface IndexTaskPayload {
  docs?: SearchDocumentInput[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toTaskKey(prefix: string, input: string): string {
  return `${prefix}:${sha256Hex(input).slice(0, 24)}`;
}

function splitIntoBatches<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function retryDelayMs(attempt: number): number {
  const base = Math.min(120_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 500);
  return base + jitter;
}

function checkpointModeForTaskTypes(taskTypes: CrawlTaskType[]): string {
  if (taskTypes.length === 0) return "all";
  const normalized = [...new Set(taskTypes)].sort().join("_");
  return normalized.slice(0, 16);
}

async function writePipelineCheckpoint(params: {
  mode: string;
  workerId: string;
  taskTypes: CrawlTaskType[];
  processedTotal: number;
  failedTotal: number;
  lastTaskAt: number | null;
  leaseMs: number;
}) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + Math.max(20_000, params.leaseMs));
  const cursor = {
    workerId: params.workerId,
    taskTypes: params.taskTypes,
    processedTotal: params.processedTotal,
    failedTotal: params.failedTotal,
    lastTaskAt: params.lastTaskAt ? new Date(params.lastTaskAt).toISOString() : null,
    updatedAt: now.toISOString(),
  };

  await db
    .insert(crawlCheckpoints)
    .values({
      source: "TASK_PIPELINE",
      mode: params.mode,
      cursor,
      workerId: params.workerId,
      leaseExpiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [crawlCheckpoints.source, crawlCheckpoints.mode],
      set: {
        cursor,
        workerId: params.workerId,
        leaseExpiresAt,
        updatedAt: now,
      },
    });
}

async function processSeedTask(_task: QueuedTask): Promise<void> {
  await seedFetchTasks();
}

async function processFetchTask(task: QueuedTask): Promise<void> {
  const payload = (task.payload ?? {}) as FetchTaskPayload;
  const url = payload.url ? normalizePublicHttpsUrl(payload.url) : null;
  if (!url) throw new Error("invalid_fetch_url");
  const domain = getDomainFromUrl(url);
  if (!domain) throw new Error("invalid_domain");

  const allow = await shouldAllowDomainFetch(domain);
  if (!allow.allow) {
    throw new Error(allow.reason ?? "blocked_by_policy");
  }

  try {
    const page = await fetchAndExtractPublicPage(url);
    if (!page) {
      throw new Error("fetch_null");
    }

    await recordDomainSuccess(domain);

    const extractTaskKey = toTaskKey("extract", `${page.url}:${sha256Hex(page.plainText).slice(0, 16)}`);
    await enqueueTasks([
      {
        taskType: "extract",
        taskKey: extractTaskKey,
        payload: {
          url: page.url,
          source: payload.source ?? "WEB",
          sourceId: payload.sourceId ?? page.url,
          title: page.title,
          plainText: page.plainText,
          links: page.links,
        },
        priority: task.priority,
      },
    ]);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordDomainFailure({
      domain,
      error,
      timedOut: error.includes("timeout") || error.includes("abort"),
    });
    throw err;
  }
}

async function processExtractTask(task: QueuedTask): Promise<void> {
  const payload = (task.payload ?? {}) as ExtractTaskPayload;
  const url = payload.url ? normalizePublicHttpsUrl(payload.url) : null;
  if (!url) throw new Error("invalid_extract_url");
  const domain = getDomainFromUrl(url);
  if (!domain) throw new Error("invalid_extract_domain");
  const plainText = (payload.plainText ?? "").trim();
  if (plainText.length < 40) throw new Error("extract_text_too_short");

  const docs = buildChunkDocuments({
    source: payload.source ?? "WEB",
    sourceId: payload.sourceId ?? url,
    canonicalUrl: url,
    domain,
    title: payload.title ?? null,
    plainText,
    isPublic: true,
  });

  const batches = splitIntoBatches(docs, 16);
  const tasksToEnqueue: TaskEnqueueInput[] = batches.map((batch, idx) => ({
    taskType: "index",
    taskKey: toTaskKey("index", `${url}:${idx}:${batch.length}`),
    payload: { docs: batch },
    priority: task.priority,
  }));

  const discoverLinks = (payload.links ?? [])
    .map((link) => normalizePublicHttpsUrl(link, url))
    .filter((v): v is string => Boolean(v))
    .slice(0, 20);
  for (const link of discoverLinks) {
    tasksToEnqueue.push({
      taskType: "fetch",
      taskKey: toTaskKey("fetch", link),
      payload: {
        url: link,
        source: payload.source ?? "WEB",
        sourceId: payload.sourceId ?? url,
        parentUrl: url,
      },
      priority: Math.max(1, task.priority - 5),
    });
  }

  await enqueueTasks(tasksToEnqueue);
}

async function processIndexTask(task: QueuedTask): Promise<void> {
  const payload = (task.payload ?? {}) as IndexTaskPayload;
  const docs = payload.docs ?? [];
  if (docs.length === 0) return;
  await upsertSearchDocuments(docs);
}

async function processTask(task: QueuedTask): Promise<void> {
  if (task.taskType === "seed") return processSeedTask(task);
  if (task.taskType === "fetch") return processFetchTask(task);
  if (task.taskType === "extract") return processExtractTask(task);
  if (task.taskType === "index") return processIndexTask(task);
  throw new Error(`unknown_task_type:${task.taskType}`);
}

export async function runTaskWorkerLoop(options: WorkerOptions): Promise<void> {
  const concurrency = options.concurrency ?? 8;
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const leaseMs = options.leaseMs ?? 60_000;
  const checkpointEvery = Math.max(
    50,
    Number(process.env.CRAWL_TASK_CHECKPOINT_EVERY ?? "200")
  );
  const heartbeatEveryMs = Math.max(
    5_000,
    Number(process.env.CRAWL_TASK_HEARTBEAT_MS ?? "20000")
  );
  const checkpointMode = checkpointModeForTaskTypes(options.taskTypes);
  let iteration = 0;
  let processedTotal = 0;
  let failedTotal = 0;
  let lastTaskAt: number | null = null;
  let lastCheckpointAt = 0;

  const maybeWriteCheckpoint = async (force = false) => {
    const now = Date.now();
    const timedOut = now - lastCheckpointAt >= heartbeatEveryMs;
    const reachedBatch = processedTotal > 0 && processedTotal % checkpointEvery === 0;
    if (!force && !timedOut && !reachedBatch) return;

    try {
      await writePipelineCheckpoint({
        mode: checkpointMode,
        workerId: options.workerId,
        taskTypes: options.taskTypes,
        processedTotal,
        failedTotal,
        lastTaskAt,
        leaseMs,
      });
      lastCheckpointAt = now;
    } catch (err) {
      console.error(
        "[CRAWL_TASK_WORKER] checkpoint_error",
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  await maybeWriteCheckpoint(true);

  while (true) {
    iteration += 1;
    if (iteration % 30 === 0) {
      await reapStaleLeasedTasks(5 * 60_000);
      await maybeWriteCheckpoint(true);
    }

    const leased = await leaseTasks({
      taskTypes: options.taskTypes,
      limit: Math.max(1, concurrency),
      leaseOwner: options.workerId,
      leaseMs,
    });

    if (leased.length === 0) {
      await maybeWriteCheckpoint();
      await sleep(pollIntervalMs);
      continue;
    }

    await Promise.all(
      leased.map(async (task) => {
        try {
          await processTask(task);
          await completeTask(task.id);
          processedTotal += 1;
          lastTaskAt = Date.now();
        } catch (err) {
          processedTotal += 1;
          failedTotal += 1;
          lastTaskAt = Date.now();
          const message = err instanceof Error ? err.message : String(err);
          if (
            message.includes("blocked") ||
            message.includes("domain_rate_limited") ||
            message.includes("domain_cooldown")
          ) {
            await retryTask(task.id, message, 30_000, { ignoreAttemptLimit: true });
            return;
          }
          if (task.attempts >= task.maxAttempts) {
            await failTask(task.id, message);
            return;
          }
          await retryTask(task.id, message, retryDelayMs(task.attempts));
        }
      })
    );

    await maybeWriteCheckpoint();
  }
}
