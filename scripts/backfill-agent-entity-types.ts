import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { detectPublicEntityType } from "@/lib/entities/public-entities";

async function main() {
  const rows = await db
    .select({
      id: agents.id,
      entityType: agents.entityType,
      source: agents.source,
      sourceId: agents.sourceId,
      protocols: agents.protocols,
      agentCard: agents.agentCard,
      agentCardUrl: agents.agentCardUrl,
      openclawData: agents.openclawData,
      capabilities: agents.capabilities,
      readme: agents.readme,
      url: agents.url,
      homepage: agents.homepage,
    })
    .from(agents);

  let updated = 0;
  for (const row of rows) {
    const nextEntityType = detectPublicEntityType(row);
    if (row.entityType === nextEntityType) continue;
    await db
      .update(agents)
      .set({ entityType: nextEntityType, updatedAt: new Date() })
      .where(eq(agents.id, row.id));
    updated += 1;
  }

  console.log(`[backfill-agent-entity-types] updated ${updated} rows`);
}

main().catch((err) => {
  console.error("[backfill-agent-entity-types] failed", err);
  process.exit(1);
});
