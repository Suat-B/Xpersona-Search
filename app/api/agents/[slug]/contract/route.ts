import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentCapabilityContracts } from "@/lib/db/schema";
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
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Missing slug",
      status: 400,
    });
    recordApiResponse("/api/agents/:slug/contract", req, response, startedAt);
    return response;
  }

  const agentRows = await db
    .select({ id: agents.id, slug: agents.slug })
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);
  const agent = agentRows[0];
  if (!agent) {
    const response = jsonError(req, {
      code: "NOT_FOUND",
      message: "Not found",
      status: 404,
    });
    recordApiResponse("/api/agents/:slug/contract", req, response, startedAt);
    return response;
  }

  const hasContracts = await hasTrustTable("agent_capability_contracts");
  if (!hasContracts) {
    const response = jsonError(req, {
      code: "SERVICE_UNAVAILABLE",
      message: "Capability contracts not ready",
      status: 503,
    });
    recordApiResponse("/api/agents/:slug/contract", req, response, startedAt);
    return response;
  }

  const rows = await db
    .select({
      authModes: agentCapabilityContracts.authModes,
      requires: agentCapabilityContracts.requires,
      forbidden: agentCapabilityContracts.forbidden,
      dataRegion: agentCapabilityContracts.dataRegion,
      inputSchemaRef: agentCapabilityContracts.inputSchemaRef,
      outputSchemaRef: agentCapabilityContracts.outputSchemaRef,
      supportsStreaming: agentCapabilityContracts.supportsStreaming,
      supportsMcp: agentCapabilityContracts.supportsMcp,
      supportsA2a: agentCapabilityContracts.supportsA2a,
      updatedAt: agentCapabilityContracts.updatedAt,
      createdAt: agentCapabilityContracts.createdAt,
    })
    .from(agentCapabilityContracts)
    .where(eq(agentCapabilityContracts.agentId, agent.id))
    .limit(1);

  const response = NextResponse.json({
    agentId: agent.id,
    slug: agent.slug,
    contract: rows[0] ?? null,
  });
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/:slug/contract", req, response, startedAt);
  return response;
}
