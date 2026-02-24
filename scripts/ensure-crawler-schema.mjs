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
  "repo_full_name" varchar(255),
  "origin_source" varchar(64),
  "discovery_at" timestamp with time zone DEFAULT now(),
  "confidence" integer DEFAULT 0 NOT NULL,
  "reasons" jsonb DEFAULT '[]'::jsonb,
  "discovered_from" uuid,
  "priority" integer DEFAULT 0 NOT NULL,
  "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "last_error" text,
  "lock_owner" varchar(64),
  "locked_at" timestamp with time zone,
  "last_attempt_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);

-- Add hybrid/frontier columns for existing tables
ALTER TABLE "crawl_frontier" ADD COLUMN IF NOT EXISTS "repo_full_name" varchar(255);
ALTER TABLE "crawl_frontier" ADD COLUMN IF NOT EXISTS "origin_source" varchar(64);
ALTER TABLE "crawl_frontier" ADD COLUMN IF NOT EXISTS "discovery_at" timestamp with time zone DEFAULT now();
ALTER TABLE "crawl_frontier" ADD COLUMN IF NOT EXISTS "confidence" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_frontier" ADD COLUMN IF NOT EXISTS "reasons" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "crawl_frontier" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone;
ALTER TABLE "crawl_frontier" ADD COLUMN IF NOT EXISTS "last_error" text;
ALTER TABLE "crawl_frontier" ADD COLUMN IF NOT EXISTS "lock_owner" varchar(64);
ALTER TABLE "crawl_frontier" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone;

-- Add indexes after columns are guaranteed to exist
CREATE INDEX IF NOT EXISTS "crawl_frontier_status_idx" ON "crawl_frontier" ("status");
CREATE INDEX IF NOT EXISTS "crawl_frontier_priority_idx" ON "crawl_frontier" ("priority");
CREATE INDEX IF NOT EXISTS "crawl_frontier_confidence_idx" ON "crawl_frontier" ("confidence");
CREATE INDEX IF NOT EXISTS "crawl_frontier_repo_full_name_idx" ON "crawl_frontier" ("repo_full_name");
CREATE INDEX IF NOT EXISTS "crawl_frontier_next_attempt_at_idx" ON "crawl_frontier" ("next_attempt_at");

ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "budget_used" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "timeouts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "rate_limits" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "skipped" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "cursor_snapshot" jsonb;
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
