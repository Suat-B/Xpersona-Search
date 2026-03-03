CREATE TABLE IF NOT EXISTS playground_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200),
  mode VARCHAR(20) NOT NULL DEFAULT 'auto',
  workspace_fingerprint VARCHAR(128),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS playground_sessions_user_created_idx
  ON playground_sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS playground_sessions_user_updated_idx
  ON playground_sessions(user_id, updated_at);

CREATE TABLE IF NOT EXISTS playground_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES playground_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  kind VARCHAR(40) NOT NULL DEFAULT 'message',
  content TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS playground_messages_session_created_idx
  ON playground_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS playground_messages_user_created_idx
  ON playground_messages(user_id, created_at);

CREATE TABLE IF NOT EXISTS playground_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES playground_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  input JSONB,
  output JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS playground_agent_runs_session_created_idx
  ON playground_agent_runs(session_id, created_at);
CREATE INDEX IF NOT EXISTS playground_agent_runs_user_created_idx
  ON playground_agent_runs(user_id, created_at);

CREATE TABLE IF NOT EXISTS playground_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES playground_sessions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  payload JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS playground_action_logs_user_created_idx
  ON playground_action_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS playground_action_logs_session_created_idx
  ON playground_action_logs(session_id, created_at);

CREATE TABLE IF NOT EXISTS playground_index_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_key VARCHAR(255) NOT NULL,
  path_hash VARCHAR(128) NOT NULL,
  chunk_hash VARCHAR(128) NOT NULL,
  path_display TEXT,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_key, path_hash, chunk_hash)
);

CREATE INDEX IF NOT EXISTS playground_index_chunks_user_project_idx
  ON playground_index_chunks(user_id, project_key);

CREATE TABLE IF NOT EXISTS playground_index_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_key VARCHAR(255) NOT NULL,
  last_cursor VARCHAR(255),
  stats JSONB,
  last_sync_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_key)
);

CREATE TABLE IF NOT EXISTS playground_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES playground_sessions(id) ON DELETE SET NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  storage_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS playground_attachments_user_created_idx
  ON playground_attachments(user_id, created_at);
CREATE INDEX IF NOT EXISTS playground_attachments_session_created_idx
  ON playground_attachments(session_id, created_at);
