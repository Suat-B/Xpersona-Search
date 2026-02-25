import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gpgAgentClusterStats } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "10")));

  const rows = await db
    .select({
      agentId: gpgAgentClusterStats.agentId,
      successRate30d: gpgAgentClusterStats.successRate30d,
      bayesSuccess30d: gpgAgentClusterStats.bayesSuccess30d,
      avgCost30d: gpgAgentClusterStats.avgCost30d,
      p95LatencyMs30d: gpgAgentClusterStats.p95LatencyMs30d,
      riskScore30d: gpgAgentClusterStats.riskScore30d,
      runCount30d: gpgAgentClusterStats.runCount30d,
    })
    .from(gpgAgentClusterStats)
    .where(eq(gpgAgentClusterStats.clusterId, id))
    .orderBy(desc(gpgAgentClusterStats.bayesSuccess30d))
    .limit(limit);

  return NextResponse.json({ success: true, data: rows });
}