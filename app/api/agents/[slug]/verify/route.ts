import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentCapabilityHandshakes } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { runCapabilityHandshake } from "@/lib/trust/handshake";
import { hasTrustTable } from "@/lib/trust/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isAllowed) {
    if (!authUserId || authUserId !== agent.claimedByUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!(await hasTrustTable("agent_capability_handshakes"))) {
    return NextResponse.json({ error: "Trust tables not ready" }, { status: 503 });
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

  return NextResponse.json({
    status: handshake.status,
    verifiedAt: handshake.verifiedAt.toISOString(),
    expiresAt: handshake.expiresAt.toISOString(),
    protocolChecks: handshake.protocolChecks,
    capabilityChecks: handshake.capabilityChecks,
    latencyProbeMs: handshake.latencyProbeMs,
    errorRateProbe: handshake.errorRateProbe,
    evidenceRef: handshake.evidenceRef,
  });
}
