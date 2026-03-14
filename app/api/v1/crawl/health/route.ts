import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  crawlTasks,
  crawlDomainPolicies,
  crawlDomainStats,
  crawlJobs,
  crawlCheckpoints,
} from "@/lib/db/schema";
import { getQueueStats, reapStaleLeasedTasks } from "@/lib/search/crawl-pipeline/queue";
import { isAuthorizedCrawlRequest } from "@/lib/search/crawl-pipeline/http";

type RowRecord = Record<string, unknown>;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCrawlRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    taskBacklog,
    recentTaskThroughput,
    leaseState,
    staleLeased,
    staleJobs,
    blockedDomains,
    coolingDomains,
    workerCheckpoints,
  ] =
    await Promise.all([
      getQueueStats(),
      db.execute(sql`
        SELECT task_type, COUNT(*)::int AS done_24h
        FROM crawl_tasks
        WHERE status = 'DONE' AND updated_at >= now() - interval '24 hours'
        GROUP BY task_type
        ORDER BY done_24h DESC
      `),
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'LEASED' AND lease_expires_at > now())::int AS active_leases,
          COUNT(*) FILTER (WHERE status = 'LEASED' AND lease_expires_at <= now())::int AS stale_leases
        FROM crawl_tasks
      `),
      reapStaleLeasedTasks(5 * 60_000),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM crawl_jobs
        WHERE status = 'RUNNING'
          AND COALESCE(heartbeat_at, started_at, created_at) < now() - interval '30 minutes'
      `),
      db
        .select({
          domain: crawlDomainPolicies.domain,
          reason: crawlDomainPolicies.reason,
          updatedAt: crawlDomainPolicies.updatedAt,
        })
        .from(crawlDomainPolicies)
        .where(sql`${crawlDomainPolicies.mode} = 'BLOCK'`)
        .limit(50),
      db
        .select({
          domain: crawlDomainPolicies.domain,
          cooldownUntil: crawlDomainPolicies.cooldownUntil,
        })
        .from(crawlDomainPolicies)
        .where(sql`${crawlDomainPolicies.cooldownUntil} IS NOT NULL AND ${crawlDomainPolicies.cooldownUntil} > now()`)
        .limit(50),
      db
        .select({
          mode: crawlCheckpoints.mode,
          workerId: crawlCheckpoints.workerId,
          leaseExpiresAt: crawlCheckpoints.leaseExpiresAt,
          updatedAt: crawlCheckpoints.updatedAt,
          cursor: crawlCheckpoints.cursor,
        })
        .from(crawlCheckpoints)
        .where(sql`${crawlCheckpoints.source} = 'TASK_PIPELINE'`)
        .limit(50),
    ]);

  const topDomainFailures = await db.execute(sql`
    SELECT domain, fail_count, timeout_count, last_status, updated_at
    FROM crawl_domain_stats
    ORDER BY fail_count DESC, timeout_count DESC
    LIMIT 25
  `);

  const queueDepth = await db.execute(sql`
    SELECT status, COUNT(*)::int AS count
    FROM crawl_tasks
    GROUP BY status
  `);

  const leaseRow =
    ((leaseState as unknown as { rows?: Array<{ active_leases?: number; stale_leases?: number }> })
      .rows?.[0] ?? {}) || {};
  const nowMs = Date.now();
  const workerLeaseState = workerCheckpoints.map((row) => {
    const leaseAt = row.leaseExpiresAt?.getTime() ?? 0;
    return {
      mode: row.mode,
      workerId: row.workerId,
      leaseExpiresAt: row.leaseExpiresAt,
      updatedAt: row.updatedAt,
      stale: leaseAt > 0 ? leaseAt <= nowMs : true,
      cursor: row.cursor,
    };
  });
  const staleWorkerLeases = workerLeaseState.filter((row) => row.stale).length;

  const response = {
    queue: {
      byTypeStatus: taskBacklog,
      byStatus: (queueDepth as unknown as { rows?: RowRecord[] }).rows ?? [],
      completed24h: (recentTaskThroughput as unknown as { rows?: RowRecord[] }).rows ?? [],
      leases: {
        active: Number(leaseRow.active_leases ?? 0),
        stale: Number(leaseRow.stale_leases ?? 0),
      },
      staleLeasesReaped: staleLeased,
    },
    jobs: {
      staleRunning:
        ((staleJobs as unknown as { rows?: Array<{ count: number }> }).rows?.[0]?.count as number) ??
        0,
    },
    workers: {
      checkpoints: workerLeaseState,
      staleLeases: staleWorkerLeases,
    },
    domains: {
      blocked: blockedDomains,
      cooling: coolingDomains,
      topFailures: (topDomainFailures as unknown as { rows?: RowRecord[] }).rows ?? [],
    },
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
