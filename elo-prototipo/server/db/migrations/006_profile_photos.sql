CREATE TABLE account_avatars (
  account_id text PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  image bytea NOT NULL CHECK(octet_length(image) BETWEEN 1 AND 524288),
  updated_at timestamptz NOT NULL DEFAULT now()
);
