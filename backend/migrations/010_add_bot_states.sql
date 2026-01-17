-- Persist per-user bot state so deploy/restarts don't re-email everything
-- Stores the lastSeen map used for diffing vehicles (key -> normalized price)

CREATE TABLE IF NOT EXISTS bot_states (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_states_updated_at_idx ON bot_states(updated_at);
