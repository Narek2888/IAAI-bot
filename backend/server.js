import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

const app = express();

// Ensure JSON parsing is enabled (missing this can cause req.body to be undefined)
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Basic request logger (redacts password)
app.use((req, res, next) => {
  const safeBody =
    req.body && typeof req.body === "object"
      ? { ...req.body, password: req.body.password ? "<redacted>" : undefined }
      : req.body;
  console.log(`[API] ${req.method} ${req.url}`, safeBody);
  next();
});

// --- store helpers (make sure store.json can't crash server) ---
const DATA_FILE = path.join(__dirname, "store.json");

function ensureStoreShape(s) {
  if (!s || typeof s !== "object") return { users: [], tokens: {}, bots: {} };
  return {
    users: Array.isArray(s.users) ? s.users : [],
    tokens: s.tokens && typeof s.tokens === "object" ? s.tokens : {},
    bots: s.bots && typeof s.bots === "object" ? s.bots : {},
  };
}

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const init = { users: [], tokens: {}, bots: {} };
      fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2), "utf8");
      return init;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return ensureStoreShape(JSON.parse(raw || "{}"));
  } catch (err) {
    console.error("[store] load error:", err);
    return { users: [], tokens: {}, bots: {} };
  }
}

function saveStore(s) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), "utf8");
}

let store = loadStore();
function persist() {
  saveStore(store);
}

// --- USER HELPERS ---
function findUserByUsername(username) {
  return store.users.find((u) => u.username === username);
}

// --- SIGNUP ---
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !password) {
      return res
        .status(400)
        .json({ ok: false, msg: "username and password required" });
    }
    if (findUserByUsername(username)) {
      return res.status(400).json({ ok: false, msg: "username exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = {
      id: Date.now(),
      username,
      email: email || null,
      password: hashed,
      filter: {},
    };
    store.users.push(user);
    persist();

    const token = uuidv4();
    store.tokens[token] = user.id;
    persist();

    return res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        filter: user.filter,
      },
      token,
    });
  } catch (err) {
    console.error("[signup] unexpected error:", err);
    return res.status(500).json({ ok: false, msg: "internal server error" });
  }
});

// --- SIGNIN (wrap in try/catch and validate fields to avoid 500) ---
app.post("/api/auth/signin", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ ok: false, msg: "username and password required" });
    }
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ ok: false, msg: "invalid payload" });
    }

    const user = findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ ok: false, msg: "invalid credentials" });
    }

    // Prevent bcrypt crashing if stored user has bad shape
    if (!user.password || typeof user.password !== "string") {
      console.error("[signin] stored user has no password hash:", {
        id: user.id,
        username: user.username,
      });
      return res
        .status(500)
        .json({ ok: false, msg: "invalid user record on server" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ ok: false, msg: "invalid credentials" });
    }

    const token = uuidv4();
    store.tokens[token] = user.id;
    persist();

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email ?? null,
        // preserve any existing filter fields if you store them this way
        filter_name: user.filter_name ?? user.filter?.filter_name ?? null,
        year_from: user.year_from ?? user.filter?.year_from ?? null,
        year_to: user.year_to ?? user.filter?.year_to ?? null,
        auction_type: user.auction_type ?? user.filter?.auction_type ?? null,
        inventory_type:
          user.inventory_type ?? user.filter?.inventory_type ?? null,
        min_bid: user.min_bid ?? user.filter?.min_bid ?? null,
        max_bid: user.max_bid ?? user.filter?.max_bid ?? null,
        odo_from: user.odo_from ?? user.filter?.odo_from ?? null,
        odo_to: user.odo_to ?? user.filter?.odo_to ?? null,
      },
      token,
    });
  } catch (err) {
    console.error("[signin] unexpected error:", err);
    return res.status(500).json({ ok: false, msg: "internal server error" });
  }
});

// last middleware: express error handler (helps avoid silent 500s)
app.use((err, req, res, next) => {
  console.error("[express] unhandled error:", err);
  res.status(500).json({ ok: false, msg: "internal server error" });
});

export default app;
