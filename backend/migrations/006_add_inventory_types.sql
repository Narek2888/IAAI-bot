-- Add multi-select inventory types (checkbox UI)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS inventory_types TEXT[];

-- Backfill from legacy single-select column
UPDATE users
SET inventory_types = ARRAY[inventory_type]
WHERE inventory_types IS NULL AND inventory_type IS NOT NULL AND inventory_type <> '';
