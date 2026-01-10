-- Add multi-select fuel types (array) and backfill from legacy single fuel_type.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS fuel_types TEXT[];

-- Backfill from existing single-select value.
UPDATE users
SET fuel_types = ARRAY[fuel_type]
WHERE fuel_type IS NOT NULL
  AND (fuel_types IS NULL OR array_length(fuel_types, 1) IS NULL);
