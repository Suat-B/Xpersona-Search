ALTER TABLE playground_sessions
  ADD COLUMN IF NOT EXISTS trace_id varchar(64),
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE playground_messages
  ADD COLUMN IF NOT EXISTS token_count integer,
  ADD COLUMN IF NOT EXISTS latency_ms integer;

ALTER TABLE playground_agent_runs
  ADD COLUMN IF NOT EXISTS confidence double precision,
  ADD COLUMN IF NOT EXISTS risk_level varchar(20);

ALTER TABLE playground_action_logs
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS exit_code integer,
  ADD COLUMN IF NOT EXISTS stdout_excerpt text,
  ADD COLUMN IF NOT EXISTS stderr_excerpt text;

ALTER TABLE playground_index_chunks
  ADD COLUMN IF NOT EXISTS embedding jsonb,
  ADD COLUMN IF NOT EXISTS token_estimate integer,
  ADD COLUMN IF NOT EXISTS embedding_model varchar(128);

CREATE TABLE IF NOT EXISTS playground_replay_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_session_id uuid NOT NULL REFERENCES playground_sessions(id) ON DELETE CASCADE,
  workspace_fingerprint varchar(128) NOT NULL,
  drift_summary text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'queued',
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playground_replay_runs_user_created_idx
  ON playground_replay_runs(user_id, created_at);

CREATE INDEX IF NOT EXISTS playground_replay_runs_source_session_idx
  ON playground_replay_runs(source_session_id);

