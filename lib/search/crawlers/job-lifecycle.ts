import { db } from "@/lib/db";
import { crawlCheckpoints, crawlJobs } from "@/lib/db/schema";
import { and, eq, lte, sql } from "drizzle-orm";

export interface StartJobInput {
  source: string;
  mode?: string;
  workerId?: string;
}

export interface JobMetricsPatch {
  agentsFound?: number;
  agentsUpdated?: number;
  budgetUsed?: number;
  skipped?: number;
  timeouts?: number;
  rateLimits?: number;
  githubRequests?: number;
  retryCount?: number;
  rateLimitWaitMs?: number;
  cursorSnapshot?: Record<string, unknown> | null;
}

export interface CheckpointPayload {
  jobId: string;
  source: string;
  mode: string;
  cursor: Record<string, unknown>;
  workerId?: string;
  leaseMs?: number;
}

function withHeartbeat<T extends Record<string, unknown>>(patch: T): T & { heartbeatAt: Date } {
  return { ...patch, heartbeatAt: new Date() };
}

export async function startJob(input: StartJobInput): Promise<{ jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: input.source,
      status: "RUNNING",
      workerId: input.workerId ?? null,
      startedAt: new Date(),
      heartbeatAt: new Date(),
      finishedReason: null,
    })
    .returning({ id: crawlJobs.id });

  return { jobId: job?.id ?? crypto.randomUUID() };
}

export async function heartbeatJob(
  jobId: string,
  patch?: JobMetricsPatch
): Promise<void> {
  await db
    .update(crawlJobs)
    .set(
      withHeartbeat({
        ...(patch?.agentsFound != null ? { agentsFound: patch.agentsFound } : {}),
        ...(patch?.agentsUpdated != null ? { agentsUpdated: patch.agentsUpdated } : {}),
        ...(patch?.budgetUsed != null ? { budgetUsed: patch.budgetUsed } : {}),
        ...(patch?.skipped != null ? { skipped: patch.skipped } : {}),
        ...(patch?.timeouts != null ? { timeouts: patch.timeouts } : {}),
        ...(patch?.rateLimits != null ? { rateLimits: patch.rateLimits } : {}),
        ...(patch?.githubRequests != null ? { githubRequests: patch.githubRequests } : {}),
        ...(patch?.retryCount != null ? { retryCount: patch.retryCount } : {}),
        ...(patch?.rateLimitWaitMs != null ? { rateLimitWaitMs: patch.rateLimitWaitMs } : {}),
        ...(patch?.cursorSnapshot !== undefined ? { cursorSnapshot: patch.cursorSnapshot } : {}),
      })
    )
    .where(eq(crawlJobs.id, jobId));
}

export async function checkpointJob(payload: CheckpointPayload): Promise<void> {
  const now = new Date();
  const leaseExpiresAt = payload.leaseMs
    ? new Date(now.getTime() + payload.leaseMs)
    : null;

  await db
    .insert(crawlCheckpoints)
    .values({
      source: payload.source,
      mode: payload.mode,
      cursor: payload.cursor,
      workerId: payload.workerId ?? null,
      leaseExpiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [crawlCheckpoints.source, crawlCheckpoints.mode],
      set: {
        cursor: payload.cursor,
        workerId: payload.workerId ?? null,
        leaseExpiresAt,
        updatedAt: now,
      },
    });

  await heartbeatJob(payload.jobId, { cursorSnapshot: payload.cursor });
}

export async function getCheckpoint(
  source: string,
  mode: string
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ cursor: crawlCheckpoints.cursor })
    .from(crawlCheckpoints)
    .where(and(eq(crawlCheckpoints.source, source), eq(crawlCheckpoints.mode, mode)))
    .limit(1);
  return row?.cursor ?? null;
}

export async function clearCheckpoint(source: string, mode: string): Promise<void> {
  await db
    .delete(crawlCheckpoints)
    .where(and(eq(crawlCheckpoints.source, source), eq(crawlCheckpoints.mode, mode)));
}

