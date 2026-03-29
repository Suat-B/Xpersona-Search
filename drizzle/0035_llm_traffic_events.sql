CREATE TABLE IF NOT EXISTS "llm_traffic_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type" varchar(32) NOT NULL,
  "path" varchar(2048) NOT NULL,
  "page_type" varchar(64),
  "bot_name" varchar(64),
  "referrer_host" varchar(255),
  "referrer_source" varchar(64),
  "utm_source" varchar(255),
  "session_id" varchar(128),
  "conversion_type" varchar(64),
  "user_agent" varchar(512) NOT NULL,
  "client_ip" varchar(128),
  "referer" varchar(512),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "llm_traffic_events_created_at_idx"
  ON "llm_traffic_events" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "llm_traffic_events_event_type_idx"
  ON "llm_traffic_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "llm_traffic_events_path_idx"
  ON "llm_traffic_events" USING btree ("path");
CREATE INDEX IF NOT EXISTS "llm_traffic_events_page_type_idx"
  ON "llm_traffic_events" USING btree ("page_type");
CREATE INDEX IF NOT EXISTS "llm_traffic_events_bot_name_idx"
  ON "llm_traffic_events" USING btree ("bot_name");
CREATE INDEX IF NOT EXISTS "llm_traffic_events_referrer_source_idx"
  ON "llm_traffic_events" USING btree ("referrer_source");
CREATE INDEX IF NOT EXISTS "llm_traffic_events_session_id_idx"
  ON "llm_traffic_events" USING btree ("session_id");
