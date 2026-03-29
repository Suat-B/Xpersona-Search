ALTER TABLE "agents"
ADD COLUMN IF NOT EXISTS "entity_type" varchar(16);

UPDATE "agents"
SET "entity_type" = CASE
  WHEN lower(coalesce("source_id", '')) LIKE 'a2a:%' THEN 'agent'
  WHEN upper(coalesce("source", '')) IN ('A2A_REGISTRY', 'AGENTSCAPE', 'GOOGLE_CLOUD_MARKETPLACE', 'NACOS_AGENT_REGISTRY') THEN 'agent'
  WHEN upper(coalesce("source", '')) IN ('MCP_REGISTRY', 'GITHUB_MCP', 'SMITHERY') THEN 'mcp'
  WHEN upper(coalesce("source", '')) IN ('CLAWHUB', 'GITHUB_OPENCLEW', 'CREWAI', 'CURATED_SEEDS', 'AWESOME_LISTS', 'DIFY_MARKETPLACE', 'N8N_TEMPLATES', 'LANGFLOW_STARTER_PROJECTS', 'VERCEL_TEMPLATES') THEN 'skill'
  WHEN "agent_card" IS NOT NULL OR coalesce("agent_card_url", '') <> '' THEN 'agent'
  WHEN coalesce("protocols", '[]'::jsonb) ? 'A2A' THEN 'agent'
  WHEN coalesce("openclaw_data", '{}'::jsonb) ? 'mcpRegistry' OR coalesce("openclaw_data", '{}'::jsonb) ? 'smithery' THEN 'mcp'
  WHEN coalesce("openclaw_data", '{}'::jsonb) ? 'clawhub'
    OR coalesce("openclaw_data", '{}'::jsonb) ? 'dify'
    OR coalesce("openclaw_data", '{}'::jsonb) ? 'n8n'
    OR coalesce("openclaw_data", '{}'::jsonb) ? 'langflow'
    OR coalesce("openclaw_data", '{}'::jsonb) ? 'vercelTemplate' THEN 'skill'
  WHEN coalesce("protocols", '[]'::jsonb) ? 'MCP' AND jsonb_array_length(coalesce("protocols", '[]'::jsonb)) = 1 THEN 'mcp'
  WHEN coalesce("protocols", '[]'::jsonb) ? 'OPENCLEW' THEN 'skill'
  ELSE 'agent'
END
WHERE "entity_type" IS NULL;

UPDATE "agents"
SET "entity_type" = 'agent'
WHERE "entity_type" IS NULL;

ALTER TABLE "agents"
ALTER COLUMN "entity_type" SET DEFAULT 'agent';

ALTER TABLE "agents"
ALTER COLUMN "entity_type" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "agents_entity_type_idx" ON "agents" ("entity_type");
