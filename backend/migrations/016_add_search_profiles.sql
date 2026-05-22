CREATE TABLE IF NOT EXISTS search_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('IAAI', 'COPART')),
  profile_name TEXT,
  full_search TEXT,
  year_from INTEGER,
  year_to INTEGER,
  auction_type TEXT,
  inventory_type TEXT,
  inventory_types TEXT[],
  fuel_type TEXT,
  fuel_types TEXT[],
  min_bid INTEGER,
  max_bid INTEGER,
  odo_from INTEGER,
  odo_to INTEGER,
  bot_continuous BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_profiles_user_source ON search_profiles(user_id, source);

-- Migrate existing IAAI filters (bot_continuous starts as false; users re-enable in new UI)
INSERT INTO search_profiles (
  user_id, source, profile_name, full_search, year_from, year_to,
  auction_type, inventory_type, inventory_types, fuel_type, fuel_types,
  min_bid, max_bid, odo_from, odo_to, bot_continuous
)
SELECT
  id, 'IAAI',
  COALESCE(NULLIF(TRIM(filter_name), ''), 'Profile 1'),
  full_search, year_from, year_to, auction_type, inventory_type, inventory_types,
  fuel_type, fuel_types, min_bid, max_bid, odo_from, odo_to,
  FALSE
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM search_profiles sp WHERE sp.user_id = users.id AND sp.source = 'IAAI'
);

-- Migrate existing Copart filters
INSERT INTO search_profiles (
  user_id, source, profile_name, full_search, year_from, year_to,
  auction_type, inventory_type, inventory_types, fuel_type, fuel_types,
  min_bid, max_bid, odo_from, odo_to, bot_continuous
)
SELECT
  id, 'COPART',
  COALESCE(NULLIF(TRIM(copart_filter_name), ''), 'Profile 1'),
  copart_full_search, copart_year_from, copart_year_to, copart_auction_type,
  copart_inventory_type, copart_inventory_types, copart_fuel_type, copart_fuel_types,
  copart_min_bid, copart_max_bid, copart_odo_from, copart_odo_to,
  FALSE
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM search_profiles sp WHERE sp.user_id = users.id AND sp.source = 'COPART'
);

-- Clear legacy bot_continuous flags so legacy bots don't run alongside profile bots
UPDATE users SET bot_continuous = FALSE, copart_bot_continuous = FALSE;
