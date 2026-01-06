-- Normalize usernames to lowercase and enforce case-insensitive uniqueness.
--
-- If there are existing usernames that differ only by case (e.g. "John" and "john"),
-- this migration will MERGE them into a single user row:
-- - Keeps the lowest id as the canonical user
-- - Re-points sessions to the canonical user
-- - Preserves filter/settings columns by filling nulls via COALESCE

DO $$
DECLARE
  grp RECORD;
  canonical_id INTEGER;
  dupe_id INTEGER;
  i INTEGER;
BEGIN
  FOR grp IN
    SELECT lower(username) AS username_lc, array_agg(id ORDER BY id) AS ids
    FROM users
    GROUP BY lower(username)
    HAVING COUNT(*) > 1
  LOOP
    canonical_id := grp.ids[1];

    FOR i IN 2..array_length(grp.ids, 1) LOOP
      dupe_id := grp.ids[i];

      -- Move related rows to canonical user
      UPDATE sessions
      SET user_id = canonical_id
      WHERE user_id = dupe_id;

      -- Merge user settings (do not overwrite canonical non-null values)
      UPDATE users u
      SET
        filter_name = COALESCE(u.filter_name, d.filter_name),
        year_from = COALESCE(u.year_from, d.year_from),
        year_to = COALESCE(u.year_to, d.year_to),
        auction_type = COALESCE(u.auction_type, d.auction_type),
        inventory_type = COALESCE(u.inventory_type, d.inventory_type),
        min_bid = COALESCE(u.min_bid, d.min_bid),
        max_bid = COALESCE(u.max_bid, d.max_bid),
        odo_from = COALESCE(u.odo_from, d.odo_from),
        odo_to = COALESCE(u.odo_to, d.odo_to)
      FROM users d
      WHERE u.id = canonical_id AND d.id = dupe_id;

      -- Remove duplicate user row
      DELETE FROM users WHERE id = dupe_id;
    END LOOP;

    -- Canonical username becomes lowercase
    UPDATE users SET username = grp.username_lc WHERE id = canonical_id;
  END LOOP;
END $$;

UPDATE users
SET username = lower(username)
WHERE username <> lower(username);

-- Enforce case-insensitive uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
  ON users (lower(username));
