const express = require("express");
const router = express.Router();
const db = require("./db");
const { authRequired } = require("./authMiddleware");

const SOURCE_IAAI = "IAAI";
const SOURCE_COPART = "COPART";

function normalizeSource(v) {
  const s = String(v || "").trim().toUpperCase();
  return s === SOURCE_COPART ? SOURCE_COPART : SOURCE_IAAI;
}

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeAuctionType(v) {
  if (v === null || v === undefined || v === "") return null;
  return v === "Buy Now" ? v : null;
}

function normalizeInventoryType(v) {
  if (!v) return null;
  return v === "Automobiles" || v === "Motorcycles" ? v : null;
}

function normalizeInventoryTypes(v) {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  const out = arr.map(normalizeInventoryType).filter(Boolean);
  const unique = [...new Set(out)];
  return unique.length ? unique : null;
}

function normalizeFuelType(v) {
  if (!v) return null;
  return v === "Electric" || v === "Other" ? v : null;
}

function normalizeFuelTypes(v) {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  const out = arr.map(normalizeFuelType).filter(Boolean);
  const unique = [...new Set(out)];
  return unique.length ? unique : null;
}

function normalizeFullSearch(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function buildProfileFromBody(f) {
  const inventoryTypesInput =
    f.inventory_types !== undefined ? f.inventory_types : (f.inventory_type ?? null);
  const fuelTypesInput =
    f.fuel_types !== undefined ? f.fuel_types : (f.fuel_type ?? null);

  const normalizedInventoryTypes = normalizeInventoryTypes(inventoryTypesInput);
  const legacyInventoryType =
    normalizeInventoryType(f.inventory_type ?? null) ??
    (Array.isArray(normalizedInventoryTypes) ? normalizedInventoryTypes[0] : null);

  return {
    profile_name: normalizeFullSearch(f.profile_name) ?? "Profile 1",
    full_search: normalizeFullSearch(f.full_search ?? null),
    year_from: toNumberOrNull(f.year_from),
    year_to: toNumberOrNull(f.year_to),
    auction_type: normalizeAuctionType(f.auction_type ?? null),
    inventory_type: legacyInventoryType,
    inventory_types: normalizedInventoryTypes,
    fuel_type: normalizeFuelType(f.fuel_type ?? null),
    fuel_types: normalizeFuelTypes(fuelTypesInput),
    min_bid: toNumberOrNull(f.min_bid),
    max_bid: toNumberOrNull(f.max_bid),
    odo_from: toNumberOrNull(f.odo_from),
    odo_to: toNumberOrNull(f.odo_to),
  };
}

// GET /api/search-profiles?source=IAAI|COPART
router.get("/", authRequired, async (req, res) => {
  try {
    const source = normalizeSource(req.query.source);
    const r = await db.query(
      `SELECT id, user_id, source, profile_name, full_search, year_from, year_to,
              auction_type, inventory_type, inventory_types, fuel_type, fuel_types,
              min_bid, max_bid, odo_from, odo_to, bot_continuous, created_at
       FROM search_profiles
       WHERE user_id = $1 AND source = $2
       ORDER BY id`,
      [req.user.id, source],
    );
    return res.json({ ok: true, source, profiles: r.rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// POST /api/search-profiles?source=IAAI|COPART
router.post("/", authRequired, async (req, res) => {
  try {
    const source = normalizeSource(req.query.source);
    const p = buildProfileFromBody(req.body || {});

    const r = await db.query(
      `INSERT INTO search_profiles
         (user_id, source, profile_name, full_search, year_from, year_to,
          auction_type, inventory_type, inventory_types, fuel_type, fuel_types,
          min_bid, max_bid, odo_from, odo_to, bot_continuous)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, FALSE)
       RETURNING *`,
      [
        req.user.id, source,
        p.profile_name, p.full_search,
        p.year_from, p.year_to,
        p.auction_type, p.inventory_type, p.inventory_types,
        p.fuel_type, p.fuel_types,
        p.min_bid, p.max_bid,
        p.odo_from, p.odo_to,
      ],
    );
    return res.json({ ok: true, profile: r.rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// PUT /api/search-profiles/:id
router.put("/:id", authRequired, async (req, res) => {
  try {
    const profileId = parseInt(req.params.id, 10);
    if (!Number.isFinite(profileId)) {
      return res.status(400).json({ ok: false, msg: "Invalid profile id" });
    }

    const p = buildProfileFromBody(req.body || {});

    const r = await db.query(
      `UPDATE search_profiles SET
         profile_name = $1, full_search = $2,
         year_from = $3, year_to = $4,
         auction_type = $5, inventory_type = $6, inventory_types = $7,
         fuel_type = $8, fuel_types = $9,
         min_bid = $10, max_bid = $11,
         odo_from = $12, odo_to = $13
       WHERE id = $14 AND user_id = $15
       RETURNING *`,
      [
        p.profile_name, p.full_search,
        p.year_from, p.year_to,
        p.auction_type, p.inventory_type, p.inventory_types,
        p.fuel_type, p.fuel_types,
        p.min_bid, p.max_bid,
        p.odo_from, p.odo_to,
        profileId, req.user.id,
      ],
    );

    if (!r.rows[0]) {
      return res.status(404).json({ ok: false, msg: "Profile not found" });
    }

    // Reset lastSeen so the next run is a fresh scan
    try {
      const bot = require("./bot");
      if (typeof bot?.resetLastSeenForUser === "function") {
        const source = r.rows[0].source;
        await bot.resetLastSeenForUser(req.user.id, source, profileId);
      }
    } catch (e) {
      console.error("Failed to reset bot last_seen after saving profile:", e);
    }

    return res.json({ ok: true, profile: r.rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// DELETE /api/search-profiles/:id
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const profileId = parseInt(req.params.id, 10);
    if (!Number.isFinite(profileId)) {
      return res.status(400).json({ ok: false, msg: "Invalid profile id" });
    }

    // Fetch first so we can stop the bot and know the source
    const existing = await db.query(
      "SELECT id, source FROM search_profiles WHERE id = $1 AND user_id = $2",
      [profileId, req.user.id],
    );

    if (!existing.rows[0]) {
      return res.status(404).json({ ok: false, msg: "Profile not found" });
    }

    const source = existing.rows[0].source;

    // Stop bot if running for this profile
    try {
      const bot = require("./bot");
      if (typeof bot?.stopProfileBot === "function") {
        bot.stopProfileBot(req.user.id, source, profileId);
      }
    } catch (e) {
      console.error("Failed to stop bot before deleting profile:", e);
    }

    await db.query(
      "DELETE FROM search_profiles WHERE id = $1 AND user_id = $2",
      [profileId, req.user.id],
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

module.exports = router;
