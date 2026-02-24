ALTER TABLE search_outcomes
  ADD COLUMN IF NOT EXISTS auth_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_limit_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tool_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schema_mismatch_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_exceeded_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS single_path_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delegated_path_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bundled_path_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_query varchar(255),
  ADD COLUMN IF NOT EXISTS last_query_normalized varchar(255);

CREATE INDEX IF NOT EXISTS search_outcomes_task_last_outcome_idx
  ON search_outcomes (task_type, last_outcome_at DESC);

