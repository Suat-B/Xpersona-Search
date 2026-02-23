-- Expand search_vector trigger to include capabilities, protocols, languages
-- in addition to name, description, readme. This dramatically increases search
-- recall by making structured metadata fields searchable via full-text.

CREATE OR REPLACE FUNCTION agents_search_vector_trigger() RETURNS trigger AS $$
DECLARE
  caps_text text;
  proto_text text;
  langs_text text;
BEGIN
  -- Safely extract text from jsonb arrays, defaulting to empty string
  SELECT coalesce(string_agg(elem, ' '), '')
    INTO caps_text
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(coalesce(NEW.capabilities, '[]'::jsonb)) = 'array'
           THEN NEW.capabilities ELSE '[]'::jsonb END
    ) AS elem;

  SELECT coalesce(string_agg(elem, ' '), '')
    INTO proto_text
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(coalesce(NEW.protocols, '[]'::jsonb)) = 'array'
           THEN NEW.protocols ELSE '[]'::jsonb END
    ) AS elem;

  SELECT coalesce(string_agg(elem, ' '), '')
    INTO langs_text
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(coalesce(NEW.languages, '[]'::jsonb)) = 'array'
           THEN NEW.languages ELSE '[]'::jsonb END
    ) AS elem;

  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.readme, '')), 'C') ||
    setweight(to_tsvector('english', caps_text), 'B') ||
    setweight(to_tsvector('english', proto_text), 'A') ||
    setweight(to_tsvector('english', langs_text), 'C');

  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Backfill: touch every row to fire the updated trigger
UPDATE agents SET updated_at = now();
