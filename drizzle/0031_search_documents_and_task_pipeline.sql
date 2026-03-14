-- Multi-vertical search corpus + staged crawl task pipeline

CREATE TABLE IF NOT EXISTS search_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type varchar(24) NOT NULL,
  source varchar(64) NOT NULL,
  source_id varchar(512) NOT NULL,
  canonical_url text NOT NULL,
  domain varchar(255) NOT NULL,
  title text,
  snippet text,
  body_text text NOT NULL,
  body_tsv tsvector NOT NULL DEFAULT to_tsvector('english', ''),
  url_norm_hash varchar(64) NOT NULL,
  content_hash varchar(64) NOT NULL,
  simhash64 varchar(16),
  quality_score integer NOT NULL DEFAULT 0,
  safety_score integer NOT NULL DEFAULT 0,
  freshness_score integer NOT NULL DEFAULT 0,
  confidence_score integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT true,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS search_documents_url_content_uniq_idx
  ON search_documents (url_norm_hash, content_hash);
CREATE INDEX IF NOT EXISTS search_documents_doc_type_idx
  ON search_documents (doc_type);
CREATE INDEX IF NOT EXISTS search_documents_source_idx
  ON search_documents (source);
CREATE INDEX IF NOT EXISTS search_documents_domain_idx
  ON search_documents (domain);
CREATE INDEX IF NOT EXISTS search_documents_indexed_at_idx
  ON search_documents (indexed_at);
CREATE INDEX IF NOT EXISTS search_documents_quality_idx
  ON search_documents (quality_score);
CREATE INDEX IF NOT EXISTS search_documents_confidence_idx
  ON search_documents (confidence_score);
CREATE INDEX IF NOT EXISTS search_documents_public_idx
  ON search_documents (is_public);
CREATE INDEX IF NOT EXISTS search_documents_body_tsv_idx
  ON search_documents USING gin (body_tsv);

CREATE OR REPLACE FUNCTION search_documents_tsvector_update_fn()
RETURNS trigger AS $$
BEGIN
  NEW.body_tsv :=
    to_tsvector(
      'english',
      coalesce(NEW.title, '') || ' ' ||
      coalesce(NEW.snippet, '') || ' ' ||
      coalesce(NEW.body_text, '')
    );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS search_documents_tsvector_update_trg ON search_documents;
CREATE TRIGGER search_documents_tsvector_update_trg
BEFORE INSERT OR UPDATE OF title, snippet, body_text
ON search_documents
FOR EACH ROW
EXECUTE FUNCTION search_documents_tsvector_update_fn();

CREATE TABLE IF NOT EXISTS crawl_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type varchar(24) NOT NULL,
  task_key varchar(128) NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner varchar(96),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crawl_tasks_task_key_idx ON crawl_tasks (task_key);
CREATE INDEX IF NOT EXISTS crawl_tasks_status_idx ON crawl_tasks (status);
CREATE INDEX IF NOT EXISTS crawl_tasks_type_idx ON crawl_tasks (task_type);
CREATE INDEX IF NOT EXISTS crawl_tasks_next_attempt_idx ON crawl_tasks (next_attempt_at);
CREATE INDEX IF NOT EXISTS crawl_tasks_priority_idx ON crawl_tasks (priority);
CREATE INDEX IF NOT EXISTS crawl_tasks_lease_owner_idx ON crawl_tasks (lease_owner);
CREATE INDEX IF NOT EXISTS crawl_tasks_lease_exp_idx ON crawl_tasks (lease_expires_at);
CREATE INDEX IF NOT EXISTS crawl_tasks_pending_ready_idx
  ON crawl_tasks (status, next_attempt_at, priority DESC)
  WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS crawl_domain_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain varchar(255) NOT NULL UNIQUE,
  mode varchar(16) NOT NULL DEFAULT 'ALLOW',
  rpm_limit integer NOT NULL DEFAULT 30,
  cooldown_until timestamptz,
  reason text,
  updated_by varchar(96),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crawl_domain_policies_mode_idx
  ON crawl_domain_policies (mode);
CREATE INDEX IF NOT EXISTS crawl_domain_policies_cooldown_idx
  ON crawl_domain_policies (cooldown_until);

CREATE TABLE IF NOT EXISTS crawl_domain_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain varchar(255) NOT NULL UNIQUE,
  success_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  timeout_count integer NOT NULL DEFAULT 0,
  last_status varchar(20),
  last_error text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crawl_domain_stats_fail_idx
  ON crawl_domain_stats (fail_count);
CREATE INDEX IF NOT EXISTS crawl_domain_stats_updated_idx
  ON crawl_domain_stats (updated_at);
CREATE INDEX IF NOT EXISTS crawl_domain_stats_last_seen_idx
  ON crawl_domain_stats (last_seen_at);
