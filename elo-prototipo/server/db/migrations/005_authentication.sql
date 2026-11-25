CREATE TABLE auth_users (
  id text PRIMARY KEY,
  username text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK(role IN ('creator','supporter','admin')),
  CHECK ((role='admin')=(id='admin1')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auth_username_unique ON auth_users(lower(username));
CREATE UNIQUE INDEX auth_email_unique ON auth_users(lower(email));
CREATE UNIQUE INDEX auth_single_admin ON auth_users(role) WHERE role='admin';
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id text REFERENCES auth_users(id),
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE platform_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id)
);
ALTER TABLE demo_workspaces ADD COLUMN favorite_state jsonb NOT NULL DEFAULT '{}';
