-- VS Code browser auth (PKCE): auth codes + refresh tokens

CREATE TABLE IF NOT EXISTS playground_vscode_auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash varchar(64) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_challenge text NOT NULL,
  code_challenge_method varchar(12) NOT NULL DEFAULT 'S256',
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS playground_vscode_auth_codes_code_hash_idx
  ON playground_vscode_auth_codes(code_hash);

CREATE INDEX IF NOT EXISTS playground_vscode_auth_codes_user_idx
  ON playground_vscode_auth_codes(user_id);

CREATE INDEX IF NOT EXISTS playground_vscode_auth_codes_expires_idx
  ON playground_vscode_auth_codes(expires_at);

CREATE TABLE IF NOT EXISTS playground_vscode_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash varchar(64) NOT NULL UNIQUE,
  token_prefix varchar(16) NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS playground_vscode_refresh_tokens_token_hash_idx
  ON playground_vscode_refresh_tokens(token_hash);

CREATE INDEX IF NOT EXISTS playground_vscode_refresh_tokens_user_idx
  ON playground_vscode_refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS playground_vscode_refresh_tokens_expires_idx
  ON playground_vscode_refresh_tokens(expires_at);

CREATE INDEX IF NOT EXISTS playground_vscode_refresh_tokens_revoked_idx
  ON playground_vscode_refresh_tokens(revoked_at);

