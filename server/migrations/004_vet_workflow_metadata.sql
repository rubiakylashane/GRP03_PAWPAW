ALTER TABLE appointment
  ADD COLUMN IF NOT EXISTS reschedule_reason text;

ALTER TABLE vaccination
  ADD COLUMN IF NOT EXISTS appointment_id integer
  REFERENCES appointment(appointment_id) ON DELETE SET NULL;

ALTER TABLE vaccination
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamp without time zone;

CREATE INDEX IF NOT EXISTS idx_vaccination_appointment
  ON vaccination (appointment_id);

ALTER TABLE medical_record
  ADD COLUMN IF NOT EXISTS services jsonb NOT NULL DEFAULT '[]'::jsonb;
