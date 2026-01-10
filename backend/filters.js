const express = require("express");
const router = express.Router();

const db = require("./db");
const { authRequired } = require("./authMiddleware");

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
  if (v === null || v === undefined || v === "") return null;
  return v === "Automobiles" || v === "Motorcycles" ? v : null;
}

function normalizeInventoryTypes(v) {
  if (v === null || v === undefined || v === "") return null;

  const arr = Array.isArray(v) ? v : [v];
  const normalized = [];

  for (const raw of arr) {
    const one = normalizeInventoryType(raw);
    if (!one) continue;
    if (!normalized.includes(one)) normalized.push(one);
  }

  return normalized.length ? normalized : null;
}

function normalizeFuelType(v) {
  if (v === null || v === undefined || v === "") return null;
  return v === "Electric" || v === "Other" ? v : null;
}

function normalizeFuelTypes(v) {
  if (v === null || v === undefined || v === "") return null;

  const arr = Array.isArray(v) ? v : [v];
  const normalized = [];

  for (const raw of arr) {
    const one = normalizeFuelType(raw);
    if (!one) continue;
    if (!normalized.includes(one)) normalized.push(one);
  }

  return normalized.length ? normalized : null;
}

router.get("/", authRequired, (req, res) => {
  (async () => {
    const r = await db.query(
      `SELECT
        filter_name, year_from, year_to,
        auction_type, inventory_type, inventory_types, fuel_type, fuel_types,
        min_bid, max_bid,
        odo_from, odo_to
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );
    return res.json({ ok: true, filter: r.rows[0] || null });
  })().catch((e) => {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Server error" });
  });
});

router.post("/", authRequired, (req, res) => {
  const f = req.body || {};

  // Prefer new multi-select field; accept legacy single value for older clients.
  const inventoryTypesInput =
    f.inventory_types !== undefined
      ? f.inventory_types
      : f.inventory_type ?? null;

  // Prefer new multi-select field; accept legacy single value for older clients.
  const fuelTypesInput =
    f.fuel_types !== undefined ? f.fuel_types : f.fuel_type ?? null;

  const normalizedInventoryTypes = normalizeInventoryTypes(inventoryTypesInput);
  const legacyInventoryType =
    normalizeInventoryType(f.inventory_type ?? null) ??
    (Array.isArray(normalizedInventoryTypes)
      ? normalizedInventoryTypes[0]
      : null);

  (async () => {
    await db.query(
      `UPDATE users SET
        filter_name = $1,
        year_from = $2,
        year_to = $3,
        auction_type = $4,
        inventory_type = $5,
        inventory_types = $6,
        fuel_type = $7,
        fuel_types = $8,
        min_bid = $9,
        max_bid = $10,
        odo_from = $11,
        odo_to = $12
       WHERE id = $13`,
      [
        f.filter_name ?? null,
        toNumberOrNull(f.year_from),
        toNumberOrNull(f.year_to),
        normalizeAuctionType(f.auction_type ?? null),
        legacyInventoryType,
        normalizedInventoryTypes,
        // Keep legacy single-select column for compatibility.
        normalizeFuelType(f.fuel_type ?? null),
        normalizeFuelTypes(fuelTypesInput),
        toNumberOrNull(f.min_bid),
        toNumberOrNull(f.max_bid),
        toNumberOrNull(f.odo_from),
        toNumberOrNull(f.odo_to),
        req.user.id,
      ]
    );

    const saved = await db.query(
      `SELECT
        filter_name, year_from, year_to,
        auction_type, inventory_type, inventory_types, fuel_type, fuel_types,
        min_bid, max_bid,
        odo_from, odo_to
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    return res.json({ ok: true, filter: saved.rows[0] || null });
  })().catch((e) => {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Server error" });
  });
});

module.exports = router;
