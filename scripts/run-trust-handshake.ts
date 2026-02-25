import { db } from "@/lib/db";
import { agents, agentCapabilityHandshakes } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { hasTrustTable } from "@/lib/trust/db";
import { runCapabilityHandshake } from "@/lib/trust/handshake";

const batch = Number(process.env.TRUST_HANDSHAKE_BATCH ?? "50");
const onlyStale = process.env.TRUST_HANDSHAKE_ONLY_STALE !== "0";

async function main() {
  if (!(await hasTrustTable("agent_capability_handshakes"))) {
    console.error("trust: agent_capability_handshakes table not found");
    process.exit(1);
  }

  const rows = await db
    .select({
      id: agents.id,
      url: agents.url,
      homepage: agents.homepage,
      protocols: agents.protocols,
      capabilities: agents.capabilities,
      readme: agents.readme,
      description: agents.description,
    })
    .from(agents)
    .where(eq(agents.status, "ACTIVE"))
    .orderBy(sql`RANDOM()`)
    .limit(batch);

  for (const agent of rows) {
    if (onlyStale) {
      const last = await db
        .select({ verifiedAt: agentCapabilityHandshakes.verifiedAt })
        .from(agentCapabilityHandshakes)
        .where(eq(agentCapabilityHandshakes.agentId, agent.id))
        .orderBy(sql`${agentCapabilityHandshakes.verifiedAt} DESC`)
        .limit(1);
      const lastAt = last[0]?.verifiedAt;
      if (lastAt) {
        const ageHours = (Date.now() - lastAt.getTime()) / (1000 * 60 * 60);
        if (ageHours < 24) continue;
      }
    }

    const handshake = await runCapabilityHandshake({
      url: agent.url,
      homepage: agent.homepage,
      protocols: Array.isArray(agent.protocols) ? agent.protocols : [],
      capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
      readme: agent.readme,
      description: agent.description,
    });

    await db.insert(agentCapabilityHandshakes).values({
      agentId: agent.id,
      verifiedAt: handshake.verifiedAt,
      expiresAt: handshake.expiresAt,
      status: handshake.status,
      protocolChecks: handshake.protocolChecks,
      capabilityChecks: handshake.capabilityChecks,
      latencyProbeMs: handshake.latencyProbeMs,
      errorRateProbe: handshake.errorRateProbe,
      evidenceRef: handshake.evidenceRef ?? null,
      requestId: "cron",
    });
  }

  console.log(`trust: handshake batch completed for ${rows.length} agents`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
