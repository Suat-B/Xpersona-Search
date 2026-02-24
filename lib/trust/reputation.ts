import { db } from "@/lib/db";
import { agentExecutionMetrics, agentReputationSnapshots, searchOutcomes } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

const DEFAULT_WINDOW_DAYS = Number(process.env.TRUST_REPUTATION_WINDOW_DAYS ?? "30");

export type ReputationSnapshot = {
  scoreTotal: number;
  scoreSuccess: number;
  scoreReliability: number;
  scoreFallback: number;
  attempts30d: number;
  successRate30d: number;
  p95LatencyMs: number | null;
  fallbackRate: number;
  windowStart: Date;
  windowEnd: Date;
};

export async function computeReputationSnapshot(agentId: string): Promise<ReputationSnapshot> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const outcomesResult = await db
    .select({
      attempts: sql<number>`COALESCE(SUM(${searchOutcomes.attempts}), 0)`,
      successCount: sql<number>`COALESCE(SUM(${searchOutcomes.successCount}), 0)`,
      failureCount: sql<number>`COALESCE(SUM(${searchOutcomes.failureCount}), 0)`,
      timeoutCount: sql<number>`COALESCE(SUM(${searchOutcomes.timeoutCount}), 0)`,
      authFailureCount: sql<number>`COALESCE(SUM(${searchOutcomes.authFailureCount}), 0)`,
      rateLimitFailureCount: sql<number>`COALESCE(SUM(${searchOutcomes.rateLimitFailureCount}), 0)`,
      toolErrorCount: sql<number>`COALESCE(SUM(${searchOutcomes.toolErrorCount}), 0)`,
      schemaMismatchCount: sql<number>`COALESCE(SUM(${searchOutcomes.schemaMismatchCount}), 0)`,
      budgetExceededCount: sql<number>`COALESCE(SUM(${searchOutcomes.budgetExceededCount}), 0)`,
      singlePathCount: sql<number>`COALESCE(SUM(${searchOutcomes.singlePathCount}), 0)`,
      delegatedPathCount: sql<number>`COALESCE(SUM(${searchOutcomes.delegatedPathCount}), 0)`,
      bundledPathCount: sql<number>`COALESCE(SUM(${searchOutcomes.bundledPathCount}), 0)`,
    })
    .from(searchOutcomes)
    .where(and(eq(searchOutcomes.agentId, agentId), gte(searchOutcomes.lastOutcomeAt, windowStart)));

  const outcomes = outcomesResult[0];
  const attempts = Number(outcomes?.attempts ?? 0);
  const successCount = Number(outcomes?.successCount ?? 0);
  const failureCount = Number(outcomes?.failureCount ?? 0);
  const timeoutCount = Number(outcomes?.timeoutCount ?? 0);
  const authFailureCount = Number(outcomes?.authFailureCount ?? 0);
  const rateLimitFailureCount = Number(outcomes?.rateLimitFailureCount ?? 0);
  const toolErrorCount = Number(outcomes?.toolErrorCount ?? 0);
  const schemaMismatchCount = Number(outcomes?.schemaMismatchCount ?? 0);
  const budgetExceededCount = Number(outcomes?.budgetExceededCount ?? 0);
  const singlePathCount = Number(outcomes?.singlePathCount ?? 0);
  const delegatedPathCount = Number(outcomes?.delegatedPathCount ?? 0);
  const bundledPathCount = Number(outcomes?.bundledPathCount ?? 0);

  const successRate = attempts > 0 ? successCount / attempts : 0;
  const failureTotal =
    failureCount +
    timeoutCount +
    authFailureCount +
    rateLimitFailureCount +
    toolErrorCount +
    schemaMismatchCount +
    budgetExceededCount;
  const reliabilityRate = attempts > 0 ? Math.max(0, 1 - failureTotal / attempts) : 0;
  const fallbackDenominator = singlePathCount + delegatedPathCount + bundledPathCount;
  const fallbackRate = fallbackDenominator > 0
    ? (delegatedPathCount + bundledPathCount) / fallbackDenominator
    : 0;

  const metrics = await db
    .select({ p95: agentExecutionMetrics.observedLatencyMsP95 })
    .from(agentExecutionMetrics)
    .where(eq(agentExecutionMetrics.agentId, agentId))
    .limit(1);

  const p95LatencyMs = metrics[0]?.p95 ?? null;

  const scoreSuccess = Math.round(successRate * 100);
  const scoreReliability = Math.round(reliabilityRate * 100);
  const scoreFallback = Math.round((1 - fallbackRate) * 100);
  const scoreTotal = Math.round(0.5 * scoreSuccess + 0.3 * scoreReliability + 0.2 * scoreFallback);

  return {
    scoreTotal,
    scoreSuccess,
    scoreReliability,
    scoreFallback,
    attempts30d: attempts,
    successRate30d: successRate,
    p95LatencyMs,
    fallbackRate,
    windowStart,
    windowEnd,
  };
}

export async function upsertReputationSnapshot(agentId: string): Promise<ReputationSnapshot> {
  const snapshot = await computeReputationSnapshot(agentId);
  await db
    .insert(agentReputationSnapshots)
    .values({
      agentId,
      scoreTotal: snapshot.scoreTotal,
      scoreSuccess: snapshot.scoreSuccess,
      scoreReliability: snapshot.scoreReliability,
      scoreFallback: snapshot.scoreFallback,
      attempts30d: snapshot.attempts30d,
      successRate30d: snapshot.successRate30d,
      p95LatencyMs: snapshot.p95LatencyMs,
      fallbackRate: snapshot.fallbackRate,
      computedAt: new Date(),
      windowStart: snapshot.windowStart,
      windowEnd: snapshot.windowEnd,
    })
    .onConflictDoUpdate({
      target: agentReputationSnapshots.agentId,
      set: {
        scoreTotal: snapshot.scoreTotal,
        scoreSuccess: snapshot.scoreSuccess,
        scoreReliability: snapshot.scoreReliability,
        scoreFallback: snapshot.scoreFallback,
        attempts30d: snapshot.attempts30d,
        successRate30d: snapshot.successRate30d,
        p95LatencyMs: snapshot.p95LatencyMs,
        fallbackRate: snapshot.fallbackRate,
        computedAt: new Date(),
        windowStart: snapshot.windowStart,
        windowEnd: snapshot.windowEnd,
      },
    });
  return snapshot;
}
