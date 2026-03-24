-- Stripe-backed crawl licensing with prepaid credits and per-request ledgering

CREATE TABLE IF NOT EXISTS crawl_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  stripe_customer_id varchar(255) UNIQUE,
  api_key_hash varchar(64) UNIQUE,
  api_key_prefix varchar(16),
  credit_balance integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'active',
  has_active_key boolean NOT NULL DEFAULT false,
  last_key_rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crawl_customers_email_idx
  ON crawl_customers (email);
CREATE UNIQUE INDEX IF NOT EXISTS crawl_customers_stripe_customer_id_idx
  ON crawl_customers (stripe_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS crawl_customers_api_key_hash_idx
  ON crawl_customers (api_key_hash);
CREATE INDEX IF NOT EXISTS crawl_customers_status_idx
  ON crawl_customers (status);
CREATE INDEX IF NOT EXISTS crawl_customers_updated_idx
  ON crawl_customers (updated_at);

CREATE TABLE IF NOT EXISTS crawl_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES crawl_customers(id) ON DELETE CASCADE,
  delta_credits integer NOT NULL,
  reason varchar(24) NOT NULL,
  idempotency_key varchar(255) NOT NULL UNIQUE,
  stripe_checkout_session_id varchar(255),
  stripe_payment_intent_id varchar(255),
  path text,
  bot_name varchar(64),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crawl_credit_ledger_idempotency_idx
  ON crawl_credit_ledger (idempotency_key);
CREATE INDEX IF NOT EXISTS crawl_credit_ledger_customer_created_idx
  ON crawl_credit_ledger (customer_id, created_at);
CREATE INDEX IF NOT EXISTS crawl_credit_ledger_reason_idx
  ON crawl_credit_ledger (reason);
CREATE INDEX IF NOT EXISTS crawl_credit_ledger_checkout_idx
  ON crawl_credit_ledger (stripe_checkout_session_id);
