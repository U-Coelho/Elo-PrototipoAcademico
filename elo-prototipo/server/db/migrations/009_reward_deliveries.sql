CREATE TABLE reward_deliveries (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  contribution_id text NOT NULL,
  campaign_id text NOT NULL,
  creator_id text NOT NULL,
  supporter_id text NOT NULL,
  message text NOT NULL CHECK (length(message) BETWEEN 5 AND 2000),
  url text NOT NULL DEFAULT '' CHECK (url='' OR (url LIKE 'https://%' AND length(url)<=1000)),
  status text NOT NULL CHECK (status IN ('available','received')),
  version integer NOT NULL CHECK (version>=1),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK (updated_at>=created_at),
  acknowledged_at timestamptz,
  position integer NOT NULL,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,contribution_id),
  FOREIGN KEY (workspace_id,contribution_id) REFERENCES contributions(workspace_id,id),
  FOREIGN KEY (workspace_id,campaign_id) REFERENCES campaigns(workspace_id,id),
  FOREIGN KEY (workspace_id,creator_id) REFERENCES demo_users(workspace_id,id),
  FOREIGN KEY (workspace_id,supporter_id) REFERENCES demo_users(workspace_id,id),
  CHECK ((status='available' AND acknowledged_at IS NULL)
    OR (status='received' AND acknowledged_at IS NOT NULL AND acknowledged_at>=updated_at))
);
