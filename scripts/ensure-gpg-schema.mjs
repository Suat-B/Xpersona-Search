#!/usr/bin/env node
/**
 * Ensures GPG schema exists if migrations are out of sync.
 * Run: node scripts/ensure-gpg-schema.mjs
 */
import "dotenv/config";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

const sql = `
CREATE TABLE IF NOT EXISTS gpg_task_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  slug varchar(191) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  description text,
  normalized_label varchar(255) NOT NULL,
  signature_hash varchar(64) NOT NULL UNIQUE,
  task_type varchar(32) NOT NULL DEFAULT 'general',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding jsonb,
  volume_30d integer NOT NULL DEFAULT 0,
  median_budget_usd double precision,
  run_count_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gpg_task_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  raw_text text NOT NULL,
  normalized_text text NOT NULL,
  text_hash varchar(64) NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding jsonb,
  task_type varchar(32) NOT NULL DEFAULT 'general',
  difficulty integer,
  risk_level integer,
  cluster_id uuid REFERENCES gpg_task_clusters(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gpg_agent_cluster_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  cluster_id uuid NOT NULL REFERENCES gpg_task_clusters(id) ON DELETE CASCADE,
  success_rate_30d double precision NOT NULL DEFAULT 0,
  failure_rate_30d double precision NOT NULL DEFAULT 0,
  dispute_rate_90d double precision NOT NULL DEFAULT 0,
  avg_quality_30d double precision NOT NULL DEFAULT 0,
  calib_error_30d double precision NOT NULL DEFAULT 0,
  p50_latency_ms_30d double precision NOT NULL DEFAULT 0,
  p95_latency_ms_30d double precision NOT NULL DEFAULT 0,
  avg_cost_30d double precision NOT NULL DEFAULT 0,
  run_count_30d integer NOT NULL DEFAULT 0,
  verified_run_count_30d integer NOT NULL DEFAULT 0,
  bayes_success_30d double precision NOT NULL DEFAULT 0,
  risk_score_30d double precision NOT NULL DEFAULT 1,
  last_window_start timestamptz,
  last_window_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, cluster_id)
);

CREATE TABLE IF NOT EXISTS gpg_pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  job_id varchar(64),
  cluster_id uuid REFERENCES gpg_task_clusters(id) ON DELETE SET NULL,
  agent_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  path_hash varchar(64) NOT NULL,
  status varchar(16) NOT NULL,
  latency_ms integer NOT NULL,
  cost_usd double precision NOT NULL DEFAULT 0,
  quality_score double precision,
  confidence double precision,
  failure_type varchar(32),
  metadata jsonb,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gpg_pipeline_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  cluster_id uuid NOT NULL REFERENCES gpg_task_clusters(id) ON DELETE CASCADE,
  path_hash varchar(64) NOT NULL,
  agent_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_rate_30d double precision NOT NULL DEFAULT 0,
  bayes_success_30d double precision NOT NULL DEFAULT 0,
  p50_latency_ms_30d double precision NOT NULL DEFAULT 0,
  p95_latency_ms_30d double precision NOT NULL DEFAULT 0,
  avg_cost_30d double precision NOT NULL DEFAULT 0,
  avg_quality_30d double precision NOT NULL DEFAULT 0,
  run_count_30d integer NOT NULL DEFAULT 0,
  risk_score_30d double precision NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cluster_id, path_hash)
);

CREATE TABLE IF NOT EXISTS gpg_agent_collaboration_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  from_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  cluster_id uuid REFERENCES gpg_task_clusters(id) ON DELETE SET NULL,
  weight_30d integer NOT NULL DEFAULT 0,
  success_weight_30d double precision NOT NULL DEFAULT 0,
  failure_weight_30d double precision NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_agent_id, to_agent_id, cluster_id)
);

CREATE TABLE IF NOT EXISTS gpg_cluster_transition_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  from_cluster_id uuid NOT NULL REFERENCES gpg_task_clusters(id) ON DELETE CASCADE,
  to_cluster_id uuid NOT NULL REFERENCES gpg_task_clusters(id) ON DELETE CASCADE,
  weight_30d integer NOT NULL DEFAULT 0,
  success_weight_30d double precision NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_cluster_id, to_cluster_id)
);

CREATE TABLE IF NOT EXISTS gpg_integrity_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  run_id uuid,
  pipeline_run_id uuid REFERENCES gpg_pipeline_runs(id) ON DELETE SET NULL,
  cluster_id uuid REFERENCES gpg_task_clusters(id) ON DELETE SET NULL,
  flag_type varchar(40) NOT NULL,
  reason text,
  severity integer NOT NULL DEFAULT 1,
  score double precision,
  evidence jsonb,
  is_resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS gpg_ingest_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  endpoint varchar(64) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(endpoint, idempotency_key)
);

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS cluster_id uuid REFERENCES gpg_task_clusters(id) ON DELETE SET NULL;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS task_signature_id uuid REFERENCES gpg_task_signatures(id) ON DELETE SET NULL;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS pipeline_run_id uuid REFERENCES gpg_pipeline_runs(id) ON DELETE SET NULL;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS pipeline_step integer;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS ingest_idempotency_key varchar(128);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS ingest_key_id varchar(64);

CREATE INDEX IF NOT EXISTS gpg_task_signatures_cluster_id_idx ON gpg_task_signatures(cluster_id);
CREATE INDEX IF NOT EXISTS gpg_task_signatures_text_hash_idx ON gpg_task_signatures(text_hash);
CREATE INDEX IF NOT EXISTS gpg_task_signatures_task_type_idx ON gpg_task_signatures(task_type);
CREATE INDEX IF NOT EXISTS gpg_agent_cluster_stats_cluster_idx ON gpg_agent_cluster_stats(cluster_id);
CREATE INDEX IF NOT EXISTS gpg_agent_cluster_stats_agent_idx ON gpg_agent_cluster_stats(agent_id);
CREATE INDEX IF NOT EXISTS gpg_agent_cluster_stats_bayes_idx ON gpg_agent_cluster_stats(bayes_success_30d);
CREATE INDEX IF NOT EXISTS gpg_pipeline_runs_cluster_idx ON gpg_pipeline_runs(cluster_id);
CREATE INDEX IF NOT EXISTS gpg_pipeline_runs_path_hash_idx ON gpg_pipeline_runs(path_hash);
CREATE INDEX IF NOT EXISTS gpg_pipeline_runs_status_idx ON gpg_pipeline_runs(status);
CREATE INDEX IF NOT EXISTS gpg_pipeline_runs_created_idx ON gpg_pipeline_runs(created_at);
CREATE INDEX IF NOT EXISTS gpg_pipeline_stats_cluster_idx ON gpg_pipeline_stats(cluster_id);
CREATE INDEX IF NOT EXISTS gpg_pipeline_stats_bayes_idx ON gpg_pipeline_stats(bayes_success_30d);
CREATE INDEX IF NOT EXISTS gpg_agent_collab_from_idx ON gpg_agent_collaboration_edges(from_agent_id);
CREATE INDEX IF NOT EXISTS gpg_agent_collab_to_idx ON gpg_agent_collaboration_edges(to_agent_id);
CREATE INDEX IF NOT EXISTS gpg_cluster_transition_from_idx ON gpg_cluster_transition_edges(from_cluster_id);
CREATE INDEX IF NOT EXISTS gpg_cluster_transition_to_idx ON gpg_cluster_transition_edges(to_cluster_id);
CREATE INDEX IF NOT EXISTS gpg_integrity_flags_agent_idx ON gpg_integrity_flags(agent_id);
CREATE INDEX IF NOT EXISTS gpg_integrity_flags_run_idx ON gpg_integrity_flags(run_id);
CREATE INDEX IF NOT EXISTS gpg_integrity_flags_pipeline_idx ON gpg_integrity_flags(pipeline_run_id);
CREATE INDEX IF NOT EXISTS gpg_integrity_flags_resolved_idx ON gpg_integrity_flags(is_resolved);
CREATE INDEX IF NOT EXISTS gpg_integrity_flags_type_idx ON gpg_integrity_flags(flag_type);
CREATE INDEX IF NOT EXISTS gpg_ingest_idempotency_agent_idx ON gpg_ingest_idempotency(agent_id);
CREATE INDEX IF NOT EXISTS gpg_ingest_idempotency_created_idx ON gpg_ingest_idempotency(created_at);
CREATE INDEX IF NOT EXISTS agent_runs_cluster_id_idx ON agent_runs(cluster_id);
CREATE INDEX IF NOT EXISTS agent_runs_task_signature_id_idx ON agent_runs(task_signature_id);
CREATE INDEX IF NOT EXISTS agent_runs_pipeline_run_id_idx ON agent_runs(pipeline_run_id);
CREATE INDEX IF NOT EXISTS agent_runs_verified_idx ON agent_runs(is_verified);
`;

async function main() {
  await client.connect();
  try {
    await client.query(sql);
    console.log("gpg schema ready");
  } catch (err) {
    console.error("ensure-gpg-schema failed", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
