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
  "visibility" varchar(16) DEFAULT 'PUBLIC' NOT NULL,
  "public_searchable" boolean DEFAULT true NOT NULL,
  "primary_image_url" text,
  "media_asset_count" integer DEFAULT 0 NOT NULL,
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
CREATE INDEX IF NOT EXISTS "agents_visibility_idx" ON "agents" ("visibility");
CREATE INDEX IF NOT EXISTS "agents_public_searchable_idx" ON "agents" ("public_searchable");
CREATE INDEX IF NOT EXISTS "agents_primary_image_url_idx" ON "agents" ("primary_image_url");
CREATE INDEX IF NOT EXISTS "agents_media_asset_count_idx" ON "agents" ("media_asset_count");
`;

const SQL_CRAWL_JOBS = `
CREATE TABLE IF NOT EXISTS "crawl_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" varchar(32) NOT NULL,
  "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
  "worker_id" varchar(64),
  "started_at" timestamp with time zone,
  "heartbeat_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "finished_reason" varchar(40),
  "error" text,
  "agents_found" integer DEFAULT 0 NOT NULL,
  "agents_updated" integer DEFAULT 0 NOT NULL,
  "budget_used" integer DEFAULT 0 NOT NULL,
  "timeouts" integer DEFAULT 0 NOT NULL,
  "rate_limits" integer DEFAULT 0 NOT NULL,
  "github_requests" integer DEFAULT 0 NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "rate_limit_wait_ms" integer DEFAULT 0 NOT NULL,
  "skipped" integer DEFAULT 0 NOT NULL,
  "cursor_snapshot" jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crawl_jobs_status_idx" ON "crawl_jobs" ("status");
CREATE INDEX IF NOT EXISTS "crawl_jobs_created_at_idx" ON "crawl_jobs" ("created_at");
CREATE INDEX IF NOT EXISTS "crawl_jobs_worker_id_idx" ON "crawl_jobs" ("worker_id");
CREATE INDEX IF NOT EXISTS "crawl_jobs_heartbeat_at_idx" ON "crawl_jobs" ("heartbeat_at");
`;

const SQL_CRAWL_CHECKPOINTS = `
CREATE TABLE IF NOT EXISTS "crawl_checkpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" varchar(32) NOT NULL,
  "mode" varchar(16) DEFAULT 'backfill' NOT NULL,
  "cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "worker_id" varchar(64),
  "lease_expires_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "crawl_checkpoints_source_mode_idx"
  ON "crawl_checkpoints" ("source", "mode");
CREATE INDEX IF NOT EXISTS "crawl_checkpoints_worker_id_idx"
  ON "crawl_checkpoints" ("worker_id");
CREATE INDEX IF NOT EXISTS "crawl_checkpoints_updated_at_idx"
  ON "crawl_checkpoints" ("updated_at");
`;

const SQL_MEDIA_ASSETS = `
CREATE TABLE IF NOT EXISTS "agent_media_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "source" varchar(32) NOT NULL,
  "asset_kind" varchar(16) NOT NULL,
  "artifact_type" varchar(32),
  "url" text NOT NULL,
  "source_page_url" text,
  "sha256" varchar(64) NOT NULL,
  "mime_type" varchar(128),
  "width" integer,
  "height" integer,
  "byte_size" integer,
  "title" text,
  "caption" text,
  "alt_text" text,
  "context_text" text,
  "license_guess" varchar(64),
  "crawl_domain" varchar(255),
  "discovery_method" varchar(32),
  "url_norm_hash" varchar(64),
  "is_public" boolean DEFAULT true NOT NULL,
  "is_dead" boolean DEFAULT false NOT NULL,
  "dead_checked_at" timestamp with time zone,
  "quality_score" integer DEFAULT 0 NOT NULL,
  "safety_score" integer DEFAULT 0 NOT NULL,
  "rank_score" double precision DEFAULT 0 NOT NULL,
  "crawl_status" varchar(20) DEFAULT 'DISCOVERED' NOT NULL,
  "last_verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "agent_media_assets_sha_agent_idx"
  ON "agent_media_assets" ("sha256", "agent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_media_assets_url_agent_idx"
  ON "agent_media_assets" ("url", "agent_id");
CREATE INDEX IF NOT EXISTS "agent_media_assets_agent_id_idx"
  ON "agent_media_assets" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_media_assets_asset_kind_idx"
  ON "agent_media_assets" ("asset_kind");
CREATE INDEX IF NOT EXISTS "agent_media_assets_artifact_type_idx"
  ON "agent_media_assets" ("artifact_type");
CREATE INDEX IF NOT EXISTS "agent_media_assets_quality_score_idx"
  ON "agent_media_assets" ("quality_score");
CREATE INDEX IF NOT EXISTS "agent_media_assets_is_public_idx"
  ON "agent_media_assets" ("is_public");
CREATE INDEX IF NOT EXISTS "agent_media_assets_rank_score_idx"
  ON "agent_media_assets" ("rank_score");
CREATE INDEX IF NOT EXISTS "agent_media_assets_domain_source_idx"
  ON "agent_media_assets" ("crawl_domain", "source");
CREATE INDEX IF NOT EXISTS "agent_media_assets_asset_quality_updated_idx"
  ON "agent_media_assets" ("asset_kind", "quality_score", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_media_assets_url_norm_hash_idx"
  ON "agent_media_assets" ("url_norm_hash", "agent_id");
`;

const SQL_MEDIA_WEB_FRONTIER = `
CREATE TABLE IF NOT EXISTS "media_web_frontier" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "url" text NOT NULL UNIQUE,
  "domain" varchar(255) NOT NULL,
  "source" varchar(32) NOT NULL DEFAULT 'WEB',
  "discovered_from" text,
  "status" varchar(20) NOT NULL DEFAULT 'PENDING',
  "attempts" integer NOT NULL DEFAULT 0,
  "priority" integer NOT NULL DEFAULT 0,
  "lock_owner" varchar(64),
  "locked_at" timestamp with time zone,
  "next_attempt_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "media_web_frontier_status_idx"
  ON "media_web_frontier" ("status");
CREATE INDEX IF NOT EXISTS "media_web_frontier_domain_idx"
  ON "media_web_frontier" ("domain");
CREATE INDEX IF NOT EXISTS "media_web_frontier_priority_idx"
  ON "media_web_frontier" ("priority");
CREATE INDEX IF NOT EXISTS "media_web_frontier_next_attempt_at_idx"
  ON "media_web_frontier" ("next_attempt_at");
CREATE INDEX IF NOT EXISTS "media_web_frontier_lock_owner_idx"
  ON "media_web_frontier" ("lock_owner");
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

    await client.query(SQL_CRAWL_CHECKPOINTS);
    console.log("crawl_checkpoints table and indexes: OK");

    await client.query(SQL_MEDIA_ASSETS);
    console.log("agent_media_assets table and indexes: OK");

    await client.query(SQL_MEDIA_WEB_FRONTIER);
    console.log("media_web_frontier table and indexes: OK");

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
