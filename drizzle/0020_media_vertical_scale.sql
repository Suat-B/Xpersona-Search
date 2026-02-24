ALTER TABLE "agent_media_assets" ADD COLUMN IF NOT EXISTS "context_text" text;
ALTER TABLE "agent_media_assets" ADD COLUMN IF NOT EXISTS "crawl_domain" varchar(255);
ALTER TABLE "agent_media_assets" ADD COLUMN IF NOT EXISTS "discovery_method" varchar(32);
ALTER TABLE "agent_media_assets" ADD COLUMN IF NOT EXISTS "url_norm_hash" varchar(64);
ALTER TABLE "agent_media_assets" ADD COLUMN IF NOT EXISTS "is_dead" boolean DEFAULT false NOT NULL;
ALTER TABLE "agent_media_assets" ADD COLUMN IF NOT EXISTS "dead_checked_at" timestamp with time zone;
ALTER TABLE "agent_media_assets" ADD COLUMN IF NOT EXISTS "rank_score" double precision DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "agent_media_assets_rank_score_idx"
  ON "agent_media_assets" ("rank_score");
CREATE INDEX IF NOT EXISTS "agent_media_assets_domain_source_idx"
  ON "agent_media_assets" ("crawl_domain", "source");
CREATE INDEX IF NOT EXISTS "agent_media_assets_asset_quality_updated_idx"
  ON "agent_media_assets" ("asset_kind", "quality_score", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_media_assets_url_norm_hash_idx"
  ON "agent_media_assets" ("url_norm_hash", "agent_id");

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
