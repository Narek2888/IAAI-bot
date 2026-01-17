const express = require("express");
const router = express.Router();

const db = require("./db");
const { authRequired } = require("./authMiddleware");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sendOtpEmail } = require("./mailer");

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
    full_search: u.full_search ?? null,
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

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function otpSecret() {
  // In production, set OTP_SECRET to a strong random string.
  return process.env.OTP_SECRET || "dev-otp-secret";
}

function makeOtp() {
  // 6 digit numeric OTP
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, "0");
}

function otpHash({ nonce, otp }) {
  const h = crypto.createHash("sha256");
  h.update(`${nonce}:${otp}:${otpSecret()}`);
  return h.digest("hex");
}

async function cleanupExpiredOtps() {
  // best-effort cleanup
  try {
    await db.query(
      "DELETE FROM email_otps WHERE expires_at < now() - interval '1 hour'"
    );
  } catch {
    // ignore
  }
}

// Request OTP for changing email (logged-in user)
router.post("/change-email/request-otp", authRequired, async (req, res) => {
  const { newEmail } = req.body || {};
  if (!newEmail) {
    return res.status(400).json({ ok: false, msg: "Missing newEmail" });
  }

  const userId = req.user.id;
  const emailNorm = normalizeEmail(newEmail);

  try {
    await cleanupExpiredOtps();

    // prevent setting the same email
    if (normalizeEmail(req.user.email) === emailNorm) {
      return res.status(400).json({ ok: false, msg: "Email is unchanged" });
    }

    // Optional safety: prevent two accounts sharing the same email
    const existingEmail = await db.query(
      "SELECT id FROM users WHERE lower(email) = $1 AND id <> $2 LIMIT 1",
      [emailNorm, userId]
    );
    if (existingEmail.rows[0]) {
      return res.status(400).json({ ok: false, msg: "Email already in use" });
    }

    const nonce = crypto.randomUUID();
    const otp = makeOtp();
    const hash = otpHash({ nonce, otp });
    const ttlMinutes = Number(process.env.OTP_TTL_MINUTES || 10);

    // Replace any active OTPs for this user/purpose
    await db.query(
      "DELETE FROM email_otps WHERE user_id = $1 AND purpose = $2",
      [userId, "change_email"]
    );

    await db.query(
      "INSERT INTO email_otps (email, user_id, purpose, nonce, otp_hash, expires_at) VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval)",
      [emailNorm, userId, "change_email", nonce, hash, String(ttlMinutes)]
    );

    await sendOtpEmail({ to: emailNorm, otp });
    return res.json({ ok: true, nonce });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// Verify OTP and change email (logged-in user)
router.post("/change-email/verify", authRequired, async (req, res) => {
  const { newEmail, otp, nonce } = req.body || {};
  if (!newEmail || !otp || !nonce) {
    return res
      .status(400)
      .json({ ok: false, msg: "Missing newEmail/otp/nonce" });
  }

  const userId = req.user.id;
  const emailNorm = normalizeEmail(newEmail);

  try {
    const expectedHash = otpHash({ nonce: String(nonce), otp: String(otp) });
    const otpRow = await db.query(
      "SELECT id, otp_hash, attempts, expires_at FROM email_otps WHERE nonce = $1 AND user_id = $2 AND purpose = $3 AND email = $4 LIMIT 1",
      [String(nonce), userId, "change_email", emailNorm]
    );

    const rec = otpRow.rows[0];
    if (!rec) {
      return res.status(400).json({ ok: false, msg: "Invalid OTP session" });
    }

    if (new Date(rec.expires_at).getTime() < Date.now()) {
      await db.query("DELETE FROM email_otps WHERE id = $1", [rec.id]);
      return res.status(400).json({ ok: false, msg: "OTP expired" });
    }

    if (Number(rec.attempts || 0) >= 5) {
      return res
        .status(400)
        .json({ ok: false, msg: "Too many attempts. Request a new code." });
    }

    if (String(rec.otp_hash) !== expectedHash) {
      await db.query(
        "UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1",
        [rec.id]
      );
      return res.status(400).json({ ok: false, msg: "Invalid OTP" });
    }

    // verified: consume OTP
    await db.query("DELETE FROM email_otps WHERE id = $1", [rec.id]);

    // enforce uniqueness again at verify-time
    const existingEmail = await db.query(
      "SELECT id FROM users WHERE lower(email) = $1 AND id <> $2 LIMIT 1",
      [emailNorm, userId]
    );
    if (existingEmail.rows[0]) {
      return res.status(400).json({ ok: false, msg: "Email already in use" });
    }

    const updated = await db.query(
      "UPDATE users SET email = $1 WHERE id = $2 RETURNING *",
      [emailNorm, userId]
    );

    return res.json({ ok: true, user: publicUser(updated.rows[0]) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// Request OTP for signup
router.post("/signup/request-otp", async (req, res) => {
  const { username, email } = req.body || {};
  if (!username || !email) {
    return res.status(400).json({ ok: false, msg: "Missing username/email" });
  }

  const usernameNorm = normalizeUsername(username);
  const emailNorm = normalizeEmail(email);

  try {
    await cleanupExpiredOtps();

    // Prevent duplicates ignoring case
    const existing = await db.query(
      "SELECT id FROM users WHERE lower(username) = $1 LIMIT 1",
      [usernameNorm]
    );
    if (existing.rows[0]) {
      return res.status(400).json({ ok: false, msg: "User already exists" });
    }

    const nonce = crypto.randomUUID();
    const otp = makeOtp();
    const hash = otpHash({ nonce, otp });
    const ttlMinutes = Number(process.env.OTP_TTL_MINUTES || 10);

    // Replace any active OTPs for this email/username (simple anti-spam)
    await db.query(
      "DELETE FROM email_otps WHERE email = $1 AND username = $2",
      [emailNorm, usernameNorm]
    );

    await db.query(
      "INSERT INTO email_otps (email, username, nonce, otp_hash, expires_at) VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)",
      [emailNorm, usernameNorm, nonce, hash, String(ttlMinutes)]
    );

    await sendOtpEmail({ to: emailNorm, otp });
    return res.json({ ok: true, nonce });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// Forgot password: request OTP (by username or email)
router.post("/forgot-password/request-otp", async (req, res) => {
  const { usernameOrEmail } = req.body || {};
  const q = String(usernameOrEmail || "").trim();
  if (!q) {
    return res.status(400).json({ ok: false, msg: "Missing usernameOrEmail" });
  }

  try {
    await cleanupExpiredOtps();

    const qNorm = q.toLowerCase();
    const userRes = await db.query(
      "SELECT id, email FROM users WHERE lower(username) = $1 OR lower(email) = $1 LIMIT 1",
      [qNorm]
    );
    const user = userRes.rows[0];

    // Do not leak whether an account exists.
    if (!user) {
      return res.json({ ok: true });
    }

    const userId = user.id;
    const emailNorm = normalizeEmail(user.email);

    const nonce = crypto.randomUUID();
    const otp = makeOtp();
    const hash = otpHash({ nonce, otp });
    const ttlMinutes = Number(process.env.OTP_TTL_MINUTES || 10);

    await db.query(
      "DELETE FROM email_otps WHERE user_id = $1 AND purpose = $2",
      [userId, "reset_password"]
    );

    await db.query(
      "INSERT INTO email_otps (email, user_id, purpose, nonce, otp_hash, expires_at) VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval)",
      [emailNorm, userId, "reset_password", nonce, hash, String(ttlMinutes)]
    );

    await sendOtpEmail({ to: emailNorm, otp });
    return res.json({ ok: true, nonce });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// Forgot password: verify OTP and set new password
router.post("/forgot-password/reset", async (req, res) => {
  const { nonce, otp, newPassword } = req.body || {};
  if (!nonce || !otp || !newPassword) {
    return res
      .status(400)
      .json({ ok: false, msg: "Missing nonce/otp/newPassword" });
  }

  try {
    const expectedHash = otpHash({ nonce: String(nonce), otp: String(otp) });
    const otpRow = await db.query(
      "SELECT id, otp_hash, attempts, expires_at, user_id FROM email_otps WHERE nonce = $1 AND purpose = $2 LIMIT 1",
      [String(nonce), "reset_password"]
    );

    const rec = otpRow.rows[0];
    if (!rec) {
      return res.status(400).json({ ok: false, msg: "Invalid OTP session" });
    }

    if (new Date(rec.expires_at).getTime() < Date.now()) {
      await db.query("DELETE FROM email_otps WHERE id = $1", [rec.id]);
      return res.status(400).json({ ok: false, msg: "OTP expired" });
    }

    if (Number(rec.attempts || 0) >= 5) {
      return res
        .status(400)
        .json({ ok: false, msg: "Too many attempts. Request a new code." });
    }

    if (String(rec.otp_hash) !== expectedHash) {
      await db.query(
        "UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1",
        [rec.id]
      );
      return res.status(400).json({ ok: false, msg: "Invalid OTP" });
    }

    const userId = rec.user_id;
    const hash = await bcrypt.hash(String(newPassword), 10);

    await db.tx(async (client) => {
      await client.query("UPDATE users SET password = $1 WHERE id = $2", [
        hash,
        userId,
      ]);
      // revoke sessions after password reset
      await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM email_otps WHERE id = $1", [rec.id]);
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// SIGNUP
router.post("/signup", async (req, res) => {
  const { username, email, password, otp, nonce } = req.body || {};
  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ ok: false, msg: "Missing username/email/password" });
  }

  // Enforce OTP by default; allow disabling for local/dev scripts.
  const otpDisabled = process.env.AUTH_EMAIL_OTP_DISABLED === "1";
  if (!otpDisabled && (!otp || !nonce)) {
    return res
      .status(400)
      .json({ ok: false, msg: "Email verification required" });
  }

  try {
    const usernameNorm = normalizeUsername(username);
    const emailNorm = normalizeEmail(email);
    const hash = await bcrypt.hash(String(password), 10);

    if (!otpDisabled) {
      const expectedHash = otpHash({ nonce: String(nonce), otp: String(otp) });
      const otpRow = await db.query(
        "SELECT id, otp_hash, attempts, expires_at, username FROM email_otps WHERE nonce = $1 AND email = $2 LIMIT 1",
        [String(nonce), emailNorm]
      );

      const rec = otpRow.rows[0];
      if (!rec) {
        return res.status(400).json({ ok: false, msg: "Invalid OTP session" });
      }

      if (rec.username && String(rec.username) !== usernameNorm) {
        return res.status(400).json({ ok: false, msg: "Invalid OTP session" });
      }

      if (new Date(rec.expires_at).getTime() < Date.now()) {
        await db.query("DELETE FROM email_otps WHERE id = $1", [rec.id]);
        return res.status(400).json({ ok: false, msg: "OTP expired" });
      }

      if (Number(rec.attempts || 0) >= 5) {
        return res
          .status(400)
          .json({ ok: false, msg: "Too many attempts. Request a new code." });
      }

      if (String(rec.otp_hash) !== expectedHash) {
        await db.query(
          "UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1",
          [rec.id]
        );
        return res.status(400).json({ ok: false, msg: "Invalid OTP" });
      }

      // OTP verified: delete it to prevent reuse.
      await db.query("DELETE FROM email_otps WHERE id = $1", [rec.id]);
    }

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
