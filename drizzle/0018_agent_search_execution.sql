CREATE TABLE IF NOT EXISTS "search_outcomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "query_signature" varchar(64) NOT NULL,
  "agent_id" uuid NOT NULL,
  "task_type" varchar(32) NOT NULL DEFAULT 'general',
  "attempts" integer NOT NULL DEFAULT 0,
  "success_count" integer NOT NULL DEFAULT 0,
  "failure_count" integer NOT NULL DEFAULT 0,
  "timeout_count" integer NOT NULL DEFAULT 0,
  "last_outcome_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "search_outcomes_signature_agent_task_idx"
  ON "search_outcomes" ("query_signature", "agent_id", "task_type");
CREATE INDEX IF NOT EXISTS "search_outcomes_agent_id_idx"
  ON "search_outcomes" ("agent_id");
CREATE INDEX IF NOT EXISTS "search_outcomes_last_outcome_at_idx"
  ON "search_outcomes" ("last_outcome_at");

CREATE TABLE IF NOT EXISTS "agent_execution_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" uuid NOT NULL UNIQUE,
  "observed_latency_ms_p50" integer,
  "observed_latency_ms_p95" integer,
  "estimated_cost_usd" double precision,
  "uptime_30d" double precision,
  "rate_limit_rpm" integer,
  "rate_limit_burst" integer,
  "last_verified_at" timestamp with time zone,
  "verification_source" varchar(40),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_execution_metrics_agent_id_idx"
  ON "agent_execution_metrics" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_execution_metrics_updated_at_idx"
  ON "agent_execution_metrics" ("updated_at");

CREATE TABLE IF NOT EXISTS "agent_capability_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" uuid NOT NULL UNIQUE,
  "auth_modes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "requires" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "forbidden" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "data_region" varchar(16),
  "input_schema_ref" varchar(1024),
  "output_schema_ref" varchar(1024),
  "supports_streaming" boolean NOT NULL DEFAULT false,
  "supports_mcp" boolean NOT NULL DEFAULT false,
  "supports_a2a" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_capability_contracts_agent_id_idx"
  ON "agent_capability_contracts" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_capability_contracts_data_region_idx"
  ON "agent_capability_contracts" ("data_region");
