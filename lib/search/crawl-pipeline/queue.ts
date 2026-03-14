import { db } from "@/lib/db";
import { crawlTasks } from "@/lib/db/schema";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { CrawlTaskType, QueuedTask, TaskEnqueueInput } from "./types";

function nowPlus(ms: number): Date {
  return new Date(Date.now() + ms);
}

function sanitizeJsonValue(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.replace(/\u0000/g, " ");
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "undefined" || typeof v === "function" || typeof v === "symbol") {
        continue;
      }
      out[k] = sanitizeJsonValue(v);
    }
    return out;
  }
  return String(value);
}

export async function enqueueTasks(inputs: TaskEnqueueInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const rows = inputs.map((input) => ({
    taskType: input.taskType,
    taskKey: input.taskKey,
    payloadJson: sanitizeJsonValue(input.payload) as Record<string, unknown>,
    status: "PENDING" as const,
    priority: input.priority ?? 0,
    nextAttemptAt: input.nextAttemptAt ?? new Date(),
    updatedAt: new Date(),
  }));
  const result = await db
    .insert(crawlTasks)
    .values(rows)
    .onConflictDoNothing({ target: crawlTasks.taskKey })
    .returning({ id: crawlTasks.id });
  return result.length;
}

export async function leaseTasks(params: {
  taskTypes?: CrawlTaskType[];
  limit: number;
  leaseOwner: string;
  leaseMs?: number;
}): Promise<QueuedTask[]> {
  const taskTypes = params.taskTypes ?? [];
  const leaseMs = params.leaseMs ?? 60_000;
  const leasedUntil = nowPlus(leaseMs);

  return db.transaction(async (tx) => {
    const typeCondition =
      taskTypes.length > 0
        ? sql`AND task_type = ANY(ARRAY[${sql.join(
            taskTypes.map((t) => sql`${t}`),
            sql`, `
          )}]::text[])`
        : sql``;

    const selected = await tx.execute(sql`
      SELECT id, task_type, task_key, payload_json, attempts, max_attempts, priority
      FROM crawl_tasks
      WHERE status = 'PENDING'
        AND next_attempt_at <= now()
        ${typeCondition}
      ORDER BY priority DESC, next_attempt_at ASC
      LIMIT ${params.limit}
      FOR UPDATE SKIP LOCKED
    `);
    const rows =
      (selected as unknown as {
        rows?: Array<{
          id: string;
          task_type: CrawlTaskType;
          task_key: string;
          payload_json: Record<string, unknown>;
          attempts: number;
          max_attempts: number;
          priority: number;
        }>;
      }).rows ?? [];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    await tx
      .update(crawlTasks)
      .set({
        status: "LEASED",
        leaseOwner: params.leaseOwner,
        leaseExpiresAt: leasedUntil,
        attempts: sql`${crawlTasks.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(inArray(crawlTasks.id, ids));

    return rows.map((r) => ({
      id: r.id,
      taskType: r.task_type,
      taskKey: r.task_key,
      payload: (r.payload_json ?? {}) as Record<string, unknown>,
      attempts: Number(r.attempts ?? 0) + 1,
      maxAttempts: Number(r.max_attempts ?? 6),
      priority: Number(r.priority ?? 0),
    }));
  });
}

export async function completeTask(taskId: string): Promise<void> {
  await db
    .update(crawlTasks)
    .set({
      status: "DONE",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(crawlTasks.id, taskId));
}

export async function retryTask(
  taskId: string,
  error: string,
  delayMs: number,
  options?: { ignoreAttemptLimit?: boolean }
): Promise<void> {
  const [row] = await db
    .select({
      attempts: crawlTasks.attempts,
      maxAttempts: crawlTasks.maxAttempts,
    })
    .from(crawlTasks)
    .where(eq(crawlTasks.id, taskId))
    .limit(1);

  const attempts = Number(row?.attempts ?? 0);
  const maxAttempts = Number(row?.maxAttempts ?? 6);
  const shouldFail = options?.ignoreAttemptLimit ? false : attempts >= maxAttempts;

  await db
    .update(crawlTasks)
    .set({
      status: shouldFail ? "FAILED" : "PENDING",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: error.slice(0, 2000),
      nextAttemptAt: shouldFail ? new Date() : nowPlus(Math.max(1_000, delayMs)),
      updatedAt: new Date(),
    })
    .where(eq(crawlTasks.id, taskId));
}

export async function failTask(taskId: string, error: string): Promise<void> {
  await db
    .update(crawlTasks)
    .set({
      status: "FAILED",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: error.slice(0, 2000),
      updatedAt: new Date(),
    })
    .where(eq(crawlTasks.id, taskId));
}

export async function reapStaleLeasedTasks(staleMs = 5 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  const result = await db
    .update(crawlTasks)
    .set({
      status: "PENDING",
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(crawlTasks.status, "LEASED"),
        lte(crawlTasks.leaseExpiresAt, cutoff)
      )
    )
    .returning({ id: crawlTasks.id });
  return result.length;
}

export async function getQueueStats(): Promise<
  Array<{ taskType: string; status: string; count: number }>
> {
  const result = await db.execute(sql`
    SELECT task_type, status, COUNT(*)::int AS count
    FROM crawl_tasks
    GROUP BY task_type, status
    ORDER BY task_type, status
  `);
  const rows =
    (result as unknown as {
      rows?: Array<{ task_type: string; status: string; count: number }>;
    }).rows ?? [];
  return rows.map((row) => ({
    taskType: row.task_type,
    status: row.status,
    count: Number(row.count ?? 0),
  }));
}
