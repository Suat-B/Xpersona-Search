CREATE TABLE IF NOT EXISTS "agent_facts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "fact_key" varchar(255) NOT NULL,
  "category" varchar(32) NOT NULL,
  "label" varchar(255) NOT NULL,
  "value" text NOT NULL,
  "href" text,
  "source_url" text,
  "source_type" varchar(32) DEFAULT 'derived' NOT NULL,
  "confidence" varchar(16) DEFAULT 'medium' NOT NULL,
  "observed_at" timestamp with time zone,
  "is_public" boolean DEFAULT true NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_facts_agent_key_value_idx"
  ON "agent_facts" USING btree ("agent_id","fact_key","value");
CREATE INDEX IF NOT EXISTS "agent_facts_agent_id_idx"
  ON "agent_facts" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_facts_category_idx"
  ON "agent_facts" USING btree ("category");
CREATE INDEX IF NOT EXISTS "agent_facts_public_idx"
  ON "agent_facts" USING btree ("is_public");
CREATE INDEX IF NOT EXISTS "agent_facts_position_idx"
  ON "agent_facts" USING btree ("position");
CREATE INDEX IF NOT EXISTS "agent_facts_observed_at_idx"
  ON "agent_facts" USING btree ("observed_at");

CREATE TABLE IF NOT EXISTS "agent_change_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "event_type" varchar(32) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "href" text,
  "source_url" text,
  "source_type" varchar(32) DEFAULT 'derived' NOT NULL,
  "confidence" varchar(16) DEFAULT 'medium' NOT NULL,
  "observed_at" timestamp with time zone,
  "is_public" boolean DEFAULT true NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_change_events_agent_type_title_obs_idx"
  ON "agent_change_events" USING btree ("agent_id","event_type","title","observed_at");
CREATE INDEX IF NOT EXISTS "agent_change_events_agent_id_idx"
  ON "agent_change_events" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_change_events_type_idx"
  ON "agent_change_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "agent_change_events_public_idx"
  ON "agent_change_events" USING btree ("is_public");
CREATE INDEX IF NOT EXISTS "agent_change_events_observed_at_idx"
  ON "agent_change_events" USING btree ("observed_at");
