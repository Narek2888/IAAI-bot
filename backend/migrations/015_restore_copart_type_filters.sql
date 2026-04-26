ALTER TABLE users
  ADD COLUMN IF NOT EXISTS copart_auction_type TEXT,
  ADD COLUMN IF NOT EXISTS copart_inventory_type TEXT,
  ADD COLUMN IF NOT EXISTS copart_inventory_types TEXT[],
  ADD COLUMN IF NOT EXISTS copart_fuel_type TEXT,
  ADD COLUMN IF NOT EXISTS copart_fuel_types TEXT[];
