import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gpgPipelineStats } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "10")));
  const rows = await db
    .select({
      clusterId: gpgPipelineStats.clusterId,
      pathHash: gpgPipelineStats.pathHash,
      agentPath: gpgPipelineStats.agentPath,
      bayesSuccess30d: gpgPipelineStats.bayesSuccess30d,
      avgCost30d: gpgPipelineStats.avgCost30d,
      p95LatencyMs30d: gpgPipelineStats.p95LatencyMs30d,
      riskScore30d: gpgPipelineStats.riskScore30d,
      runCount30d: gpgPipelineStats.runCount30d,
    })
    .from(gpgPipelineStats)
    .orderBy(desc(gpgPipelineStats.bayesSuccess30d))
    .limit(limit);

  return NextResponse.json({ success: true, data: rows });
}