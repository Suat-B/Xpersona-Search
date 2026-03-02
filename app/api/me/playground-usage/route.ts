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
import { playgroundSubscriptions } from "@/lib/db/playground-schema";
import { eq } from "drizzle-orm";

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
  nextResetAt: string; // ISO string of next midnight UTC
}

/**
 * Calculate next midnight UTC for daily reset
 */
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
    // Get usage stats
    const stats = await getUserUsageStats(user.id);
    
    // Get subscription details
    const subscription = await db
      .select({
        planTier: playgroundSubscriptions.planTier,
        status: playgroundSubscriptions.status,
        trialEndsAt: playgroundSubscriptions.trialEndsAt,
        currentPeriodEnd: playgroundSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: playgroundSubscriptions.cancelAtPeriodEnd,
      })
      .from(playgroundSubscriptions)
      .where(eq(playgroundSubscriptions.userId, user.id))
      .limit(1);

    const sub = subscription[0];
    
    // Build response
    const response: PlaygroundUsageResponse = {
      plan: sub?.planTier as PlaygroundPlan || null,
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
      nextResetAt: getNextResetAt(),
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Error fetching playground usage stats:", error);
    return NextResponse.json(
      { error: "Internal server error", message: "Failed to fetch usage stats" },
      { status: 500 }
    );
  }
}
