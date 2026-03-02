/**
 * HuggingFace Router Rate Limiting
 * 
 * Plan Limits:
 * - Trial: 30 req/day, 8k context, 256 max output, 50k monthly output tokens
 * - Paid: 100 req/day, 16k context, 512 max output, 300k monthly output tokens
 */

import { db } from "@/lib/db";
import { hfDailyUsage, hfMonthlyUsage, playgroundSubscriptions } from "@/lib/db/playground-schema";
import { eq, and, sql } from "drizzle-orm";

export type PlaygroundPlan = "trial" | "paid";

export interface PlanLimits {
  /** Max context length in tokens */
  contextCap: number;
  /** Max output tokens per request */
  maxOutputTokens: number;
  /** Max requests per day */
  maxRequestsPerDay: number;
  /** Max output tokens per month */
  maxOutputTokensPerMonth: number;
}

export const PLAN_LIMITS: Record<PlaygroundPlan, PlanLimits> = {
  trial: {
    contextCap: 8192,
    maxOutputTokens: 256,
    maxRequestsPerDay: 30,
    maxOutputTokensPerMonth: 50000,
  },
  paid: {
    contextCap: 16384,
    maxOutputTokens: 512,
    maxRequestsPerDay: 100,
    maxOutputTokensPerMonth: 300000,
  },
};

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  currentUsage?: {
    dailyRequests: number;
    monthlyOutputTokens: number;
  };
  limits?: PlanLimits;
}

/**
 * Check if a user has an active playground subscription
 */
export async function getUserPlan(userId: string): Promise<{ plan: PlaygroundPlan; isActive: boolean } | null> {
  const subscription = await db
    .select({
      planTier: playgroundSubscriptions.planTier,
      status: playgroundSubscriptions.status,
      trialEndsAt: playgroundSubscriptions.trialEndsAt,
    })
    .from(playgroundSubscriptions)
    .where(eq(playgroundSubscriptions.userId, userId))
    .limit(1);

  if (subscription.length === 0) {
    return null;
  }

  const sub = subscription[0];
  
  // Check if trial has expired
  if (sub.planTier === "trial" && sub.trialEndsAt) {
    if (new Date() > sub.trialEndsAt) {
      return { plan: "trial", isActive: false };
    }
  }

  const isActive = sub.status === "active" || sub.status === "trial";
  return { plan: sub.planTier as PlaygroundPlan, isActive };
}

/**
 * Get daily request count for a user
 */
export async function getDailyRequestCount(userId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  
  const result = await db
    .select({ requestsCount: hfDailyUsage.requestsCount })
    .from(hfDailyUsage)
    .where(and(
      eq(hfDailyUsage.userId, userId),
      eq(hfDailyUsage.usageDate, today)
    ))
    .limit(1);

  return result[0]?.requestsCount ?? 0;
}

/**
 * Get monthly output token count for a user
 */
export async function getMonthlyOutputTokens(userId: string): Promise<number> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  
  const result = await db
    .select({ tokensOutput: hfMonthlyUsage.tokensOutput })
    .from(hfMonthlyUsage)
    .where(and(
      eq(hfMonthlyUsage.userId, userId),
      eq(hfMonthlyUsage.usageYear, year),
      eq(hfMonthlyUsage.usageMonth, month)
    ))
    .limit(1);

  return result[0]?.tokensOutput ?? 0;
}

/**
 * Check all rate limits for a request
 */
export async function checkRateLimits(
  userId: string,
  requestedMaxTokens: number,
  estimatedInputTokens: number
): Promise<RateLimitResult> {
  // Get user's plan
  const userPlan = await getUserPlan(userId);
  
  if (!userPlan) {
    return {
      allowed: false,
      reason: "No active playground subscription. Please subscribe to use the HF router.",
    };
  }

  if (!userPlan.isActive) {
    return {
      allowed: false,
      reason: "Your subscription has expired. Please renew to continue using the HF router.",
    };
  }

  const limits = PLAN_LIMITS[userPlan.plan];

  // Check max_tokens against plan limit
  if (requestedMaxTokens > limits.maxOutputTokens) {
    return {
      allowed: false,
      reason: `max_tokens (${requestedMaxTokens}) exceeds your plan limit of ${limits.maxOutputTokens}. Upgrade to paid plan for higher limits.`,
      limits,
    };
  }

  // Check context length (estimated input tokens)
  if (estimatedInputTokens > limits.contextCap) {
    return {
      allowed: false,
      reason: `Context length (${estimatedInputTokens} tokens) exceeds your plan limit of ${limits.contextCap} tokens. Please reduce your prompt size.`,
      limits,
    };
  }

  // Check daily request count
  const dailyRequests = await getDailyRequestCount(userId);
  if (dailyRequests >= limits.maxRequestsPerDay) {
    return {
      allowed: false,
      reason: `Daily request limit reached (${limits.maxRequestsPerDay}). Please try again tomorrow.`,
      currentUsage: { dailyRequests, monthlyOutputTokens: 0 },
      limits,
    };
  }

  // Check monthly output token cap
  const monthlyTokens = await getMonthlyOutputTokens(userId);
  if (monthlyTokens + requestedMaxTokens > limits.maxOutputTokensPerMonth) {
    return {
      allowed: false,
      reason: `Monthly output token limit would be exceeded. Used: ${monthlyTokens}, Limit: ${limits.maxOutputTokensPerMonth}.`,
      currentUsage: { dailyRequests, monthlyOutputTokens: monthlyTokens },
      limits,
    };
  }

  return {
    allowed: true,
    currentUsage: { dailyRequests, monthlyOutputTokens: monthlyTokens },
    limits,
  };
}

