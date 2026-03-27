CREATE TABLE IF NOT EXISTS "dashboard_access_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "path" varchar(2048) NOT NULL,
  "outcome" varchar(32) NOT NULL,
  "user_agent" varchar(512) NOT NULL,
  "client_ip" varchar(128),
  "referer" varchar(512),
  "bot_label" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "dashboard_access_events_created_at_idx"
  ON "dashboard_access_events" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "dashboard_access_events_path_idx"
  ON "dashboard_access_events" USING btree ("path");
CREATE INDEX IF NOT EXISTS "dashboard_access_events_outcome_idx"
  ON "dashboard_access_events" USING btree ("outcome");
