ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "primary_image_url" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "media_asset_count" integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "agents_primary_image_url_idx" ON "agents" ("primary_image_url");
CREATE INDEX IF NOT EXISTS "agents_media_asset_count_idx" ON "agents" ("media_asset_count");

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
