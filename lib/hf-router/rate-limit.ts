/**
 * HuggingFace Router Rate Limiting
 *
 * Canonical limits (5-hour cycle):
 * - Trial: 8k input/request, 256 max output, 30 req/cycle, 120k tokens/cycle, 1.5M tokens/month
 * - Starter: 32k input/request, 512 max output, 300 req/cycle, 600k tokens/cycle, 8M tokens/month
 * - Builder: 32k input/request, 512 max output, 1k req/cycle, 1.8M tokens/cycle, 25M tokens/month
 * - Studio: 32k input/request, 512 max output, 3k req/cycle, 4.5M tokens/cycle, 60M tokens/month
 */

import { db } from "@/lib/db";
import { hfCycleUsage, hfMonthlyUsage, playgroundSubscriptions } from "@/lib/db/playground-schema";
import { and, eq, sql } from "drizzle-orm";

export type PlaygroundPlan = "trial" | "starter" | "builder" | "studio";

export interface PlanLimits {
  /** Visible UX ceiling for context window (tokens) */
  contextHardCap: number;
  /** Max output tokens per request */
  maxOutputTokens: number;
  /** Max requests per 5-hour cycle */
  maxRequestsPerCycle: number;
  /** Max input tokens per request */
  maxInputTokensPerRequest: number;
  /** Max total tokens (input + output) per 5-hour cycle */
  maxTotalTokensPerCycle: number;
  /** Max total tokens (input + output) per month */
  maxTotalTokensPerMonth: number;
}

export const PLAN_LIMITS: Record<PlaygroundPlan, PlanLimits> = {
  trial: {
    contextHardCap: 8192,
    maxOutputTokens: 256,
    maxRequestsPerCycle: 30,
    maxInputTokensPerRequest: 8192,
    maxTotalTokensPerCycle: 120_000,
    maxTotalTokensPerMonth: 1_500_000,
  },
  starter: {
    contextHardCap: 32_768,
    maxOutputTokens: 512,
    maxRequestsPerCycle: 300,
    maxInputTokensPerRequest: 32_768,
    maxTotalTokensPerCycle: 600_000,
    maxTotalTokensPerMonth: 8_000_000,
  },
  builder: {
    contextHardCap: 32_768,
    maxOutputTokens: 512,
    maxRequestsPerCycle: 1000,
    maxInputTokensPerRequest: 32_768,
    maxTotalTokensPerCycle: 1_800_000,
    maxTotalTokensPerMonth: 25_000_000,
  },
  studio: {
    contextHardCap: 32_768,
    maxOutputTokens: 512,
    maxRequestsPerCycle: 3000,
    maxInputTokensPerRequest: 32_768,
    maxTotalTokensPerCycle: 4_500_000,
    maxTotalTokensPerMonth: 60_000_000,
  },
};

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  currentUsage?: {
    cycleRequests: number;
    cycleTotalTokens: number;
    monthlyTotalTokens: number;
  };
  limits?: PlanLimits;
}

export function getCurrentFiveHourWindow(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  const currentUtcHour = start.getUTCHours();
  const blockStartHour = Math.floor(currentUtcHour / 5) * 5;
  start.setUTCHours(blockStartHour, 0, 0, 0);

  const end = new Date(start);
  end.setUTCHours(end.getUTCHours() + 5);

  return { start, end };
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

  if (subscription.length === 0) return null;

  const sub = subscription[0];
  const planTier = (sub.planTier ?? "trial") as PlaygroundPlan;
  if (!(planTier in PLAN_LIMITS)) return null;

  if (planTier === "trial" && sub.trialEndsAt) {
    if (new Date() > sub.trialEndsAt) return { plan: "trial", isActive: false };
  }

  const isActive = sub.status === "active" || sub.status === "trial";
  return { plan: planTier, isActive };
}

/**
 * Get cycle usage for a user
 */
