const express = require("express");
const router = express.Router();

const db = require("./db");
const { authRequired } = require("./authMiddleware");

const SOURCE_IAAI = "IAAI";
const SOURCE_COPART = "COPART";

function normalizeAuctionSource(v) {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  return s === SOURCE_COPART ? SOURCE_COPART : SOURCE_IAAI;
}

function getFilterPrefix(source) {
  return source === SOURCE_COPART ? "copart_" : "";
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

function normalizeFullSearch(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function buildFilterColumnList(source) {
  const prefix = getFilterPrefix(source);
  return [
    `${prefix}filter_name AS filter_name`,
    `${prefix}full_search AS full_search`,
    `${prefix}year_from AS year_from`,
    `${prefix}year_to AS year_to`,
    `${prefix}auction_type AS auction_type`,
    `${prefix}inventory_type AS inventory_type`,
    `${prefix}inventory_types AS inventory_types`,
    `${prefix}fuel_type AS fuel_type`,
    `${prefix}fuel_types AS fuel_types`,
    `${prefix}min_bid AS min_bid`,
    `${prefix}max_bid AS max_bid`,
    `${prefix}odo_from AS odo_from`,
    `${prefix}odo_to AS odo_to`,
  ];
}

function schemaColumns(source) {
  const prefix = getFilterPrefix(source);
  return {
    filter_name: `${prefix}filter_name`,
    full_search: `${prefix}full_search`,
    year_from: `${prefix}year_from`,
    year_to: `${prefix}year_to`,
    auction_type: `${prefix}auction_type`,
    inventory_type: `${prefix}inventory_type`,
    inventory_types: `${prefix}inventory_types`,
    fuel_type: `${prefix}fuel_type`,
    fuel_types: `${prefix}fuel_types`,
    min_bid: `${prefix}min_bid`,
    max_bid: `${prefix}max_bid`,
    odo_from: `${prefix}odo_from`,
    odo_to: `${prefix}odo_to`,
  };
}

function getRequestSource(req) {
  return normalizeAuctionSource(req.body?.source ?? req.query?.source);
}

router.get("/", authRequired, (req, res) => {
  (async () => {
    const source = getRequestSource(req);
    const columns = buildFilterColumnList(source);
    const r = await db.query(
      `SELECT ${columns.join(", ")} FROM users WHERE id = $1`,
      [req.user.id],
    );
    return res.json({
      ok: true,
      source,
      filter: r.rows[0] || null,
    });
  })().catch((e) => {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Server error" });
  });
});

router.post("/", authRequired, (req, res) => {
  const source = getRequestSource(req);
  const f = req.body || {};
  const prefix = getFilterPrefix(source);
  const columns = schemaColumns(source);

  const inventoryTypesInput =
    f.inventory_types !== undefined
      ? f.inventory_types
      : (f.inventory_type ?? null);

  const fuelTypesInput =
    f.fuel_types !== undefined ? f.fuel_types : (f.fuel_type ?? null);

  const normalizedInventoryTypes = normalizeInventoryTypes(inventoryTypesInput);
  const legacyInventoryType =
    normalizeInventoryType(f.inventory_type ?? null) ??
    (Array.isArray(normalizedInventoryTypes)
      ? normalizedInventoryTypes[0]
      : null);

  (async () => {
    const query = `UPDATE users SET
        ${columns.filter_name} = $1,
        ${columns.full_search} = $2,
        ${columns.year_from} = $3,
        ${columns.year_to} = $4,
        ${columns.auction_type} = $5,
        ${columns.inventory_type} = $6,
        ${columns.inventory_types} = $7,
        ${columns.fuel_type} = $8,
        ${columns.fuel_types} = $9,
        ${columns.min_bid} = $10,
        ${columns.max_bid} = $11,
        ${columns.odo_from} = $12,
        ${columns.odo_to} = $13
       WHERE id = $14`;

    await db.query(query, [
      f.filter_name ?? null,
      normalizeFullSearch(f.full_search ?? null),
      toNumberOrNull(f.year_from),
      toNumberOrNull(f.year_to),
      normalizeAuctionType(f.auction_type ?? null),
      legacyInventoryType,
      normalizedInventoryTypes,
      normalizeFuelType(f.fuel_type ?? null),
      normalizeFuelTypes(fuelTypesInput),
      toNumberOrNull(f.min_bid),
      toNumberOrNull(f.max_bid),
      toNumberOrNull(f.odo_from),
      toNumberOrNull(f.odo_to),
      req.user.id,
    ]);

    try {
      const bot = require("./bot");
      if (typeof bot?.resetLastSeenForUser === "function") {
        await bot.resetLastSeenForUser(req.user.id, source);
      }
    } catch (e) {
      console.error("Failed to reset bot last_seen after saving filters:", e);
    }

    const saved = await db.query(
      `SELECT ${buildFilterColumnList(source).join(", ")} FROM users WHERE id = $1`,
      [req.user.id],
    );

    return res.json({
      ok: true,
      source,
      filter: saved.rows[0] || null,
    });
  })().catch((e) => {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Server error" });
  });
});

module.exports = router;
