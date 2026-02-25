import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gpgAgentClusterStats, gpgTaskClusters } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db
    .select({
      clusterId: gpgAgentClusterStats.clusterId,
      successRate30d: gpgAgentClusterStats.successRate30d,
      bayesSuccess30d: gpgAgentClusterStats.bayesSuccess30d,
      avgCost30d: gpgAgentClusterStats.avgCost30d,
      p95LatencyMs30d: gpgAgentClusterStats.p95LatencyMs30d,
      riskScore30d: gpgAgentClusterStats.riskScore30d,
      runCount30d: gpgAgentClusterStats.runCount30d,
      updatedAt: gpgAgentClusterStats.updatedAt,
    })
    .from(gpgAgentClusterStats)
    .where(eq(gpgAgentClusterStats.agentId, id));

  const clusterIds = rows.map((r) => r.clusterId);
  const clusterRows = clusterIds.length
    ? await db
        .select({ id: gpgTaskClusters.id, name: gpgTaskClusters.name, taskType: gpgTaskClusters.taskType })
        .from(gpgTaskClusters)
        .where(sql`${gpgTaskClusters.id} = ANY(${sql.raw(`ARRAY[${clusterIds.map((cid) => `'${cid}'::uuid`).join(",")}]`)})`)
    : [];

  const clusterMap = new Map(clusterRows.map((c) => [String(c.id), c]));

  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      clusterId: r.clusterId,
      clusterName: clusterMap.get(String(r.clusterId))?.name ?? null,
      taskType: clusterMap.get(String(r.clusterId))?.taskType ?? "general",
      successRate30d: r.successRate30d,
      bayesSuccess30d: r.bayesSuccess30d,
      avgCost30d: r.avgCost30d,
      p95LatencyMs30d: r.p95LatencyMs30d,
      riskScore30d: r.riskScore30d,
      runCount30d: r.runCount30d,
      updatedAt: r.updatedAt,
    })),
  });
}