export async function completeJob(
  jobId: string,
  patch?: JobMetricsPatch & { finishedReason?: string | null }
): Promise<void> {
  await db
    .update(crawlJobs)
    .set({
      status: "COMPLETED",
      completedAt: new Date(),
      heartbeatAt: new Date(),
      finishedReason: patch?.finishedReason ?? "completed",
      ...(patch?.agentsFound != null ? { agentsFound: patch.agentsFound } : {}),
      ...(patch?.agentsUpdated != null ? { agentsUpdated: patch.agentsUpdated } : {}),
      ...(patch?.budgetUsed != null ? { budgetUsed: patch.budgetUsed } : {}),
      ...(patch?.skipped != null ? { skipped: patch.skipped } : {}),
      ...(patch?.timeouts != null ? { timeouts: patch.timeouts } : {}),
      ...(patch?.rateLimits != null ? { rateLimits: patch.rateLimits } : {}),
      ...(patch?.githubRequests != null ? { githubRequests: patch.githubRequests } : {}),
      ...(patch?.retryCount != null ? { retryCount: patch.retryCount } : {}),
      ...(patch?.rateLimitWaitMs != null ? { rateLimitWaitMs: patch.rateLimitWaitMs } : {}),
      ...(patch?.cursorSnapshot !== undefined ? { cursorSnapshot: patch.cursorSnapshot } : {}),
    })
    .where(eq(crawlJobs.id, jobId));
}

export async function failJob(
  jobId: string,
  error: unknown,
  patch?: JobMetricsPatch & { finishedReason?: string | null }
): Promise<void> {
  await db
    .update(crawlJobs)
    .set({
      status: "FAILED",
      completedAt: new Date(),
      heartbeatAt: new Date(),
      finishedReason: patch?.finishedReason ?? "failed",
      error: error instanceof Error ? error.message : String(error),
      ...(patch?.agentsFound != null ? { agentsFound: patch.agentsFound } : {}),
      ...(patch?.agentsUpdated != null ? { agentsUpdated: patch.agentsUpdated } : {}),
      ...(patch?.budgetUsed != null ? { budgetUsed: patch.budgetUsed } : {}),
      ...(patch?.skipped != null ? { skipped: patch.skipped } : {}),
      ...(patch?.timeouts != null ? { timeouts: patch.timeouts } : {}),
      ...(patch?.rateLimits != null ? { rateLimits: patch.rateLimits } : {}),
      ...(patch?.githubRequests != null ? { githubRequests: patch.githubRequests } : {}),
      ...(patch?.retryCount != null ? { retryCount: patch.retryCount } : {}),
      ...(patch?.rateLimitWaitMs != null ? { rateLimitWaitMs: patch.rateLimitWaitMs } : {}),
      ...(patch?.cursorSnapshot !== undefined ? { cursorSnapshot: patch.cursorSnapshot } : {}),
    })
    .where(eq(crawlJobs.id, jobId));
}

export async function reapStaleJobs(params?: {
  staleMs?: number;
  workerId?: string;
}): Promise<number> {
  const staleMs = params?.staleMs ?? 30 * 60 * 1000;
  const cutoff = new Date(Date.now() - staleMs);

  const result = await db.execute(
    sql`
      UPDATE crawl_jobs
      SET
        status = 'FAILED',
        completed_at = now(),
        heartbeat_at = now(),
        finished_reason = 'stale_reaped',
        error = COALESCE(NULLIF(error, ''), 'Job stale heartbeat timeout')
      WHERE status = 'RUNNING'
        AND COALESCE(heartbeat_at, started_at, created_at) <= ${cutoff}
        ${params?.workerId ? sql`AND (worker_id IS NULL OR worker_id = ${params.workerId})` : sql``}
    `
  );

  const rowCount =
    (result as unknown as { rowCount?: number }).rowCount ?? 0;
  return rowCount;
}

export function toJobMetricsFromGithubContext(ctx: {
  requests: number;
  retries: number;
  rateLimitWaitMs: number;
  rateLimits: number;
  timeouts: number;
}): Pick<JobMetricsPatch, "githubRequests" | "retryCount" | "rateLimitWaitMs" | "rateLimits" | "timeouts"> {
  return {
    githubRequests: ctx.requests,
    retryCount: ctx.retries,
    rateLimitWaitMs: ctx.rateLimitWaitMs,
    rateLimits: ctx.rateLimits,
    timeouts: ctx.timeouts,
  };
}
