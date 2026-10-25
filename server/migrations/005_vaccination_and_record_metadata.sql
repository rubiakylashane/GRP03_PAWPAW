ALTER TABLE vaccination
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamp without time zone;

ALTER TABLE medical_record
  ADD COLUMN IF NOT EXISTS services jsonb NOT NULL DEFAULT '[]'::jsonb;
