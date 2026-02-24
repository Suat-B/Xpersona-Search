ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "visibility" varchar(16) DEFAULT 'PUBLIC' NOT NULL;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "public_searchable" boolean DEFAULT true NOT NULL;
CREATE INDEX IF NOT EXISTS "agents_visibility_idx" ON "agents" ("visibility");
CREATE INDEX IF NOT EXISTS "agents_public_searchable_idx" ON "agents" ("public_searchable");

ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "worker_id" varchar(64);
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "heartbeat_at" timestamp with time zone;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "finished_reason" varchar(40);
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "github_requests" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "retry_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawl_jobs" ADD COLUMN IF NOT EXISTS "rate_limit_wait_ms" integer DEFAULT 0 NOT NULL;
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
