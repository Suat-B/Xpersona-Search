import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";
import { getTrustSummary } from "@/lib/trust/summary";

function toTrustScore(reputationScore: number | null): number | null {
  if (reputationScore == null || !Number.isFinite(reputationScore)) return null;
  if (reputationScore <= 1 && reputationScore >= 0) return Number(reputationScore.toFixed(3));
  return Number(Math.max(0, Math.min(1, reputationScore / 100)).toFixed(3));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const startedAt = Date.now();
  const { slug } = await params;
  if (!slug) {
    const response = jsonError(req, { code: "BAD_REQUEST", message: "Missing slug", status: 400 });
    recordApiResponse("/api/agents/:slug/snapshot", req, response, startedAt);
    return response;
  }

  const rows = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      description: agents.description,
      capabilities: agents.capabilities,
      protocols: agents.protocols,
      safetyScore: agents.safetyScore,
      overallRank: agents.overallRank,
      source: agents.source,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);
  const agent = rows[0];
  if (!agent) {
    const response = jsonError(req, { code: "NOT_FOUND", message: "Agent not found", status: 404 });
    recordApiResponse("/api/agents/:slug/snapshot", req, response, startedAt);
    return response;
  }

  const trust = await getTrustSummary(agent.id);
  const response = NextResponse.json({
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    capabilities: (agent.capabilities as string[] | null) ?? [],
    protocols: (agent.protocols as string[] | null) ?? [],
    safetyScore: agent.safetyScore,
    overallRank: agent.overallRank,
    trustScore: toTrustScore(trust?.reputationScore ?? null),
    trust,
    source: agent.source,
    updatedAt: agent.updatedAt?.toISOString?.() ?? null,
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/:slug/snapshot", req, response, startedAt);
  return response;
}
