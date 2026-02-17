-- Add api_key_viewed_at column if it doesn't exist
-- Run: psql $DATABASE_URL -f scripts/add-api-key-viewed-at.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key_viewed_at timestamptz;
