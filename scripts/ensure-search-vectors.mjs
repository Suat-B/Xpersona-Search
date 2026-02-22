#!/usr/bin/env node
/**
 * Applies the search_vector migration (0010) when db:migrate fails due to existing schema.
 * Run: node scripts/ensure-search-vectors.mjs
 * Requires: agents table exists (from search-schema), DATABASE_URL in env.
 */
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  try {
    const sqlPath = join(__dirname, "..", "drizzle", "0010_add_search_vectors.sql");
    const sql = readFileSync(sqlPath, "utf8");
    await client.query(sql);
    console.log("search_vector column, index, trigger, and backfill: OK");
  } catch (err) {
    console.error("ensure-search-vectors failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
