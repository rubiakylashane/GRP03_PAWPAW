CREATE TABLE IF NOT EXISTS auth_session (
  token_hash character(64) PRIMARY KEY,
  user_id integer NOT NULL REFERENCES user_account(user_id) ON DELETE CASCADE,
  role character varying NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp without time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_session_expiry
  ON auth_session (expires_at);
