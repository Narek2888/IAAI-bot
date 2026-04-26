ALTER TABLE users
  DROP COLUMN IF EXISTS copart_auction_type,
  DROP COLUMN IF EXISTS copart_inventory_type,
  DROP COLUMN IF EXISTS copart_inventory_types,
  DROP COLUMN IF EXISTS copart_fuel_type,
  DROP COLUMN IF EXISTS copart_fuel_types;
