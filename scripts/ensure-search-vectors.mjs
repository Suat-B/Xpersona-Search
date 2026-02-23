#!/usr/bin/env node
/**
 * Applies search-related migrations (0010, 0012, 0013) when db:migrate fails
 * due to existing schema. Run: node scripts/ensure-search-vectors.mjs
 * Requires: agents table exists (from search-schema), DATABASE_URL in env.
 */
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

const MIGRATIONS = [
  { file: "0010_add_search_vectors.sql", label: "search_vector column, index, trigger, and backfill" },
  { file: "0012_expand_search_vectors.sql", label: "expanded search_vector trigger (capabilities, protocols, languages) + backfill" },
  { file: "0013_add_trigram_index.sql", label: "pg_trgm extension and trigram GIN indexes" },
];

async function main() {
  await client.connect();
  try {
    for (const m of MIGRATIONS) {
      const sqlPath = join(__dirname, "..", "drizzle", m.file);
      if (!existsSync(sqlPath)) {
        console.warn(`Skipping ${m.file}: file not found`);
        continue;
      }
      const sql = readFileSync(sqlPath, "utf8");
      await client.query(sql);
      console.log(`${m.label}: OK`);
    }
  } catch (err) {
    console.error("ensure-search-vectors failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
