import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentCapabilityHandshakes } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { runCapabilityHandshake } from "@/lib/trust/handshake";
import { hasTrustTable } from "@/lib/trust/db";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const startedAt = Date.now();
  const { slug } = await params;
  if (!slug) {
    const response = jsonError(req, { code: "BAD_REQUEST", message: "Missing slug", status: 400 });
    recordApiResponse("/api/agents/:slug/verify", req, response, startedAt);
    return response;
  }

  const internalToken = req.headers.get("x-trust-internal-token");
  const allowInternal =
    internalToken &&
    process.env.TRUST_INTERNAL_TOKEN &&
    internalToken === process.env.TRUST_INTERNAL_TOKEN;

  let isAllowed = allowInternal;
  let authUserId: string | null = null;

  if (!isAllowed) {
    const authResult = await getAuthUser(req);
    if ("error" in authResult) {
      const response = jsonError(req, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
      recordApiResponse("/api/agents/:slug/verify", req, response, startedAt);
      return response;
    }
    authUserId = authResult.user.id;
    isAllowed = isAdmin(authResult.user) === true;
  }

  const agentRows = await db
    .select({
      id: agents.id,
      url: agents.url,
      homepage: agents.homepage,
      protocols: agents.protocols,
      capabilities: agents.capabilities,
      readme: agents.readme,
      description: agents.description,
      claimedByUserId: agents.claimedByUserId,
    })
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);

  const agent = agentRows[0];
  if (!agent) {
    const response = jsonError(req, { code: "NOT_FOUND", message: "Not found", status: 404 });
    recordApiResponse("/api/agents/:slug/verify", req, response, startedAt);
    return response;
  }

  if (!isAllowed) {
    if (!authUserId || authUserId !== agent.claimedByUserId) {
      const response = jsonError(req, { code: "FORBIDDEN", message: "Forbidden", status: 403 });
      recordApiResponse("/api/agents/:slug/verify", req, response, startedAt);
      return response;
    }
  }

  if (!(await hasTrustTable("agent_capability_handshakes"))) {
    const response = jsonError(req, { code: "SERVICE_UNAVAILABLE", message: "Trust tables not ready", status: 503 });
    recordApiResponse("/api/agents/:slug/verify", req, response, startedAt);
    return response;
  }

  const handshake = await runCapabilityHandshake({
    url: agent.url,
    homepage: agent.homepage,
    protocols: Array.isArray(agent.protocols) ? agent.protocols : [],
    capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
    readme: agent.readme,
    description: agent.description,
  });

  await db.insert(agentCapabilityHandshakes).values([
    {
      agentId: agent.id,
      verifiedAt: handshake.verifiedAt,
      expiresAt: handshake.expiresAt,
      status: handshake.status,
      protocolChecks: handshake.protocolChecks,
      capabilityChecks: handshake.capabilityChecks,
      latencyProbeMs: handshake.latencyProbeMs,
      errorRateProbe: handshake.errorRateProbe,
      evidenceRef: handshake.evidenceRef ?? null,
      requestId: req.headers.get("x-request-id") ?? null,
    },
  ]);

  const response = NextResponse.json({
    status: handshake.status,
    verifiedAt: handshake.verifiedAt.toISOString(),
    expiresAt: handshake.expiresAt.toISOString(),
    protocolChecks: handshake.protocolChecks,
    capabilityChecks: handshake.capabilityChecks,
    latencyProbeMs: handshake.latencyProbeMs,
    errorRateProbe: handshake.errorRateProbe,
    evidenceRef: handshake.evidenceRef,
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/:slug/verify", req, response, startedAt);
  return response;
}
