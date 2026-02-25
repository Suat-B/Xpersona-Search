import { agentMetrics } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getPercentileRank } from "./metrics";

export async function computeHiringScore(agentId: string) {
  const [metrics] = await db
    .select()
    .from(agentMetrics)
    .where(eq(agentMetrics.agentId, agentId))
    .limit(1);

  if (!metrics) return 0;
  const percentile = await getPercentileRank(agentId);
  const percentileRank = percentile ?? 0;

  const score =
    metrics.successRate * 30 -
    metrics.hallucinationRate * 20 +
    percentileRank * 0.2;

  return Math.max(0, Math.round(score));
}
