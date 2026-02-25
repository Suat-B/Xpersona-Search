import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentCapabilityHandshakes, agentReputationSnapshots } from "@/lib/db/schema";
import { hasTrustTable } from "@/lib/trust/db";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const startedAt = Date.now();
  const { slug } = await params;
  if (!slug) {
    const response = jsonError(req, { code: "BAD_REQUEST", message: "Missing slug", status: 400 });
    recordApiResponse("/api/agents/:slug/trust", req, response, startedAt);
    return response;
  }

  const agentRows = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);
  const agent = agentRows[0];
  if (!agent) {
    const response = jsonError(req, { code: "NOT_FOUND", message: "Not found", status: 404 });
    recordApiResponse("/api/agents/:slug/trust", req, response, startedAt);
    return response;
  }

  const hasHandshake = await hasTrustTable("agent_capability_handshakes");
  const hasReputation = await hasTrustTable("agent_reputation_snapshots");

  const handshake = hasHandshake
    ? await db
        .select({
          status: agentCapabilityHandshakes.status,
          verifiedAt: agentCapabilityHandshakes.verifiedAt,
          expiresAt: agentCapabilityHandshakes.expiresAt,
          protocolChecks: agentCapabilityHandshakes.protocolChecks,
          capabilityChecks: agentCapabilityHandshakes.capabilityChecks,
          latencyProbeMs: agentCapabilityHandshakes.latencyProbeMs,
          errorRateProbe: agentCapabilityHandshakes.errorRateProbe,
          evidenceRef: agentCapabilityHandshakes.evidenceRef,
        })
        .from(agentCapabilityHandshakes)
        .where(eq(agentCapabilityHandshakes.agentId, agent.id))
        .orderBy(desc(agentCapabilityHandshakes.verifiedAt))
        .limit(1)
    : [];

  const reputation = hasReputation
    ? await db
        .select({
          scoreTotal: agentReputationSnapshots.scoreTotal,
          scoreSuccess: agentReputationSnapshots.scoreSuccess,
          scoreReliability: agentReputationSnapshots.scoreReliability,
          scoreFallback: agentReputationSnapshots.scoreFallback,
          attempts30d: agentReputationSnapshots.attempts30d,
          successRate30d: agentReputationSnapshots.successRate30d,
          p95LatencyMs: agentReputationSnapshots.p95LatencyMs,
          fallbackRate: agentReputationSnapshots.fallbackRate,
          computedAt: agentReputationSnapshots.computedAt,
          windowStart: agentReputationSnapshots.windowStart,
          windowEnd: agentReputationSnapshots.windowEnd,
        })
        .from(agentReputationSnapshots)
        .where(eq(agentReputationSnapshots.agentId, agent.id))
        .orderBy(desc(agentReputationSnapshots.computedAt))
        .limit(1)
    : [];

  const response = NextResponse.json({
    handshake: handshake[0] ?? null,
    reputation: reputation[0] ?? null,
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/:slug/trust", req, response, startedAt);
  return response;
}
