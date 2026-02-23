-- Search Engine Hardening Migration
-- Adds click tracking table, trigram index on search_queries for "did you mean",
-- and configures pg_trgm similarity threshold.

-- Ensure pg_trgm extension (already created in 0013, but idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Click tracking table for learning-to-rank CTR signals
CREATE TABLE IF NOT EXISTS search_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash varchar(32) NOT NULL,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  user_id uuid,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_clicks_query_hash_idx
  ON search_clicks (query_hash);

CREATE INDEX IF NOT EXISTS search_clicks_agent_id_idx
  ON search_clicks (agent_id);

CREATE INDEX IF NOT EXISTS search_clicks_clicked_at_idx
  ON search_clicks (clicked_at);

-- Composite index for CTR aggregation queries
CREATE INDEX IF NOT EXISTS search_clicks_agent_date_idx
  ON search_clicks (agent_id, clicked_at);

-- 2. Trigram index on search_queries.normalized_query for "did you mean?" lookups
-- This enables fast similarity() and % operator queries against past searches.
CREATE INDEX IF NOT EXISTS search_queries_normalized_trgm_idx
  ON search_queries USING GIN (normalized_query gin_trgm_ops);

-- 3. Trigram index on agents.name for fast similarity lookups
-- (agents_name_trgm_idx already exists from 0013, but this is idempotent)
CREATE INDEX IF NOT EXISTS agents_name_trgm_idx
  ON agents USING GIN (name gin_trgm_ops);
