ALTER TABLE appointment
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS rescheduled_from_date date,
  ADD COLUMN IF NOT EXISTS rescheduled_from_time time without time zone;

INSERT INTO service (service_name, description, price)
SELECT seed.service_name, seed.description, seed.price
FROM (VALUES
  ('Vaccination', 'Core and booster vaccines, recorded in your pet''s history with the next due date.', 350),
  ('Anti Rabies', 'Rabies vaccination.', 350),
  ('5-in-1 DHPPL', 'Canine 5-in-1 vaccination.', 350),
  ('Feline 4-in-1', 'Feline 4-in-1 vaccination.', 350),
  ('Kennel Cough', 'Bordetella vaccination.', 350),
  ('Deworming', 'Treatment for common intestinal parasites.', 250),
  ('Grooming', 'Bath, brush, nail trim, and ear cleaning.', 600),
  ('Dental Cleaning', 'Dental scaling and polishing.', 1500),
  ('Laboratory Test', 'Blood and other laboratory work.', 900)
) AS seed(service_name, description, price)
WHERE NOT EXISTS (
  SELECT 1 FROM service existing WHERE LOWER(existing.service_name) = LOWER(seed.service_name)
);
