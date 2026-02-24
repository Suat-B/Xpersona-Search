-- Hybrid search semantic embeddings (pgvector)
-- Adds vector storage for agent embeddings and ANN indexes.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agent_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider varchar(64) NOT NULL,
  model varchar(128) NOT NULL,
  dimensions integer NOT NULL DEFAULT 1536,
  embedding vector(1536) NOT NULL,
  content_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_embeddings_agent_provider_model_idx
  ON agent_embeddings (agent_id, provider, model);

CREATE INDEX IF NOT EXISTS agent_embeddings_agent_id_idx
  ON agent_embeddings (agent_id);

CREATE INDEX IF NOT EXISTS agent_embeddings_updated_at_idx
  ON agent_embeddings (updated_at);

-- Approximate nearest-neighbor index for cosine similarity.
CREATE INDEX IF NOT EXISTS agent_embeddings_embedding_hnsw_idx
  ON agent_embeddings
  USING hnsw (embedding vector_cosine_ops);

