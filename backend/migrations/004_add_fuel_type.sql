-- Add fuel_type filter (used to populate IAAI facet FuelTypeDesc)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS fuel_type TEXT;
