ALTER TABLE user_account
  ADD COLUMN IF NOT EXISTS display_name character varying,
  ADD COLUMN IF NOT EXISTS phone character varying;
