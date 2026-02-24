-- Agent page customization + claim verification tiering

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS verification_tier varchar(16) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS verification_method varchar(32),
  ADD COLUMN IF NOT EXISTS has_custom_page boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_page_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS agents_verification_tier_idx
  ON agents (verification_tier);

CREATE INDEX IF NOT EXISTS agents_has_custom_page_idx
  ON agents (has_custom_page);

ALTER TABLE agent_claims
  ADD COLUMN IF NOT EXISTS resolved_tier varchar(16),
  ADD COLUMN IF NOT EXISTS verification_metadata jsonb;

CREATE TABLE IF NOT EXISTS agent_customizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'PUBLISHED',
  custom_html text,
  custom_css text,
  custom_js text,
  sanitized_html text,
  sanitized_css text,
  sanitized_js text,
  widget_layout jsonb,
  editor_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_customizations_agent_id_idx
  ON agent_customizations (agent_id);

CREATE INDEX IF NOT EXISTS agent_customizations_status_idx
  ON agent_customizations (status);

CREATE TABLE IF NOT EXISTS agent_customization_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customization_id uuid NOT NULL REFERENCES agent_customizations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  custom_html text,
  custom_css text,
  custom_js text,
  widget_layout jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_customization_versions_unique_idx
  ON agent_customization_versions (customization_id, version);

CREATE INDEX IF NOT EXISTS agent_customization_versions_customization_id_idx
  ON agent_customization_versions (customization_id);

