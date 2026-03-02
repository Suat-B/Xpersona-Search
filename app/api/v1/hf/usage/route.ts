/**
 * HuggingFace Router - Usage Stats API
 * 
 * GET /api/v1/hf/usage
 * 
 * Returns current usage statistics for the authenticated user.
 * 
 * Authentication: X-API-Key header with user's Xpersona API key
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { playgroundSubscriptions } from "@/lib/db/playground-schema";
import { eq } from "drizzle-orm";
import { getUserUsageStats, PLAN_LIMITS, type PlaygroundPlan } from "@/lib/hf-router/rate-limit";

/**
 * Authenticate request using X-API-Key header
 */
async function authenticateRequest(request: NextRequest): Promise<string | null> {
  const apiKey = request.headers.get("X-API-Key") || request.headers.get("Authorization")?.replace("Bearer ", "");
  
  if (!apiKey) {
    return null;
  }

  // Hash the API key to look it up
  const crypto = require("crypto");
  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  
  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.apiKeyHash, apiKeyHash))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0].id;
}

/**
 * GET handler for usage stats
 */
export async function GET(request: NextRequest): Promise<Response> {
  // Authenticate
  const userId = await authenticateRequest(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  try {
    // Get usage stats
    const stats = await getUserUsageStats(userId);
    
    if (!stats) {
      return NextResponse.json(
        { 
          error: "No subscription found",
          message: "You don't have an active playground subscription. Visit /playground to subscribe."
        },
        { status: 404 }
      );
    }

    // Get subscription details
    const subscription = await db
      .select({
        status: playgroundSubscriptions.status,
        trialEndsAt: playgroundSubscriptions.trialEndsAt,
        currentPeriodEnd: playgroundSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: playgroundSubscriptions.cancelAtPeriodEnd,
      })
      .from(playgroundSubscriptions)
      .where(eq(playgroundSubscriptions.userId, userId))
      .limit(1);

    const sub = subscription[0];
    const limits = PLAN_LIMITS[stats.plan];

    return NextResponse.json({
      plan: stats.plan,
      status: sub?.status || "inactive",
      trial: sub?.trialEndsAt ? {
        endsAt: sub.trialEndsAt.toISOString(),
        isActive: new Date() < sub.trialEndsAt,
      } : null,
      billing: sub?.currentPeriodEnd ? {
        currentPeriodEndsAt: sub.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd || false,
      } : null,
      limits: {
        contextCap: limits.contextCap,
        maxOutputTokens: limits.maxOutputTokens,
        maxRequestsPerDay: limits.maxRequestsPerDay,
        maxOutputTokensPerMonth: limits.maxOutputTokensPerMonth,
      },
      today: {
        requestsUsed: stats.today.requestsUsed,
        requestsRemaining: Math.max(0, limits.maxRequestsPerDay - stats.today.requestsUsed),
        requestsLimit: stats.today.requestsLimit,
      },
      thisMonth: {
        tokensOutput: stats.thisMonth.tokensOutput,
        tokensRemaining: Math.max(0, limits.maxOutputTokensPerMonth - stats.thisMonth.tokensOutput),
        tokensLimit: stats.thisMonth.tokensLimit,
        estimatedCostUsd: stats.thisMonth.estimatedCost,
      },
    });

  } catch (error) {
    console.error("Error fetching usage stats:", error);
    return NextResponse.json(
      { error: "Internal server error", message: "Failed to fetch usage stats" },
      { status: 500 }
    );
  }
}

/**
 * POST handler - not supported
 */
export async function POST(): Promise<Response> {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