export async function getCycleUsage(userId: string, cycleStartAt: Date): Promise<{
  requestsCount: number;
  tokensInput: number;
  tokensOutput: number;
}> {
  const result = await db
    .select({
      requestsCount: hfCycleUsage.requestsCount,
      tokensInput: hfCycleUsage.tokensInput,
      tokensOutput: hfCycleUsage.tokensOutput,
    })
    .from(hfCycleUsage)
    .where(
      and(
        eq(hfCycleUsage.userId, userId),
        eq(hfCycleUsage.cycleStartAt, cycleStartAt)
      )
    )
    .limit(1);

  return {
    requestsCount: result[0]?.requestsCount ?? 0,
    tokensInput: result[0]?.tokensInput ?? 0,
    tokensOutput: result[0]?.tokensOutput ?? 0,
  };
}

/**
 * Get monthly total tokens (input + output) for a user
 */
export async function getMonthlyTotalTokens(userId: string): Promise<{ input: number; output: number; total: number }> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const result = await db
    .select({
      tokensInput: hfMonthlyUsage.tokensInput,
      tokensOutput: hfMonthlyUsage.tokensOutput,
    })
    .from(hfMonthlyUsage)
    .where(
      and(
        eq(hfMonthlyUsage.userId, userId),
        eq(hfMonthlyUsage.usageYear, year),
        eq(hfMonthlyUsage.usageMonth, month)
      )
    )
    .limit(1);

  const input = result[0]?.tokensInput ?? 0;
  const output = result[0]?.tokensOutput ?? 0;
  return { input, output, total: input + output };
}

/**
 * Check all rate limits for a request
 *
 * Enforced order:
 * 1) active subscription
 * 2) max output/request
 * 3) context hard cap (input/request)
 * 4) requests in current 5-hour cycle
 * 5) total tokens in current cycle
 * 6) monthly total token cap
 */
