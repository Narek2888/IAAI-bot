const { db } = require("../backend/db");
const { hashPassword, verifyPassword } = require("../backend/auth");

function createUser(username, email, password) {
  if (!username || !email || !password)
    return { ok: false, msg: "All fields are required" };
  if (password.length < 8)
    return { ok: false, msg: "Password must be at least 8 characters long" };

  try {
    const stmt = db.prepare(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)"
    );
    const info = stmt.run(
      username.trim(),
      email.trim(),
      hashPassword(password)
    );
    if (info.changes === 1)
      return {
        ok: true,
        msg: "User created successfully",
        user_id: info.lastInsertRowid,
      };
    return { ok: false, msg: "Failed to create user" };
  } catch (e) {
    if (e && e.code === "SQLITE_CONSTRAINT_UNIQUE")
      return { ok: false, msg: "Username or email already exists" };
    console.error("Create user error:", e);
    return { ok: false, msg: "Unable to create user at this time" };
  }
}

function authenticateUser(username, password) {
  if (!username || !password) return null;
  try {
    const row = db
      .prepare("SELECT id, password_hash FROM users WHERE username = ?")
      .get(username.trim());
    if (!row) return null;
    if (verifyPassword(password, row.password_hash)) return row.id;
    return null;
  } catch (e) {
    console.error("Auth error:", e);
    return null;
  }
}

function deleteUser(user_id) {
  try {
    const info = db.prepare("DELETE FROM users WHERE id = ?").run(user_id);
    return info.changes > 0;
  } catch (e) {
    console.error("Delete user error:", e);
    return false;
  }
}

function userExists(user_id) {
  try {
    const row = db.prepare("SELECT id FROM users WHERE id = ?").get(user_id);
    return !!row;
  } catch (e) {
    return false;
  }
}

function getUserEmail(user_id) {
  try {
    const row = db.prepare("SELECT email FROM users WHERE id = ?").get(user_id);
    return row ? row.email : null;
  } catch (e) {
    console.error("getUserEmail error:", e);
    return null;
  }
}

module.exports = { createUser, authenticateUser, deleteUser, userExists };
