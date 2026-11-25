ALTER TABLE campaigns DROP CONSTRAINT campaigns_category_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_category_check
  CHECK (category IN ('Tecnologia','Arte e cultura','Impacto social','Educação','Jogos','Filmes e vídeos','Design','Ativismo','Artes','Jornalismo','Podcast'));

CREATE TABLE account_moderations (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  account_id text NOT NULL,
  banned boolean NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 500),
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, account_id),
  FOREIGN KEY (workspace_id, account_id) REFERENCES demo_users(workspace_id, id),
  FOREIGN KEY (workspace_id, updated_by) REFERENCES demo_users(workspace_id, id)
);

CREATE TABLE direct_messages (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  creator_id text NOT NULL,
  sender_id text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, creator_id) REFERENCES demo_users(workspace_id, id),
  FOREIGN KEY (workspace_id, sender_id) REFERENCES demo_users(workspace_id, id)
);

CREATE INDEX direct_messages_creator_idx ON direct_messages(workspace_id, creator_id, created_at);
