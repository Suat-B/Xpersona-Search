/**
 * Backfills semantic embeddings for ACTIVE agents.
 *
 * Usage:
 *   npx tsx scripts/backfill-agent-embeddings.ts
 *   npx tsx scripts/backfill-agent-embeddings.ts --batch=80
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import { agents } from "../lib/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { getEmbeddingProvider } from "../lib/search/semantic/config";
import { vectorToSqlLiteral } from "../lib/search/semantic/provider";

const DEFAULT_BATCH = 80;

function parseBatchArg(): number {
  const found = process.argv.find((arg) => arg.startsWith("--batch="));
  if (!found) return DEFAULT_BATCH;
  const raw = Number(found.split("=")[1]);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_BATCH;
  return Math.min(250, Math.max(10, Math.floor(raw)));
}

function hashContent(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function toSearchableContent(row: {
  name: string;
  description: string | null;
  readme: string | null;
  capabilities: string[] | null;
  protocols: string[] | null;
  languages: string[] | null;
}): string {
  const parts = [
    row.name,
    row.description ?? "",
    row.readme ?? "",
    ...(row.capabilities ?? []),
    ...(row.protocols ?? []),
    ...(row.languages ?? []),
  ];
  return parts.join("\n").replace(/\s+/g, " ").trim();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const provider = getEmbeddingProvider();
  if (!provider) {
    console.warn("Embedding provider unavailable. Set OPENAI_API_KEY to run backfill.");
    process.exit(0);
  }

  const batchSize = parseBatchArg();
  let cursor = 0;
  let totalSeen = 0;
  let totalEmbedded = 0;
  let totalSkipped = 0;

  while (true) {
    const rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        description: agents.description,
        readme: agents.readme,
        capabilities: agents.capabilities,
        protocols: agents.protocols,
        languages: agents.languages,
      })
      .from(agents)
      .where(eq(agents.status, "ACTIVE"))
      .orderBy(asc(agents.createdAt), asc(agents.id))
      .limit(batchSize)
      .offset(cursor);

    if (rows.length === 0) break;
    cursor += rows.length;
    totalSeen += rows.length;

    const idSql = sql.join(
      rows.map((row) => sql`${row.id}::uuid`),
      sql`, `
    );
    const existingRows = await db.execute(
      sql`SELECT agent_id, content_hash
          FROM agent_embeddings
          WHERE provider = ${provider.provider}
            AND model = ${provider.model}
            AND agent_id IN (${idSql})`
    );
    const existing = new Map<string, string>();
    for (const row of (existingRows as unknown as { rows?: Array<{ agent_id: string; content_hash: string }> }).rows ?? []) {
      existing.set(row.agent_id, row.content_hash);
    }

    const toEmbed = rows
      .map((row) => {
        const content = toSearchableContent(row);
        return {
          ...row,
          content,
          contentHash: hashContent(content),
        };
      })
      .filter((row) => {
        const prev = existing.get(row.id);
        return prev !== row.contentHash && row.content.length > 0;
      });

    totalSkipped += rows.length - toEmbed.length;
    if (toEmbed.length === 0) {
      console.log(`Batch ${cursor / batchSize}: skipped (all up-to-date)`);
      continue;
    }

    const vectors = await provider.embed(toEmbed.map((row) => row.content));

    for (let i = 0; i < toEmbed.length; i += 1) {
      const row = toEmbed[i];
      const vector = vectors[i];
      await db.execute(
        sql`INSERT INTO agent_embeddings (
              id, agent_id, provider, model, dimensions, embedding, content_hash, created_at, updated_at
            )
            VALUES (
              gen_random_uuid(),
              ${row.id}::uuid,
              ${provider.provider},
              ${provider.model},
              ${provider.dimensions},
              ${vectorToSqlLiteral(vector)}::vector,
              ${row.contentHash},
              now(),
              now()
            )
            ON CONFLICT (agent_id, provider, model)
            DO UPDATE SET
              dimensions = EXCLUDED.dimensions,
              embedding = EXCLUDED.embedding,
              content_hash = EXCLUDED.content_hash,
              updated_at = now()
            WHERE agent_embeddings.content_hash IS DISTINCT FROM EXCLUDED.content_hash`
      );
    }

    totalEmbedded += toEmbed.length;
    console.log(
      `Batch ${Math.ceil(cursor / batchSize)}: embedded ${toEmbed.length}/${rows.length} (seen ${totalSeen})`
    );
  }

  console.log(
    `Embedding backfill complete. seen=${totalSeen}, embedded=${totalEmbedded}, skipped=${totalSkipped}, provider=${provider.provider}, model=${provider.model}`
  );
}

main().catch((err) => {
  console.error("Embedding backfill failed:", err);
  process.exit(1);
});