export async function checkRateLimits(
  userId: string,
  requestedMaxTokens: number,
  estimatedInputTokens: number
): Promise<RateLimitResult> {
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

  if (requestedMaxTokens > limits.maxOutputTokens) {
    return {
      allowed: false,
      reason: `max_tokens (${requestedMaxTokens}) exceeds your plan limit of ${limits.maxOutputTokens}.`,
      limits,
    };
  }

  if (estimatedInputTokens > limits.maxInputTokensPerRequest) {
    return {
      allowed: false,
      reason: `Context length (${estimatedInputTokens} tokens) exceeds your plan limit of ${limits.contextHardCap} tokens.`,
      limits,
    };
  }

  const { start } = getCurrentFiveHourWindow();
  const cycleUsage = await getCycleUsage(userId, start);
  const cycleTotalTokens = cycleUsage.tokensInput + cycleUsage.tokensOutput;
  if (cycleUsage.requestsCount >= limits.maxRequestsPerCycle) {
    return {
      allowed: false,
      reason: `5-hour request limit reached (${limits.maxRequestsPerCycle}). Try again after reset.`,
      currentUsage: {
        cycleRequests: cycleUsage.requestsCount,
        cycleTotalTokens,
        monthlyTotalTokens: 0,
      },
      limits,
    };
  }

  const projectedCycleTotal = cycleTotalTokens + estimatedInputTokens + requestedMaxTokens;
  if (projectedCycleTotal > limits.maxTotalTokensPerCycle) {
    return {
      allowed: false,
      reason: `5-hour total token budget would be exceeded. Used: ${cycleTotalTokens}, projected: ${projectedCycleTotal}, limit: ${limits.maxTotalTokensPerCycle}.`,
      currentUsage: {
        cycleRequests: cycleUsage.requestsCount,
        cycleTotalTokens,
        monthlyTotalTokens: 0,
      },
      limits,
    };
  }

  const monthly = await getMonthlyTotalTokens(userId);
  const projectedMonthlyTotal = monthly.total + estimatedInputTokens + requestedMaxTokens;
  if (projectedMonthlyTotal > limits.maxTotalTokensPerMonth) {
    return {
      allowed: false,
      reason: `Monthly total token budget would be exceeded. Used: ${monthly.total}, projected: ${projectedMonthlyTotal}, limit: ${limits.maxTotalTokensPerMonth}.`,
      currentUsage: {
        cycleRequests: cycleUsage.requestsCount,
        cycleTotalTokens,
        monthlyTotalTokens: monthly.total,
      },
      limits,
    };
  }

  return {
    allowed: true,
    currentUsage: {
      cycleRequests: cycleUsage.requestsCount,
      cycleTotalTokens,
      monthlyTotalTokens: monthly.total,
    },
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
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const { start } = getCurrentFiveHourWindow(now);

  await db
    .insert(hfCycleUsage)
    .values({
      userId,
      cycleStartAt: start,
      requestsCount: 1,
      tokensInput,
      tokensOutput,
      estimatedCostUsd,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [hfCycleUsage.userId, hfCycleUsage.cycleStartAt],
      set: {
        requestsCount: sql`${hfCycleUsage.requestsCount} + 1`,
        tokensInput: sql`${hfCycleUsage.tokensInput} + ${tokensInput}`,
        tokensOutput: sql`${hfCycleUsage.tokensOutput} + ${tokensOutput}`,
        estimatedCostUsd: sql`${hfCycleUsage.estimatedCostUsd} + ${estimatedCostUsd}`,
        updatedAt: now,
      },
    });

  await db
    .insert(hfMonthlyUsage)
    .values({
      userId,
      usageYear: year,
      usageMonth: month,
      requestsCount: 1,
      tokensInput,
      tokensOutput,
      estimatedCostUsd,
    })
    .onConflictDoUpdate({
      target: [hfMonthlyUsage.userId, hfMonthlyUsage.usageYear, hfMonthlyUsage.usageMonth],
      set: {
        requestsCount: sql`${hfMonthlyUsage.requestsCount} + 1`,
        tokensInput: sql`${hfMonthlyUsage.tokensInput} + ${tokensInput}`,
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
  cycle: {
    requestsUsed: number;
    requestsLimit: number;
    tokensTotalUsed: number;
    tokensTotalLimit: number;
    startsAt: string;
    endsAt: string;
  };
  thisMonth: {
    tokensInput: number;
    tokensOutput: number;
    tokensTotal: number;
    tokensLimit: number;
    estimatedCost: number;
  };
} | null> {
  const userPlan = await getUserPlan(userId);
  if (!userPlan) return null;

  const limits = PLAN_LIMITS[userPlan.plan];
  const now = new Date();
  const cycleWindow = getCurrentFiveHourWindow(now);
  const cycleUsage = await getCycleUsage(userId, cycleWindow.start);
  const monthly = await getMonthlyTotalTokens(userId);

  const monthlyResult = await db
    .select({ estimatedCostUsd: hfMonthlyUsage.estimatedCostUsd })
    .from(hfMonthlyUsage)
    .where(
      and(
        eq(hfMonthlyUsage.userId, userId),
        eq(hfMonthlyUsage.usageYear, now.getFullYear()),
        eq(hfMonthlyUsage.usageMonth, now.getMonth() + 1)
      )
    )
    .limit(1);

  return {
    plan: userPlan.plan,
    cycle: {
      requestsUsed: cycleUsage.requestsCount,
      requestsLimit: limits.maxRequestsPerCycle,
      tokensTotalUsed: cycleUsage.tokensInput + cycleUsage.tokensOutput,
      tokensTotalLimit: limits.maxTotalTokensPerCycle,
      startsAt: cycleWindow.start.toISOString(),
      endsAt: cycleWindow.end.toISOString(),
    },
    thisMonth: {
      tokensInput: monthly.input,
      tokensOutput: monthly.output,
      tokensTotal: monthly.total,
      tokensLimit: limits.maxTotalTokensPerMonth,
      estimatedCost: monthlyResult[0]?.estimatedCostUsd ?? 0,
    },
  };
}

/**
 * Simple token estimation (rough approximation)
 * 1 token ~= 4 characters for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate total tokens in messages array
 */
export function estimateMessagesTokens(messages: Array<{ content: string }>): number {
  let total = 3;
  for (const message of messages) {
    total += 4;
    total += estimateTokens(message.content || "");
  }
  total += 3;
  return total;
}
