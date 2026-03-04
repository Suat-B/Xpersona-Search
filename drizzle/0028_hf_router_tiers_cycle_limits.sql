-- Expand playground plan tiers and introduce 5-hour cycle usage accounting.

-- 1) Backfill legacy paid tier -> builder.
UPDATE playground_subscriptions
SET plan_tier = 'builder'
WHERE plan_tier = 'paid';

-- 2) Add monthly input token accounting for total-token budgets.
ALTER TABLE hf_monthly_usage
  ADD COLUMN IF NOT EXISTS tokens_input integer NOT NULL DEFAULT 0;

-- 3) Create 5-hour cycle aggregate table.
CREATE TABLE IF NOT EXISTS hf_cycle_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_start_at timestamptz NOT NULL,
  requests_count integer NOT NULL DEFAULT 0,
  tokens_input integer NOT NULL DEFAULT 0,
  tokens_output integer NOT NULL DEFAULT 0,
  estimated_cost_usd double precision DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hf_cycle_usage_user_cycle_idx
  ON hf_cycle_usage(user_id, cycle_start_at);

CREATE INDEX IF NOT EXISTS hf_cycle_usage_user_idx
  ON hf_cycle_usage(user_id);

CREATE INDEX IF NOT EXISTS hf_cycle_usage_cycle_idx
  ON hf_cycle_usage(cycle_start_at);
