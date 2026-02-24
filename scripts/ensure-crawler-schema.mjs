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
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "visibility" varchar(16) DEFAULT 'PUBLIC' NOT NULL;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "public_searchable" boolean DEFAULT true NOT NULL;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "primary_image_url" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "media_asset_count" integer DEFAULT 0 NOT NULL;

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
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "github_requests" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "retry_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "rate_limit_wait_ms" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "skipped" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "cursor_snapshot" jsonb;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "worker_id" varchar(64);
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "heartbeat_at" timestamp with time zone;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "finished_reason" varchar(40);

CREATE INDEX IF NOT EXISTS "agents_visibility_idx" ON "agents" ("visibility");
CREATE INDEX IF NOT EXISTS "agents_public_searchable_idx" ON "agents" ("public_searchable");
CREATE INDEX IF NOT EXISTS "agents_primary_image_url_idx" ON "agents" ("primary_image_url");
CREATE INDEX IF NOT EXISTS "agents_media_asset_count_idx" ON "agents" ("media_asset_count");
CREATE INDEX IF NOT EXISTS "crawl_jobs_worker_id_idx" ON "crawl_jobs" ("worker_id");
CREATE INDEX IF NOT EXISTS "crawl_jobs_heartbeat_at_idx" ON "crawl_jobs" ("heartbeat_at");

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
  "license_guess" varchar(64),
  "is_public" boolean DEFAULT true NOT NULL,
  "quality_score" integer DEFAULT 0 NOT NULL,
  "safety_score" integer DEFAULT 0 NOT NULL,
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
