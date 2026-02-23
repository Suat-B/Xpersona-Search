#!/usr/bin/env node
/**
 * Adds crawler expansion columns and crawl_frontier table.
 * Fixes: "column canonical_agent_id of relation agents does not exist"
 *
 * Run: node scripts/ensure-crawler-schema.mjs
 * Requires: DATABASE_URL in .env.local
 */
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set in .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

const SQL = `
-- Add cross-source deduplication columns to agents
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "canonical_agent_id" uuid;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "aliases" jsonb DEFAULT '[]'::jsonb;

-- Create crawl_frontier table for recursive discovery
CREATE TABLE IF NOT EXISTS "crawl_frontier" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "url" varchar(2048) NOT NULL UNIQUE,
  "discovered_from" uuid,
  "priority" integer DEFAULT 0 NOT NULL,
  "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crawl_frontier_status_idx" ON "crawl_frontier" ("status");
CREATE INDEX IF NOT EXISTS "crawl_frontier_priority_idx" ON "crawl_frontier" ("priority");
`;

async function main() {
  await client.connect();
  try {
    await client.query(SQL);
    console.log("✅ canonical_agent_id, aliases, and crawl_frontier added.");
  } catch (err) {
    console.error("ensure-crawler-schema failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
