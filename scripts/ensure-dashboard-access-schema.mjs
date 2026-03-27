#!/usr/bin/env node
/**
 * Idempotent: creates dashboard_access_events when drizzle-kit migrate cannot run
 * (e.g. migration journal out of sync with an existing database).
 *
 * Usage: npm run db:ensure-dashboard-access-schema
 */
import { config } from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env.local") });

const url = String(process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("DATABASE_URL is missing. Set it in .env.local.");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const path = join(root, "drizzle", "0034_dashboard_access_events.sql");
    const sql = readFileSync(path, "utf8");
    process.stdout.write("Applying 0034_dashboard_access_events.sql... ");
    await client.query(sql);
    console.log("ok");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
