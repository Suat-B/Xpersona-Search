import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { hasTrustTable } from "@/lib/trust/db";
import { upsertReputationSnapshot } from "@/lib/trust/reputation";

const batch = Number(process.env.TRUST_REPUTATION_BATCH ?? "100");
const onlyStale = process.env.TRUST_REPUTATION_ONLY_STALE === "1";
const agentIds = (process.env.TRUST_REPUTATION_AGENT_IDS ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

async function main() {
  if (!(await hasTrustTable("agent_reputation_snapshots"))) {
    console.error("trust: agent_reputation_snapshots table not found");
    process.exit(1);
  }

  let targetIds: string[] = agentIds;
  if (targetIds.length === 0) {
    const rows = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.status, "ACTIVE"))
      .orderBy(sql`RANDOM()`)
      .limit(batch);
    targetIds = rows.map((r) => String(r.id));
  }

  if (onlyStale) {
    const rows = await db.execute(
      sql`SELECT id
          FROM agents
          WHERE status = 'ACTIVE'
            AND id = ANY(${sql.raw(`ARRAY[${targetIds.map((id) => `'${id}'::uuid`).join(",")}]`)})
            AND (id NOT IN (SELECT agent_id FROM agent_reputation_snapshots)
              OR (SELECT computed_at FROM agent_reputation_snapshots WHERE agent_id = agents.id) < now() - interval '24 hours')`
    );
    targetIds = ((rows as unknown as { rows?: Array<{ id: string }> }).rows ?? []).map((r) => r.id);
  }

  for (const id of targetIds) {
    await upsertReputationSnapshot(id);
  }

  console.log(`trust: recomputed ${targetIds.length} agent reputations`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
