CREATE TABLE project_images (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  image bytea NOT NULL CHECK (octet_length(image) BETWEEN 1 AND 1048576),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,campaign_id),
  FOREIGN KEY (workspace_id,campaign_id) REFERENCES campaigns(workspace_id,id)
    DEFERRABLE INITIALLY DEFERRED
);
