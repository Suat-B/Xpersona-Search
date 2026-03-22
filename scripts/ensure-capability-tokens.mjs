#!/usr/bin/env node
/**
 * Adds agents.capability_tokens (search taxonomy) when migrations are behind.
 * Fixes: column "capability_tokens" does not exist (e.g. claim routes using select() on agents).
 *
 * Run: node scripts/ensure-capability-tokens.mjs
 * Requires: DATABASE_URL in .env.local (or env)
 */
import pg from "pg";
import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

config({ path: ".env.local" });
config({ path: ".env" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sqlPath = join(__dirname, "..", "drizzle", "0030_search_taxonomy.sql");
if (!existsSync(sqlPath)) {
  console.error(`Missing ${sqlPath}`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

async function main() {
  const sql = readFileSync(sqlPath, "utf8");
  await client.connect();
  try {
    await client.query(sql);
    console.log("capability_tokens column + backfill + GIN index: OK");
  } catch (err) {
    console.error("ensure-capability-tokens failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
