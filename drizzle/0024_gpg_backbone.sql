CREATE TABLE IF NOT EXISTS "gpg_task_clusters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(191) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "normalized_label" varchar(255) NOT NULL,
  "signature_hash" varchar(64) NOT NULL,
  "task_type" varchar(32) DEFAULT 'general' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "embedding" jsonb,
  "volume_30d" integer DEFAULT 0 NOT NULL,
  "median_budget_usd" double precision,
  "run_count_total" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gpg_task_clusters_slug_unique" UNIQUE("slug"),
  CONSTRAINT "gpg_task_clusters_signature_hash_unique" UNIQUE("signature_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_task_clusters_task_type_idx" ON "gpg_task_clusters" ("task_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_task_clusters_volume_30d_idx" ON "gpg_task_clusters" ("volume_30d");

CREATE TABLE IF NOT EXISTS "gpg_task_signatures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "raw_text" text NOT NULL,
  "normalized_text" text NOT NULL,
  "text_hash" varchar(64) NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "embedding" jsonb,
  "task_type" varchar(32) DEFAULT 'general' NOT NULL,
  "difficulty" integer,
  "risk_level" integer,
  "cluster_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_task_signatures_cluster_id_idx" ON "gpg_task_signatures" ("cluster_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_task_signatures_text_hash_idx" ON "gpg_task_signatures" ("text_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_task_signatures_task_type_idx" ON "gpg_task_signatures" ("task_type");

CREATE TABLE IF NOT EXISTS "gpg_agent_cluster_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "cluster_id" uuid NOT NULL,
  "success_rate_30d" double precision DEFAULT 0 NOT NULL,
  "failure_rate_30d" double precision DEFAULT 0 NOT NULL,
  "dispute_rate_90d" double precision DEFAULT 0 NOT NULL,
  "avg_quality_30d" double precision DEFAULT 0 NOT NULL,
  "calib_error_30d" double precision DEFAULT 0 NOT NULL,
  "p50_latency_ms_30d" double precision DEFAULT 0 NOT NULL,
  "p95_latency_ms_30d" double precision DEFAULT 0 NOT NULL,
  "avg_cost_30d" double precision DEFAULT 0 NOT NULL,
  "run_count_30d" integer DEFAULT 0 NOT NULL,
  "verified_run_count_30d" integer DEFAULT 0 NOT NULL,
  "bayes_success_30d" double precision DEFAULT 0 NOT NULL,
  "risk_score_30d" double precision DEFAULT 1 NOT NULL,
  "last_window_start" timestamp with time zone,
  "last_window_end" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gpg_agent_cluster_stats_agent_cluster_unique" UNIQUE("agent_id", "cluster_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_agent_cluster_stats_cluster_idx" ON "gpg_agent_cluster_stats" ("cluster_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_agent_cluster_stats_agent_idx" ON "gpg_agent_cluster_stats" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_agent_cluster_stats_bayes_idx" ON "gpg_agent_cluster_stats" ("bayes_success_30d");

CREATE TABLE IF NOT EXISTS "gpg_pipeline_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" varchar(64),
  "cluster_id" uuid,
  "agent_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "path_hash" varchar(64) NOT NULL,
  "status" varchar(16) NOT NULL,
  "latency_ms" integer NOT NULL,
  "cost_usd" double precision DEFAULT 0 NOT NULL,
  "quality_score" double precision,
  "confidence" double precision,
  "failure_type" varchar(32),
  "metadata" jsonb,
  "is_verified" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_pipeline_runs_cluster_idx" ON "gpg_pipeline_runs" ("cluster_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_pipeline_runs_path_hash_idx" ON "gpg_pipeline_runs" ("path_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_pipeline_runs_status_idx" ON "gpg_pipeline_runs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_pipeline_runs_created_idx" ON "gpg_pipeline_runs" ("created_at");

CREATE TABLE IF NOT EXISTS "gpg_pipeline_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cluster_id" uuid NOT NULL,
  "path_hash" varchar(64) NOT NULL,
  "agent_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "success_rate_30d" double precision DEFAULT 0 NOT NULL,
  "bayes_success_30d" double precision DEFAULT 0 NOT NULL,
  "p50_latency_ms_30d" double precision DEFAULT 0 NOT NULL,
  "p95_latency_ms_30d" double precision DEFAULT 0 NOT NULL,
  "avg_cost_30d" double precision DEFAULT 0 NOT NULL,
  "avg_quality_30d" double precision DEFAULT 0 NOT NULL,
  "run_count_30d" integer DEFAULT 0 NOT NULL,
  "risk_score_30d" double precision DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gpg_pipeline_stats_cluster_path_unique" UNIQUE("cluster_id", "path_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_pipeline_stats_cluster_idx" ON "gpg_pipeline_stats" ("cluster_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_pipeline_stats_bayes_idx" ON "gpg_pipeline_stats" ("bayes_success_30d");

CREATE TABLE IF NOT EXISTS "gpg_agent_collaboration_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_agent_id" uuid NOT NULL,
  "to_agent_id" uuid NOT NULL,
  "cluster_id" uuid,
  "weight_30d" integer DEFAULT 0 NOT NULL,
  "success_weight_30d" double precision DEFAULT 0 NOT NULL,
  "failure_weight_30d" double precision DEFAULT 0 NOT NULL,
  "last_seen_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gpg_agent_collab_from_to_cluster_unique" UNIQUE("from_agent_id", "to_agent_id", "cluster_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_agent_collab_from_idx" ON "gpg_agent_collaboration_edges" ("from_agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_agent_collab_to_idx" ON "gpg_agent_collaboration_edges" ("to_agent_id");

CREATE TABLE IF NOT EXISTS "gpg_cluster_transition_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_cluster_id" uuid NOT NULL,
  "to_cluster_id" uuid NOT NULL,
  "weight_30d" integer DEFAULT 0 NOT NULL,
  "success_weight_30d" double precision DEFAULT 0 NOT NULL,
  "last_seen_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gpg_cluster_transition_from_to_unique" UNIQUE("from_cluster_id", "to_cluster_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_cluster_transition_from_idx" ON "gpg_cluster_transition_edges" ("from_cluster_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_cluster_transition_to_idx" ON "gpg_cluster_transition_edges" ("to_cluster_id");

CREATE TABLE IF NOT EXISTS "gpg_integrity_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid,
  "run_id" uuid,
  "pipeline_run_id" uuid,
  "cluster_id" uuid,
  "flag_type" varchar(40) NOT NULL,
  "reason" text,
  "severity" integer DEFAULT 1 NOT NULL,
  "score" double precision,
  "evidence" jsonb,
  "is_resolved" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_integrity_flags_agent_idx" ON "gpg_integrity_flags" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_integrity_flags_run_idx" ON "gpg_integrity_flags" ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_integrity_flags_pipeline_idx" ON "gpg_integrity_flags" ("pipeline_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_integrity_flags_resolved_idx" ON "gpg_integrity_flags" ("is_resolved");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_integrity_flags_type_idx" ON "gpg_integrity_flags" ("flag_type");

CREATE TABLE IF NOT EXISTS "gpg_ingest_idempotency" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "endpoint" varchar(64) NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "payload_hash" varchar(64) NOT NULL,
  "agent_id" uuid,
  "response_body" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  CONSTRAINT "gpg_ingest_idempotency_endpoint_key_unique" UNIQUE("endpoint", "idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_ingest_idempotency_agent_idx" ON "gpg_ingest_idempotency" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gpg_ingest_idempotency_created_idx" ON "gpg_ingest_idempotency" ("created_at");

ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "cluster_id" uuid;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "task_signature_id" uuid;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "pipeline_run_id" uuid;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "pipeline_step" integer;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "is_verified" boolean DEFAULT false NOT NULL;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "ingest_idempotency_key" varchar(128);
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "ingest_key_id" varchar(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_cluster_id_idx" ON "agent_runs" ("cluster_id");
CREATE INDEX IF NOT EXISTS "agent_runs_task_signature_id_idx" ON "agent_runs" ("task_signature_id");
CREATE INDEX IF NOT EXISTS "agent_runs_pipeline_run_id_idx" ON "agent_runs" ("pipeline_run_id");
CREATE INDEX IF NOT EXISTS "agent_runs_verified_idx" ON "agent_runs" ("is_verified");
--> statement-breakpoint
ALTER TABLE "gpg_task_signatures" ADD CONSTRAINT "gpg_task_signatures_cluster_id_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "gpg_task_clusters"("id") ON DELETE set null;
ALTER TABLE "gpg_agent_cluster_stats" ADD CONSTRAINT "gpg_agent_cluster_stats_agent_fk"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE cascade;
ALTER TABLE "gpg_agent_cluster_stats" ADD CONSTRAINT "gpg_agent_cluster_stats_cluster_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "gpg_task_clusters"("id") ON DELETE cascade;
ALTER TABLE "gpg_pipeline_runs" ADD CONSTRAINT "gpg_pipeline_runs_cluster_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "gpg_task_clusters"("id") ON DELETE set null;
ALTER TABLE "gpg_pipeline_stats" ADD CONSTRAINT "gpg_pipeline_stats_cluster_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "gpg_task_clusters"("id") ON DELETE cascade;
ALTER TABLE "gpg_agent_collaboration_edges" ADD CONSTRAINT "gpg_agent_collab_from_fk"
  FOREIGN KEY ("from_agent_id") REFERENCES "agents"("id") ON DELETE cascade;
ALTER TABLE "gpg_agent_collaboration_edges" ADD CONSTRAINT "gpg_agent_collab_to_fk"
  FOREIGN KEY ("to_agent_id") REFERENCES "agents"("id") ON DELETE cascade;
ALTER TABLE "gpg_agent_collaboration_edges" ADD CONSTRAINT "gpg_agent_collab_cluster_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "gpg_task_clusters"("id") ON DELETE set null;
ALTER TABLE "gpg_cluster_transition_edges" ADD CONSTRAINT "gpg_cluster_transition_from_fk"
  FOREIGN KEY ("from_cluster_id") REFERENCES "gpg_task_clusters"("id") ON DELETE cascade;
ALTER TABLE "gpg_cluster_transition_edges" ADD CONSTRAINT "gpg_cluster_transition_to_fk"
  FOREIGN KEY ("to_cluster_id") REFERENCES "gpg_task_clusters"("id") ON DELETE cascade;
ALTER TABLE "gpg_integrity_flags" ADD CONSTRAINT "gpg_integrity_agent_fk"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE cascade;
ALTER TABLE "gpg_integrity_flags" ADD CONSTRAINT "gpg_integrity_pipeline_fk"
  FOREIGN KEY ("pipeline_run_id") REFERENCES "gpg_pipeline_runs"("id") ON DELETE set null;
ALTER TABLE "gpg_integrity_flags" ADD CONSTRAINT "gpg_integrity_cluster_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "gpg_task_clusters"("id") ON DELETE set null;
ALTER TABLE "gpg_ingest_idempotency" ADD CONSTRAINT "gpg_ingest_idempotency_agent_fk"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE set null;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_cluster_id_fk"
  FOREIGN KEY ("cluster_id") REFERENCES "gpg_task_clusters"("id") ON DELETE set null;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_signature_id_fk"
  FOREIGN KEY ("task_signature_id") REFERENCES "gpg_task_signatures"("id") ON DELETE set null;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_pipeline_run_id_fk"
  FOREIGN KEY ("pipeline_run_id") REFERENCES "gpg_pipeline_runs"("id") ON DELETE set null;