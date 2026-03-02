-- Playground subscriptions table
CREATE TABLE IF NOT EXISTS playground_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255) UNIQUE,
  plan_tier VARCHAR(20) NOT NULL CHECK (plan_tier IN ('trial', 'paid')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trial')),
  trial_started_at TIMESTAMP WITH TIME ZONE,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_playground_sub_user ON playground_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_playground_sub_stripe ON playground_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_playground_sub_status ON playground_subscriptions(status);

-- HF usage logs - every request is logged here
CREATE TABLE IF NOT EXISTS hf_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES playground_subscriptions(id),
  model VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'nscale',
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 8),
  latency_ms INTEGER,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'rate_limited', 'quota_exceeded', 'validation_error')),
  error_message TEXT,
  request_hash VARCHAR(64),
  request_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hf_usage_user_created ON hf_usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hf_usage_model ON hf_usage_logs(model);
CREATE INDEX IF NOT EXISTS idx_hf_usage_status ON hf_usage_logs(status);
CREATE INDEX IF NOT EXISTS idx_hf_usage_date ON hf_usage_logs(DATE(created_at));

-- Daily usage aggregates for fast quota checks
CREATE TABLE IF NOT EXISTS hf_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  requests_count INTEGER NOT NULL DEFAULT 0,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 6) DEFAULT 0,
  UNIQUE(user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_hf_daily_usage_user_date ON hf_daily_usage(user_id, usage_date);

-- Monthly usage aggregates for monthly caps
CREATE TABLE IF NOT EXISTS hf_monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_year INTEGER NOT NULL,
  usage_month INTEGER NOT NULL,
  requests_count INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 6) DEFAULT 0,
  UNIQUE(user_id, usage_year, usage_month)
);

CREATE INDEX IF NOT EXISTS idx_hf_monthly_usage_user ON hf_monthly_usage(user_id, usage_year, usage_month);

-- Add trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_playground_subscriptions_updated_at ON playground_subscriptions;
CREATE TRIGGER update_playground_subscriptions_updated_at
  BEFORE UPDATE ON playground_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
