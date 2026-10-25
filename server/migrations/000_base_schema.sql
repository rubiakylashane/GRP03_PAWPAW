CREATE TABLE IF NOT EXISTS user_account (
  user_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username character varying(50) NOT NULL UNIQUE,
  password_hash character varying(255) NOT NULL,
  role character varying(30) NOT NULL CHECK (
    role IN ('Pet Owner', 'Veterinarian', 'Staff', 'Admin')
  ),
  email character varying(100) UNIQUE,
  account_status character varying(20) NOT NULL DEFAULT 'Active' CHECK (
    account_status IN ('Active', 'Inactive')
  ),
  created_date timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  display_name character varying,
  phone character varying
);

CREATE TABLE IF NOT EXISTS owner (
  owner_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer UNIQUE REFERENCES user_account(user_id) ON DELETE SET NULL,
  name character varying(100) NOT NULL,
  email character varying(100) UNIQUE,
  phone character varying(20),
  address text,
  registration_date date NOT NULL DEFAULT CURRENT_DATE,
  first_name character varying,
  middle_name character varying,
  last_name character varying,
  photo text
);

CREATE TABLE IF NOT EXISTS veterinarian (
  veterinarian_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer UNIQUE REFERENCES user_account(user_id) ON DELETE SET NULL,
  name character varying(100) NOT NULL,
  specialization character varying(100),
  phone character varying(20),
  email character varying(100),
  license_number character varying(50) UNIQUE
);

CREATE TABLE IF NOT EXISTS service (
  service_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_name character varying(100) NOT NULL UNIQUE,
  price numeric(10, 2) NOT NULL CHECK (price >= 0),
  description text
);

CREATE TABLE IF NOT EXISTS pet (
  pet_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id integer NOT NULL REFERENCES owner(owner_id) ON DELETE RESTRICT,
  name character varying(100) NOT NULL,
  species character varying(50) NOT NULL,
  breed character varying(50),
  date_of_birth date,
  gender character varying(10),
  allergies text,
  notes text,
  photo text
);

CREATE TABLE IF NOT EXISTS appointment (
  appointment_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pet_id integer NOT NULL REFERENCES pet(pet_id) ON DELETE RESTRICT,
  veterinarian_id integer REFERENCES veterinarian(veterinarian_id) ON DELETE RESTRICT,
  appointment_date date NOT NULL,
  appointment_time time without time zone NOT NULL,
  reason text,
  status character varying(50) NOT NULL DEFAULT 'Scheduled' CHECK (
    status IN ('Pending', 'Scheduled', 'Approved', 'Checked-in', 'In Progress', 'Completed', 'Cancelled', 'No-show')
  ),
  created_date timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_date timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancellation_reason text,
  rescheduled_from_date date,
  rescheduled_from_time time without time zone,
  reschedule_reason text
);

CREATE TABLE IF NOT EXISTS appointment_service (
  appointment_id integer NOT NULL REFERENCES appointment(appointment_id) ON DELETE CASCADE,
  service_id integer NOT NULL REFERENCES service(service_id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (appointment_id, service_id)
);

CREATE TABLE IF NOT EXISTS medical_record (
  record_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appointment_id integer NOT NULL UNIQUE REFERENCES appointment(appointment_id) ON DELETE RESTRICT,
  diagnosis text NOT NULL,
  treatment text,
  notes text,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  services jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS prescription (
  prescription_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id integer NOT NULL REFERENCES medical_record(record_id) ON DELETE CASCADE,
  medication_name character varying(100) NOT NULL,
  dosage character varying(50) NOT NULL,
  instructions text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  date_prescribed date NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS vaccination (
  vaccination_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pet_id integer NOT NULL REFERENCES pet(pet_id) ON DELETE RESTRICT,
  veterinarian_id integer REFERENCES veterinarian(veterinarian_id) ON DELETE RESTRICT,
  vaccine_type character varying(100) NOT NULL,
  date_administered date NOT NULL,
  next_due_date date,
  notes text,
  administered_by character varying,
  appointment_id integer REFERENCES appointment(appointment_id) ON DELETE SET NULL,
  last_reminded_at timestamp without time zone,
  CHECK (next_due_date IS NULL OR next_due_date >= date_administered)
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer REFERENCES user_account(user_id) ON DELETE SET NULL,
  action_type character varying(50) NOT NULL CHECK (
    action_type IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT')
  ),
  table_name character varying(100) NOT NULL,
  record_id integer,
  action_description text,
  action_date timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification (
  notification_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES user_account(user_id) ON DELETE CASCADE,
  notification_type character varying NOT NULL,
  title character varying NOT NULL,
  message text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS auth_session (
  token_hash character(64) PRIMARY KEY,
  user_id integer NOT NULL REFERENCES user_account(user_id) ON DELETE CASCADE,
  role character varying NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp without time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_session_expiry
  ON auth_session (expires_at);

CREATE INDEX IF NOT EXISTS idx_notification_user_created
  ON notification (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vaccination_appointment
  ON vaccination (appointment_id);