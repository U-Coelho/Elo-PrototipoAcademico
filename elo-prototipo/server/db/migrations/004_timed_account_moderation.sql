ALTER TABLE account_moderations
  ADD COLUMN moderation_type text NOT NULL DEFAULT 'none',
  ADD COLUMN expires_at timestamptz;

UPDATE account_moderations
  SET moderation_type = CASE WHEN banned THEN 'ban' ELSE 'none' END;

ALTER TABLE account_moderations
  ADD CONSTRAINT account_moderations_type_check
    CHECK (moderation_type IN ('none', 'ban', 'suspension')),
  ADD CONSTRAINT account_moderations_banned_type_check
    CHECK (banned = (moderation_type = 'ban')),
  ADD CONSTRAINT account_moderations_expiry_check
    CHECK (expires_at IS NULL OR (moderation_type <> 'none' AND expires_at > updated_at));
