-- Run through scripts/migrate.js, which wraps this migration in a transaction.
-- Existing tables are moved; records, constraints and added columns are retained.
-- Update backend search_path or qualify table names before restarting the app.

CREATE SCHEMA IF NOT EXISTS accounts;
CREATE SCHEMA IF NOT EXISTS clinic;
CREATE SCHEMA IF NOT EXISTS medical;
CREATE SCHEMA IF NOT EXISTS system;

ALTER TABLE public.user_account SET SCHEMA accounts;
ALTER TABLE public.owner SET SCHEMA accounts;
ALTER TABLE public.veterinarian SET SCHEMA accounts;
ALTER TABLE public.auth_session SET SCHEMA accounts;

ALTER TABLE public.service SET SCHEMA clinic;
ALTER TABLE public.pet SET SCHEMA clinic;
ALTER TABLE public.appointment SET SCHEMA clinic;
ALTER TABLE public.appointment_service SET SCHEMA clinic;

ALTER TABLE public.medical_record SET SCHEMA medical;
ALTER TABLE public.prescription SET SCHEMA medical;
ALTER TABLE public.vaccination SET SCHEMA medical;

ALTER TABLE public.audit_log SET SCHEMA system;
ALTER TABLE public.notification SET SCHEMA system;

-- Keep public.schema_migrations in place for the existing migration runner.
