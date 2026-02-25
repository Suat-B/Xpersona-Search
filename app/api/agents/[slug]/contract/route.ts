import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentCapabilityContracts } from "@/lib/db/schema";
import { hasTrustTable } from "@/lib/trust/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const agentRows = await db
    .select({ id: agents.id, slug: agents.slug })
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);
  const agent = agentRows[0];
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hasContracts = await hasTrustTable("agent_capability_contracts");
  if (!hasContracts) {
    return NextResponse.json(
      { error: "Capability contracts not ready" },
      { status: 503 }
    );
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

  return NextResponse.json({
    agentId: agent.id,
    slug: agent.slug,
    contract: rows[0] ?? null,
  });
}
