#!/usr/bin/env node
/**
 * Ensures agents and crawl_jobs tables exist (from search-schema).
 * Use when db:migrate fails due to partial schema (e.g. "accounts already exists")
 * and db:push is inconvenient.
 *
 * Run: node scripts/ensure-agents-table.mjs
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

const SQL_AGENTS = `
CREATE TABLE IF NOT EXISTS "agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" varchar(255) NOT NULL,
  "source" varchar(32) DEFAULT 'GITHUB_OPENCLEW' NOT NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL,
  "description" text,
  "url" varchar(1024) NOT NULL,
  "homepage" varchar(1024),
  "agent_card" jsonb,
  "agent_card_url" varchar(1024),
  "capabilities" jsonb DEFAULT '[]'::jsonb,
  "protocols" jsonb DEFAULT '[]'::jsonb,
  "languages" jsonb DEFAULT '[]'::jsonb,
  "github_data" jsonb,
  "npm_data" jsonb,
  "openclaw_data" jsonb,
  "readme" text,
  "code_snippets" jsonb DEFAULT '[]'::jsonb,
  "safety_score" integer DEFAULT 0 NOT NULL,
  "popularity_score" integer DEFAULT 0 NOT NULL,
  "freshness_score" integer DEFAULT 0 NOT NULL,
  "performance_score" integer DEFAULT 0 NOT NULL,
  "overall_rank" double precision DEFAULT 0 NOT NULL,
  "verified" boolean DEFAULT false,
  "verified_at" timestamp with time zone,
  "status" varchar(24) DEFAULT 'DISCOVERED' NOT NULL,
  "last_crawled_at" timestamp with time zone NOT NULL,
  "last_indexed_at" timestamp with time zone,
  "next_crawl_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "agents_source_id_unique" UNIQUE("source_id"),
  CONSTRAINT "agents_slug_unique" UNIQUE("slug")
);
`;

const SQL_AGENTS_IDX = `
CREATE UNIQUE INDEX IF NOT EXISTS "agents_source_id_idx" ON "agents" ("source_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agents_slug_idx" ON "agents" ("slug");
CREATE INDEX IF NOT EXISTS "agents_status_idx" ON "agents" ("status");
CREATE INDEX IF NOT EXISTS "agents_overall_rank_idx" ON "agents" ("overall_rank");
`;

const SQL_CRAWL_JOBS = `
CREATE TABLE IF NOT EXISTS "crawl_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" varchar(32) NOT NULL,
  "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "error" text,
  "agents_found" integer DEFAULT 0 NOT NULL,
  "agents_updated" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crawl_jobs_status_idx" ON "crawl_jobs" ("status");
CREATE INDEX IF NOT EXISTS "crawl_jobs_created_at_idx" ON "crawl_jobs" ("created_at");
`;

const SQL_SEARCH_VECTOR = `
ALTER TABLE agents ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS agents_search_vector_idx ON agents USING GIN (search_vector);
CREATE OR REPLACE FUNCTION agents_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.readme, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS agents_search_vector_trigger ON agents;
CREATE TRIGGER agents_search_vector_trigger
  BEFORE INSERT OR UPDATE ON agents
  FOR EACH ROW EXECUTE PROCEDURE agents_search_vector_trigger();
UPDATE agents SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(readme, '')), 'C')
WHERE search_vector IS NULL;
`;

async function main() {
  await client.connect();
  try {
    await client.query(SQL_AGENTS);
    console.log("agents table: OK");

    await client.query(SQL_AGENTS_IDX);
    console.log("agents indexes: OK");

    await client.query(SQL_CRAWL_JOBS);
    console.log("crawl_jobs table and indexes: OK");

    await client.query(SQL_SEARCH_VECTOR);
    console.log("search_vector column, index, trigger: OK");

    console.log("\n✅ Agents and crawl_jobs schema ready. Run 'npm run crawl' to populate.");
  } catch (err) {
    console.error("ensure-agents-table failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
