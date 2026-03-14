#!/usr/bin/env npx tsx
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { agents, agentMediaAssets } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  normalizeCapabilityTokens,
  sanitizeCapabilityLabels,
} from "@/lib/search/capability-tokens";
import { canonicalizeSource } from "@/lib/search/source-taxonomy";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const batchSize = Math.max(50, Number(process.env.BACKFILL_BATCH_SIZE ?? "200"));

type AgentRow = {
  id: string;
  sourceId: string;
  source: string;
  capabilities: string[] | null;
};

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function loadBatch(offset: number): Promise<AgentRow[]> {
  return db
    .select({
      id: agents.id,
      sourceId: agents.sourceId,
      source: agents.source,
      capabilities: agents.capabilities,
    })
    .from(agents)
    .orderBy(agents.createdAt)
    .limit(batchSize)
    .offset(offset);
}

async function verifyCounts() {
  const sources = await db.execute(sql`
    SELECT source, count(*)::int AS count
    FROM agents
    WHERE source IN ('GITHUB_A2A', 'A2A_REGISTRY', 'MCP_REGISTRY', 'SMITHERY', 'DIFY_MARKETPLACE', 'N8N_TEMPLATES')
    GROUP BY source
    ORDER BY source
  `);
  const capabilityQuality = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE jsonb_array_length(coalesce(capability_tokens, '[]'::jsonb)) > 0) AS rows_with_tokens,
      count(*) FILTER (WHERE jsonb_array_length(coalesce(capabilities, '[]'::jsonb)) > 0) AS rows_with_capabilities
    FROM agents
  `);
  console.log("[taxonomy] source snapshot", (sources as { rows?: unknown[] }).rows ?? []);
  console.log("[taxonomy] capability snapshot", (capabilityQuality as { rows?: unknown[] }).rows ?? []);
}

async function main() {
  let offset = 0;
  let changedAgents = 0;
  let changedSources = 0;
  let changedCapabilities = 0;
  let changedCapabilityTokens = 0;

  while (true) {
    const rows = await loadBatch(offset);
    if (rows.length === 0) break;

    for (const row of rows) {
      const rawCapabilities = sanitizeCapabilityLabels(row.capabilities ?? []);
      const capabilityTokens = normalizeCapabilityTokens(rawCapabilities);
      const canonicalSource = canonicalizeSource(row.source, row.sourceId);
      const currentCapabilities = Array.isArray(row.capabilities) ? row.capabilities : [];

      const sourceChanged = canonicalSource !== row.source;
      const capabilitiesChanged = !arraysEqual(rawCapabilities, currentCapabilities);

      let currentCapabilityTokens: string[] = [];
      try {
        const [tokenRow] = await db
          .select({ capabilityTokens: agents.capabilityTokens })
          .from(agents)
          .where(eq(agents.id, row.id))
          .limit(1);
        currentCapabilityTokens = Array.isArray(tokenRow?.capabilityTokens)
          ? tokenRow.capabilityTokens
          : [];
      } catch {
        currentCapabilityTokens = [];
      }

      const capabilityTokensChanged = !arraysEqual(capabilityTokens, currentCapabilityTokens);
      if (!sourceChanged && !capabilitiesChanged && !capabilityTokensChanged) continue;

      changedAgents += 1;
      if (sourceChanged) changedSources += 1;
      if (capabilitiesChanged) changedCapabilities += 1;
      if (capabilityTokensChanged) changedCapabilityTokens += 1;

      if (apply) {
        await db
          .update(agents)
          .set({
            source: canonicalSource,
            capabilities: rawCapabilities,
            capabilityTokens,
            updatedAt: new Date(),
          })
          .where(eq(agents.id, row.id));
      }
    }

    offset += rows.length;
    console.log(
      `[taxonomy] scanned=${offset} changed=${changedAgents} sources=${changedSources} capabilities=${changedCapabilities} tokens=${changedCapabilityTokens}`
    );
  }

  if (apply) {
    await db.execute(sql`
      UPDATE ${agentMediaAssets} AS media
      SET source = CASE
        WHEN lower(agent.source_id) LIKE 'a2a:%' THEN 'A2A_REGISTRY'
        WHEN lower(agent.source_id) LIKE 'smithery:%' THEN 'SMITHERY'
        WHEN lower(agent.source_id) LIKE 'dify:%' THEN 'DIFY_MARKETPLACE'
        WHEN lower(agent.source_id) LIKE 'n8n:%' THEN 'N8N_TEMPLATES'
        WHEN lower(agent.source_id) LIKE 'langflow:%' THEN 'LANGFLOW_STARTER_PROJECTS'
        WHEN lower(agent.source_id) LIKE 'nacos:%' THEN 'NACOS_AGENT_REGISTRY'
        ELSE upper(agent.source)
      END,
      updated_at = now()
      FROM ${agents} AS agent
      WHERE agent.id = media.agent_id
        AND media.source <> CASE
          WHEN lower(agent.source_id) LIKE 'a2a:%' THEN 'A2A_REGISTRY'
          WHEN lower(agent.source_id) LIKE 'smithery:%' THEN 'SMITHERY'
          WHEN lower(agent.source_id) LIKE 'dify:%' THEN 'DIFY_MARKETPLACE'
          WHEN lower(agent.source_id) LIKE 'n8n:%' THEN 'N8N_TEMPLATES'
          WHEN lower(agent.source_id) LIKE 'langflow:%' THEN 'LANGFLOW_STARTER_PROJECTS'
          WHEN lower(agent.source_id) LIKE 'nacos:%' THEN 'NACOS_AGENT_REGISTRY'
          ELSE upper(agent.source)
        END
    `);
  }

  console.log(
    `[taxonomy] mode=${apply ? "apply" : "dry-run"} changedAgents=${changedAgents} changedSources=${changedSources} changedCapabilities=${changedCapabilities} changedCapabilityTokens=${changedCapabilityTokens}`
  );
  await verifyCounts();
}

main().catch((err) => {
  console.error("[taxonomy] failed", err);
  process.exit(1);
});
