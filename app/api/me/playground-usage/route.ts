/**
 * HuggingFace Router - Dashboard Usage Stats API
 * 
 * GET /api/me/playground-usage
 * 
 * Returns current usage statistics for the authenticated user.
 * Uses session-based authentication for the dashboard UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getUserUsageStats, PLAN_LIMITS, type PlaygroundPlan } from "@/lib/hf-router/rate-limit";
import { db } from "@/lib/db";
import { hfUsageLogs, playgroundSubscriptions } from "@/lib/db/playground-schema";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

export interface PlaygroundUsageResponse {
  plan: PlaygroundPlan | null;
  status: "active" | "trial" | "cancelled" | "past_due" | "inactive";
  trial: {
    endsAt: string;
    isActive: boolean;
  } | null;
  billing: {
    currentPeriodEndsAt: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  limits: {
    contextCap: number;
    maxOutputTokens: number;
    maxRequestsPerDay: number;
    maxOutputTokensPerMonth: number;
  } | null;
  today: {
    requestsUsed: number;
    requestsRemaining: number;
    requestsLimit: number;
  };
  thisMonth: {
    tokensOutput: number;
    tokensRemaining: number;
    tokensLimit: number;
    estimatedCostUsd: number;
  };
  cycle: {
    requestsUsed: number;
    requestsRemaining: number;
    requestsLimit: number;
    tokensOutput: number;
    tokensRemaining: number;
    tokensLimit: number;
    estimatedCostUsd: number;
    startsAt: string;
    endsAt: string;
  };
  last24h: {
    requests: number;
    tokensOutput: number;
    estimatedCostUsd: number;
    successRate: number;
    avgLatencyMs: number | null;
  };
  statusBreakdown: {
    success: number;
    error: number;
    rateLimited: number;
    quotaExceeded: number;
    validationError: number;
  };
  topModels: Array<{
    model: string;
    requests: number;
    tokensOutput: number;
  }>;
  cycleTopModels: Array<{
    model: string;
    requests: number;
    tokensOutput: number;
  }>;
  recentRequests: Array<{
    id: string;
    createdAt: string;
    model: string;
    provider: string;
    status: "success" | "error" | "rate_limited" | "quota_exceeded" | "validation_error";
    tokensInput: number;
    tokensOutput: number;
    latencyMs: number | null;
    estimatedCostUsd: number | null;
    errorMessage: string | null;
  }>;
  nextResetAt: string; // ISO string of next midnight UTC
}

function buildEmptyUsageResponse(): PlaygroundUsageResponse {
  return {
    plan: null,
    status: "inactive",
    trial: null,
    billing: null,
    limits: null,
    today: {
      requestsUsed: 0,
      requestsRemaining: 0,
      requestsLimit: 0,
    },
    thisMonth: {
      tokensOutput: 0,
      tokensRemaining: 0,
      tokensLimit: 0,
      estimatedCostUsd: 0,
    },
    last24h: {
      requests: 0,
      tokensOutput: 0,
      estimatedCostUsd: 0,
      successRate: 0,
      avgLatencyMs: null,
    },
    cycle: {
      requestsUsed: 0,
      requestsRemaining: 0,
      requestsLimit: 0,
      tokensOutput: 0,
      tokensRemaining: 0,
      tokensLimit: 0,
      estimatedCostUsd: 0,
      startsAt: new Date().toISOString(),
      endsAt: getNextFiveHourResetAt(),
    },
    statusBreakdown: {
      success: 0,
      error: 0,
      rateLimited: 0,
      quotaExceeded: 0,
      validationError: 0,
    },
    topModels: [],
    cycleTopModels: [],
    recentRequests: [],
    nextResetAt: getNextFiveHourResetAt(),
  };
}

/**
 * Calculate current 5-hour UTC window and its end
 */
function getCurrentFiveHourWindow(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  const currentUtcHour = start.getUTCHours();
  const blockStartHour = Math.floor(currentUtcHour / 5) * 5;
  start.setUTCHours(blockStartHour, 0, 0, 0);

  const end = new Date(start);
  end.setUTCHours(end.getUTCHours() + 5);

  return { start, end };
}

function getNextFiveHourResetAt(now = new Date()): string {
  const { end } = getCurrentFiveHourWindow(now);
  return end.toISOString();
}

function getNextResetAt(): string {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return tomorrow.toISOString();
}

/**
 * GET handler for usage stats
 */
