const express = require("express");
const router = express.Router();

const db = require("./db");
const { authRequired } = require("./authMiddleware");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

function makeToken() {
  return crypto.randomUUID();
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    filter_name: u.filter_name ?? null,
    year_from: u.year_from ?? null,
    year_to: u.year_to ?? null,
    auction_type: u.auction_type ?? null,
    inventory_type: u.inventory_type ?? null,
    inventory_types: Array.isArray(u.inventory_types)
      ? u.inventory_types
      : null,
    fuel_type: u.fuel_type ?? null,
    fuel_types: Array.isArray(u.fuel_types) ? u.fuel_types : null,
    min_bid: u.min_bid ?? null,
    max_bid: u.max_bid ?? null,
    odo_from: u.odo_from ?? null,
    odo_to: u.odo_to ?? null,
  };
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase();
}

// SIGNUP
router.post("/signup", async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ ok: false, msg: "Missing username/email/password" });
  }

  try {
    const usernameNorm = normalizeUsername(username);
    const emailNorm = String(email).trim();
    const hash = await bcrypt.hash(String(password), 10);

    // Prevent duplicates ignoring case, even if the DB constraint is case-sensitive.
    const existing = await db.query(
      "SELECT id FROM users WHERE lower(username) = $1 LIMIT 1",
      [usernameNorm]
    );
    if (existing.rows[0]) {
      return res.status(400).json({ ok: false, msg: "User already exists" });
    }

    const { user, token } = await db.tx(async (client) => {
      const inserted = await client.query(
        "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *",
        [usernameNorm, emailNorm, hash]
      );
      const createdUser = inserted.rows[0];

      const newToken = makeToken();
      await client.query(
        "INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)",
        [newToken, createdUser.id, Date.now()]
      );

      return { user: createdUser, token: newToken };
    });

    return res.json({ ok: true, user: publicUser(user), token });
  } catch (e) {
    // Postgres unique violation
    if (e && e.code === "23505") {
      return res.status(400).json({ ok: false, msg: "User already exists" });
    }
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// SIGNIN
router.post("/signin", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res
      .status(400)
      .json({ ok: false, msg: "Missing username/password" });
  }

  let user;
  try {
    const usernameNorm = normalizeUsername(username);
    const r = await db.query(
      "SELECT * FROM users WHERE lower(username) = $1 LIMIT 1",
      [usernameNorm]
    );
    user = r.rows[0];
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }

  if (!user)
    return res.status(401).json({ ok: false, msg: "Invalid credentials" });

  const match = await bcrypt.compare(String(password), user.password);
  if (!match)
    return res.status(401).json({ ok: false, msg: "Invalid credentials" });

  const token = makeToken();
  try {
    await db.query(
      "INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)",
      [token, user.id, Date.now()]
    );
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }

  return res.json({ ok: true, user: publicUser(user), token });
});

// LOGOUT (delete current session token)
router.post("/logout", authRequired, async (req, res) => {
  try {
    const token = req.token;
    if (token) {
      await db.query("DELETE FROM sessions WHERE token = $1", [token]);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// Delete current user's account + related sessions
router.post("/delete", authRequired, (req, res) => {
  try {
    const userId = req.user.id;

    db.tx(async (client) => {
      await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
    })
      .then(() => res.json({ ok: true }))
      .catch((e) => {
        console.error(e);
        res.status(500).json({ ok: false, msg: "Failed to delete account" });
      });

    return;
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Failed to delete account" });
  }
});

// Change password (logged-in user)
router.post("/change-password", authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ ok: false, msg: "Missing currentPassword/newPassword" });
  }

  try {
    const userId = req.user.id;
    const r = await db.query("SELECT id, password FROM users WHERE id = $1", [
      userId,
    ]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ ok: false, msg: "unauthorized" });

    const match = await bcrypt.compare(String(currentPassword), user.password);
    if (!match)
      return res
        .status(401)
        .json({ ok: false, msg: "Current password is incorrect" });

    const hash = await bcrypt.hash(String(newPassword), 10);
    await db.query("UPDATE users SET password = $1 WHERE id = $2", [
      hash,
      userId,
    ]);

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

module.exports = router;
