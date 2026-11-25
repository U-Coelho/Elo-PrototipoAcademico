CREATE TABLE demo_workspaces (
  id uuid PRIMARY KEY,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  sequence bigint NOT NULL CHECK (sequence BETWEEN 0 AND 9007199254740991),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE demo_users (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  role text NOT NULL CHECK (role IN ('supporter','creator','admin','system')),
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE campaigns (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  creator_id text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 90),
  category text NOT NULL CHECK (category IN ('Tecnologia','Arte e cultura','Impacto social','Educação')),
  description text NOT NULL,
  image text NOT NULL,
  goal_cents bigint NOT NULL CHECK (goal_cents BETWEEN 1 AND 9007199254740991),
  raised_cents bigint NOT NULL CHECK (raised_cents BETWEEN 0 AND 9007199254740991),
  backers integer NOT NULL CHECK (backers >= 0),
  days_left integer NOT NULL CHECK (days_left BETWEEN 1 AND 90),
  monthly boolean NOT NULL,
  featured boolean NOT NULL,
  story text NOT NULL,
  location text,
  rewards jsonb NOT NULL CHECK (jsonb_typeof(rewards) = 'array'),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, creator_id) REFERENCES demo_users(workspace_id, id)
);

CREATE TABLE contributions (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  campaign_id text NOT NULL,
  supporter_id text NOT NULL,
  creator_id text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 9007199254740991),
  mode text NOT NULL CHECK (mode IN ('once','monthly')),
  status text NOT NULL CHECK (status IN ('pending','confirmed','failed')),
  subscription_status text CHECK (subscription_status IN ('active','canceled')),
  transaction_id text NOT NULL,
  created_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, transaction_id),
  FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns(workspace_id, id),
  FOREIGN KEY (workspace_id, supporter_id) REFERENCES demo_users(workspace_id, id),
  FOREIGN KEY (workspace_id, creator_id) REFERENCES demo_users(workspace_id, id)
);

CREATE TABLE payouts (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  creator_id text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 9007199254740991),
  status text NOT NULL CHECK (status = 'completed'),
  destination text NOT NULL,
  created_at timestamptz NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, creator_id) REFERENCES demo_users(workspace_id, id)
);

CREATE TABLE ledger_entries (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  owner_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('opening_balance','contribution','payout')),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 9007199254740991),
  contribution_id text,
  campaign_id text,
  payout_id text,
  description text NOT NULL,
  created_at timestamptz NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, contribution_id, owner_id, direction),
  UNIQUE (workspace_id, payout_id),
  FOREIGN KEY (workspace_id, owner_id) REFERENCES demo_users(workspace_id, id),
  FOREIGN KEY (workspace_id, contribution_id) REFERENCES contributions(workspace_id, id),
  FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns(workspace_id, id),
  FOREIGN KEY (workspace_id, payout_id) REFERENCES payouts(workspace_id, id)
);

CREATE TABLE audit_events (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  actor_id text NOT NULL,
  action text NOT NULL,
  resource_id text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, actor_id) REFERENCES demo_users(workspace_id, id)
);

CREATE TABLE favorites (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, campaign_id),
  FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns(workspace_id, id)
);

CREATE TABLE idempotency_records (
  workspace_id uuid NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
  operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 1 AND 500),
  fingerprint text NOT NULL CHECK (length(fingerprint) BETWEEN 1 AND 2000),
  resource_id text NOT NULL CHECK (length(resource_id) BETWEEN 1 AND 160),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  PRIMARY KEY (workspace_id, operation_key)
);

CREATE INDEX contributions_campaign_idx ON contributions(workspace_id, campaign_id);
CREATE INDEX contributions_supporter_idx ON contributions(workspace_id, supporter_id);
CREATE INDEX ledger_owner_idx ON ledger_entries(workspace_id, owner_id);
CREATE INDEX audit_created_idx ON audit_events(workspace_id, created_at DESC);