export async function GET(request: NextRequest): Promise<Response> {
  // Authenticate using session
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Please sign in to view usage stats" },
      { status: 401 }
    );
  }

  const { user } = authResult;

  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const cycleWindow = getCurrentFiveHourWindow(now);

    // Get usage stats
    const stats = await getUserUsageStats(user.id);

    const [subscription, recentRequestsRaw, statusRows, topModelRows, cycleTopModelRows, last24hRows, cycleRows] = await Promise.all([
      db
        .select({
          planTier: playgroundSubscriptions.planTier,
          status: playgroundSubscriptions.status,
          trialEndsAt: playgroundSubscriptions.trialEndsAt,
          currentPeriodEnd: playgroundSubscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: playgroundSubscriptions.cancelAtPeriodEnd,
        })
        .from(playgroundSubscriptions)
        .where(eq(playgroundSubscriptions.userId, user.id))
        .limit(1),
      db
        .select({
          id: hfUsageLogs.id,
          createdAt: hfUsageLogs.createdAt,
          model: hfUsageLogs.model,
          provider: hfUsageLogs.provider,
          status: hfUsageLogs.status,
          tokensInput: hfUsageLogs.tokensInput,
          tokensOutput: hfUsageLogs.tokensOutput,
          latencyMs: hfUsageLogs.latencyMs,
          estimatedCostUsd: hfUsageLogs.estimatedCostUsd,
          errorMessage: hfUsageLogs.errorMessage,
        })
        .from(hfUsageLogs)
        .where(eq(hfUsageLogs.userId, user.id))
        .orderBy(desc(hfUsageLogs.createdAt))
        .limit(12),
      db
        .select({
          status: hfUsageLogs.status,
          count: sql<number>`count(*)`,
        })
        .from(hfUsageLogs)
        .where(eq(hfUsageLogs.userId, user.id))
        .groupBy(hfUsageLogs.status),
      db
        .select({
          model: hfUsageLogs.model,
          requests: sql<number>`count(*)`,
          tokensOutput: sql<number>`coalesce(sum(${hfUsageLogs.tokensOutput}), 0)`,
        })
        .from(hfUsageLogs)
        .where(and(eq(hfUsageLogs.userId, user.id), gte(hfUsageLogs.createdAt, monthStart)))
        .groupBy(hfUsageLogs.model)
        .orderBy(desc(sql`count(*)`))
        .limit(6),
      db
        .select({
          model: hfUsageLogs.model,
          requests: sql<number>`count(*)`,
          tokensOutput: sql<number>`coalesce(sum(${hfUsageLogs.tokensOutput}), 0)`,
        })
        .from(hfUsageLogs)
        .where(
          and(
            eq(hfUsageLogs.userId, user.id),
            gte(hfUsageLogs.createdAt, cycleWindow.start),
            lt(hfUsageLogs.createdAt, cycleWindow.end)
          )
        )
        .groupBy(hfUsageLogs.model)
        .orderBy(desc(sql`count(*)`))
        .limit(6),
      db
        .select({
          requests: sql<number>`count(*)`,
          tokensOutput: sql<number>`coalesce(sum(${hfUsageLogs.tokensOutput}), 0)`,
          estimatedCostUsd: sql<number>`coalesce(sum(${hfUsageLogs.estimatedCostUsd}), 0)`,
          avgLatencyMs: sql<number | null>`avg(${hfUsageLogs.latencyMs})`,
          successCount: sql<number>`coalesce(sum(case when ${hfUsageLogs.status} = 'success' then 1 else 0 end), 0)`,
        })
        .from(hfUsageLogs)
        .where(and(eq(hfUsageLogs.userId, user.id), gte(hfUsageLogs.createdAt, since24h))),
      db
        .select({
          requests: sql<number>`count(*)`,
          tokensOutput: sql<number>`coalesce(sum(${hfUsageLogs.tokensOutput}), 0)`,
          estimatedCostUsd: sql<number>`coalesce(sum(${hfUsageLogs.estimatedCostUsd}), 0)`,
        })
        .from(hfUsageLogs)
        .where(
          and(
            eq(hfUsageLogs.userId, user.id),
            gte(hfUsageLogs.createdAt, cycleWindow.start),
            lt(hfUsageLogs.createdAt, cycleWindow.end)
          )
        ),
    ]);

    const sub = subscription[0];
    const last24h = last24hRows[0];
    const cycle = cycleRows[0];
    const requestsLimit = stats?.today.requestsLimit || 30;
    const tokensLimit = stats?.thisMonth.tokensLimit || 50000;
    const cycleRequestsUsed = Number(cycle?.requests ?? 0);
    const cycleTokensUsed = Number(cycle?.tokensOutput ?? 0);
    const statusBreakdown = {
      success: 0,
      error: 0,
      rateLimited: 0,
      quotaExceeded: 0,
      validationError: 0,
    };
    for (const row of statusRows) {
      const count = Number(row.count ?? 0);
      if (row.status === "success") statusBreakdown.success = count;
      if (row.status === "error") statusBreakdown.error = count;
      if (row.status === "rate_limited") statusBreakdown.rateLimited = count;
      if (row.status === "quota_exceeded") statusBreakdown.quotaExceeded = count;
      if (row.status === "validation_error") statusBreakdown.validationError = count;
    }

    // Build response
    const response: PlaygroundUsageResponse = {
      plan: (sub?.planTier as PlaygroundPlan) || null,
      status: sub?.status || "inactive",
      trial: sub?.trialEndsAt ? {
        endsAt: sub.trialEndsAt.toISOString(),
        isActive: new Date() < sub.trialEndsAt,
      } : null,
      billing: sub?.currentPeriodEnd ? {
        currentPeriodEndsAt: sub.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd || false,
      } : null,
      limits: sub ? PLAN_LIMITS[sub.planTier as PlaygroundPlan] : null,
      today: {
        requestsUsed: stats?.today.requestsUsed || 0,
        requestsRemaining: stats 
          ? Math.max(0, PLAN_LIMITS[stats.plan].maxRequestsPerDay - stats.today.requestsUsed)
          : 0,
        requestsLimit: stats?.today.requestsLimit || 30,
      },
      thisMonth: {
        tokensOutput: stats?.thisMonth.tokensOutput || 0,
        tokensRemaining: stats
          ? Math.max(0, PLAN_LIMITS[stats.plan].maxOutputTokensPerMonth - stats.thisMonth.tokensOutput)
          : 0,
        tokensLimit: stats?.thisMonth.tokensLimit || 50000,
        estimatedCostUsd: stats?.thisMonth.estimatedCost || 0,
      },
      cycle: {
        requestsUsed: cycleRequestsUsed,
        requestsRemaining: Math.max(0, requestsLimit - cycleRequestsUsed),
        requestsLimit,
        tokensOutput: cycleTokensUsed,
        tokensRemaining: Math.max(0, tokensLimit - cycleTokensUsed),
        tokensLimit,
        estimatedCostUsd: Number(cycle?.estimatedCostUsd ?? 0),
        startsAt: cycleWindow.start.toISOString(),
        endsAt: cycleWindow.end.toISOString(),
      },
      last24h: {
        requests: Number(last24h?.requests ?? 0),
        tokensOutput: Number(last24h?.tokensOutput ?? 0),
        estimatedCostUsd: Number(last24h?.estimatedCostUsd ?? 0),
        successRate:
          Number(last24h?.requests ?? 0) > 0
            ? Number(last24h?.successCount ?? 0) / Number(last24h?.requests ?? 1)
            : 0,
        avgLatencyMs: last24h?.avgLatencyMs == null ? null : Number(last24h.avgLatencyMs),
      },
      statusBreakdown,
      topModels: topModelRows.map((row) => ({
        model: row.model,
        requests: Number(row.requests ?? 0),
        tokensOutput: Number(row.tokensOutput ?? 0),
      })),
      cycleTopModels: cycleTopModelRows.map((row) => ({
        model: row.model,
        requests: Number(row.requests ?? 0),
        tokensOutput: Number(row.tokensOutput ?? 0),
      })),
      recentRequests: recentRequestsRaw.map((row) => ({
        id: row.id,
        createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
        model: row.model,
        provider: row.provider,
        status: row.status,
        tokensInput: row.tokensInput ?? 0,
        tokensOutput: row.tokensOutput ?? 0,
        latencyMs: row.latencyMs ?? null,
        estimatedCostUsd: row.estimatedCostUsd ?? null,
        errorMessage: row.errorMessage ?? null,
      })),
      nextResetAt: cycleWindow.end.toISOString(),
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Error fetching playground usage stats:", error);
    return NextResponse.json(buildEmptyUsageResponse());
  }
}
