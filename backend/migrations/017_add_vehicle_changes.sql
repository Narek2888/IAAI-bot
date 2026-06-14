CREATE TABLE IF NOT EXISTS vehicle_changes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source VARCHAR(10) NOT NULL,
  profile_id INTEGER REFERENCES search_profiles(id) ON DELETE CASCADE,
  stock_id TEXT,
  vehicle_link TEXT,
  title TEXT,
  price TEXT,
  old_price TEXT,
  year INTEGER,
  odometer TEXT,
  image TEXT,
  buy_it_now BOOLEAN NOT NULL DEFAULT false,
  change_type TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vc_user_source
  ON vehicle_changes (user_id, source, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_vc_profile
  ON vehicle_changes (profile_id, detected_at DESC)
  WHERE profile_id IS NOT NULL;
