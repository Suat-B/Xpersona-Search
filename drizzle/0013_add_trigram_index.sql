-- Enable pg_trgm for fast ILIKE pattern matching via trigram GIN indexes.
-- Without these indexes, ILIKE '%trading%' requires a sequential scan on 18k+ rows.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS agents_name_trgm_idx
  ON agents USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS agents_desc_trgm_idx
  ON agents USING GIN (description gin_trgm_ops);
