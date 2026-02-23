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