/**
 * Increment usage counters after a successful request
 */
export async function incrementUsage(
  userId: string,
  tokensInput: number,
  tokensOutput: number,
  estimatedCostUsd: number
): Promise<void> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Upsert daily usage
  await db
    .insert(hfDailyUsage)
    .values({
      userId,
      usageDate: today,
      requestsCount: 1,
      tokensInput,
      tokensOutput,
      estimatedCostUsd,
    })
    .onConflictDoUpdate({
      target: [hfDailyUsage.userId, hfDailyUsage.usageDate],
      set: {
        requestsCount: sql`${hfDailyUsage.requestsCount} + 1`,
        tokensInput: sql`${hfDailyUsage.tokensInput} + ${tokensInput}`,
        tokensOutput: sql`${hfDailyUsage.tokensOutput} + ${tokensOutput}`,
        estimatedCostUsd: sql`${hfDailyUsage.estimatedCostUsd} + ${estimatedCostUsd}`,
      },
    });

  // Upsert monthly usage
  await db
    .insert(hfMonthlyUsage)
    .values({
      userId,
      usageYear: year,
      usageMonth: month,
      requestsCount: 1,
      tokensOutput,
      estimatedCostUsd,
    })
    .onConflictDoUpdate({
      target: [hfMonthlyUsage.userId, hfMonthlyUsage.usageYear, hfMonthlyUsage.usageMonth],
      set: {
        requestsCount: sql`${hfMonthlyUsage.requestsCount} + 1`,
        tokensOutput: sql`${hfMonthlyUsage.tokensOutput} + ${tokensOutput}`,
        estimatedCostUsd: sql`${hfMonthlyUsage.estimatedCostUsd} + ${estimatedCostUsd}`,
      },
    });
}

/**
 * Get full usage stats for a user
 */
export async function getUserUsageStats(userId: string): Promise<{
  plan: PlaygroundPlan;
  today: {
    requestsUsed: number;
    requestsLimit: number;
    tokensOutput: number;
  };
  thisMonth: {
    tokensOutput: number;
    tokensLimit: number;
    estimatedCost: number;
  };
} | null> {
  const userPlan = await getUserPlan(userId);
  if (!userPlan) return null;

  const limits = PLAN_LIMITS[userPlan.plan];
  const dailyRequests = await getDailyRequestCount(userId);
  const monthlyTokens = await getMonthlyOutputTokens(userId);

  // Get estimated cost for this month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  
  const monthlyResult = await db
    .select({ estimatedCostUsd: hfMonthlyUsage.estimatedCostUsd })
    .from(hfMonthlyUsage)
    .where(and(
      eq(hfMonthlyUsage.userId, userId),
      eq(hfMonthlyUsage.usageYear, year),
      eq(hfMonthlyUsage.usageMonth, month)
    ))
    .limit(1);

  return {
    plan: userPlan.plan,
    today: {
      requestsUsed: dailyRequests,
      requestsLimit: limits.maxRequestsPerDay,
      tokensOutput: 0, // Would need to query daily usage for this
    },
    thisMonth: {
      tokensOutput: monthlyTokens,
      tokensLimit: limits.maxOutputTokensPerMonth,
      estimatedCost: monthlyResult[0]?.estimatedCostUsd ?? 0,
    },
  };
}

/**
 * Simple token estimation (rough approximation)
 * 1 token ≈ 4 characters for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate total tokens in messages array
 */
export function estimateMessagesTokens(messages: Array<{ content: string }>): number {
  // Base tokens for message format
  let total = 3;
  
  for (const message of messages) {
    // 4 tokens per message (role + content structure)
    total += 4;
    // Content tokens
    total += estimateTokens(message.content);
  }
  
  return total;
}
