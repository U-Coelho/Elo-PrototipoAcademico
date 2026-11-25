CREATE TABLE creator_profiles (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  creator_id text NOT NULL,
  bio text NOT NULL CHECK (length(bio) <= 3000),
  links jsonb NOT NULL CHECK (jsonb_typeof(links) = 'array' AND jsonb_array_length(links) <= 5),
  joined_at timestamptz NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, creator_id),
  FOREIGN KEY (workspace_id, creator_id) REFERENCES demo_users(workspace_id, id)
);

CREATE TABLE project_updates (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  campaign_id text NOT NULL,
  creator_id text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns(workspace_id, id),
  FOREIGN KEY (workspace_id, creator_id) REFERENCES demo_users(workspace_id, id)
);

CREATE TABLE project_comments (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  campaign_id text NOT NULL,
  author_id text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns(workspace_id, id),
  FOREIGN KEY (workspace_id, author_id) REFERENCES demo_users(workspace_id, id)
);

CREATE INDEX project_updates_campaign_idx ON project_updates(workspace_id, campaign_id, created_at DESC);
CREATE INDEX project_comments_campaign_idx ON project_comments(workspace_id, campaign_id, created_at DESC);
