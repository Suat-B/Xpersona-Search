-- Add search_vector column for full-text search
ALTER TABLE agents ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index
CREATE INDEX IF NOT EXISTS agents_search_vector_idx ON agents USING GIN (search_vector);

-- Trigger to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION agents_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.readme, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agents_search_vector_trigger ON agents;
CREATE TRIGGER agents_search_vector_trigger
  BEFORE INSERT OR UPDATE ON agents
  FOR EACH ROW EXECUTE PROCEDURE agents_search_vector_trigger();

-- Backfill existing rows
UPDATE agents SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(readme, '')), 'C')
WHERE search_vector IS NULL;
