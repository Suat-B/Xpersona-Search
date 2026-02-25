import { agentMetrics } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getFailurePatterns, getLatestModelUsed } from "./metrics";

export async function buildSuggestions(agentId: string) {
  const [metrics] = await db
    .select()
    .from(agentMetrics)
    .where(eq(agentMetrics.agentId, agentId))
    .limit(1);
  const failures = await getFailurePatterns(agentId);
  const modelUsed = await getLatestModelUsed(agentId);

  const actions: string[] = [];

  const failureTypes = new Set(failures.map((f) => f.type));
  if (failureTypes.has("TOOL_ERROR")) {
    actions.push("Add retry logic and tool health checks for TOOL_ERROR failures.");
  }
  if (failureTypes.has("INVALID_FORMAT")) {
    actions.push("Introduce strict output schema validation + auto-correction for INVALID_FORMAT.");
  }
  if (failureTypes.has("TIMEOUT")) {
    actions.push("Increase timeouts or split tasks to reduce TIMEOUT failures.");
  }
  if (failureTypes.has("HALLUCINATION")) {
    actions.push("Add verification steps or grounded retrieval to reduce hallucinations.");
  }

  if (metrics) {
    if (metrics.avgCostUsd > 0.05 && modelUsed) {
      actions.push(`Consider switching model from ${modelUsed} to a cheaper variant for cost efficiency.`);
    }
    if (metrics.p95Latency > 15000) {
      actions.push("Reduce latency by using smaller models or caching deterministic steps.");
    }
    if (metrics.successRate < 0.85) {
      actions.push("Add safety checks + fallback paths for low success rate workloads.");
    }
  }

  if (actions.length === 0) {
    actions.push("Maintain current strategy and monitor for new failure patterns.");
  }

  return {
    recommendedActions: actions,
    expectedSuccessRateGain: metrics ? Math.max(0, 0.9 - metrics.successRate) * 0.2 : 0.02,
    expectedCostReduction: metrics ? Math.min(0.02, metrics.avgCostUsd * 0.1) : 0.01,
  };
}
