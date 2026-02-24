#!/usr/bin/env npx tsx
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("@/lib/db");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { agents, agentCapabilityContracts } = require("@/lib/db/schema");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sql } = require("drizzle-orm");

function toTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
    .filter(Boolean);
}

function inferAuthModes(agent: {
  protocols: unknown;
  source: string;
  readme: string | null;
}): string[] {
  const modes = new Set<string>();
  const protocols = toTokens(agent.protocols);
  if (protocols.includes("mcp")) modes.add("mcp");
  if (protocols.includes("a2a")) modes.add("a2a");
  if (agent.source.includes("GITHUB")) modes.add("api_key");
  if ((agent.readme ?? "").toLowerCase().includes("oauth")) modes.add("oauth");
  if (modes.size === 0) modes.add("api_key");
  return [...modes];
}

function inferRequires(agent: {
  protocols: unknown;
  languages: unknown;
  readme: string | null;
}): string[] {
  const req = new Set<string>();
  const protocols = toTokens(agent.protocols);
  const languages = toTokens(agent.languages);
  for (const p of protocols) req.add(p);
  for (const l of languages) req.add(`lang:${l}`);
  const readme = (agent.readme ?? "").toLowerCase();
  if (readme.includes("stream")) req.add("streaming");
  return [...req];
}

function inferForbidden(agent: { readme: string | null }): string[] {
  const readme = (agent.readme ?? "").toLowerCase();
  const deny = new Set<string>();
  if (readme.includes("not for production")) deny.add("production");
  if (readme.includes("experimental")) deny.add("high_risk");
  return [...deny];
}

async function main() {
  const batchSize = Math.max(50, Number(process.env.BACKFILL_BATCH_SIZE ?? "200"));
  const limit = Number(process.env.BACKFILL_LIMIT ?? "0");
  let offset = 0;
  let updated = 0;

  while (true) {
    const rows = await db
      .select({
        id: agents.id,
        source: agents.source,
        protocols: agents.protocols,
        languages: agents.languages,
        readme: agents.readme,
        url: agents.url,
        homepage: agents.homepage,
      })
      .from(agents)
      .where(sql`${agents.status} = 'ACTIVE'`)
      .limit(batchSize)
      .offset(offset);

    if (rows.length === 0) break;
    for (const row of rows) {
      const authModes = inferAuthModes(row);
      const requires = inferRequires(row);
      const forbidden = inferForbidden(row);
    const supportsMcp = requires.includes("mcp");
    const supportsA2a = requires.includes("a2a");
    const supportsStreaming = requires.includes("streaming");
    const inputSchemaRef = `${row.url}#input`;
    const outputSchemaRef = `${row.url}#output`;

      await db
        .insert(agentCapabilityContracts)
      .values({
        agentId: row.id,
        authModes,
        requires,
        forbidden,
        dataRegion: "global",
        inputSchemaRef,
        outputSchemaRef,
        supportsMcp,
        supportsA2a,
        supportsStreaming,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: agentCapabilityContracts.agentId,
        set: {
          authModes,
          requires,
          forbidden,
          dataRegion: "global",
          inputSchemaRef,
          outputSchemaRef,
          supportsMcp,
          supportsA2a,
          supportsStreaming,
          updatedAt: new Date(),
        },
        });
      updated++;
      if (updated % 200 === 0) {
        console.log(`[backfill-agent-contracts] processed=${updated}`);
      }
      if (limit > 0 && updated >= limit) {
        console.log(`[backfill-agent-contracts] limit reached=${updated}`);
        console.log(`[backfill-agent-contracts] updated=${updated}`);
        return;
      }
    }
    offset += rows.length;
  }

  console.log(`[backfill-agent-contracts] updated=${updated}`);
}

main().catch((err) => {
  console.error("[backfill-agent-contracts] failed", err);
  process.exit(1);
});
