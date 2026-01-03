const express = require("express");
const router = express.Router();

const db = require("./db");
const { authRequired } = require("./authMiddleware");

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

router.get("/", authRequired, (req, res) => {
  (async () => {
    const r = await db.query(
      `SELECT
        filter_name, year_from, year_to,
        auction_type, inventory_type,
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

  (async () => {
    await db.query(
      `UPDATE users SET
        filter_name = $1,
        year_from = $2,
        year_to = $3,
        auction_type = $4,
        inventory_type = $5,
        min_bid = $6,
        max_bid = $7,
        odo_from = $8,
        odo_to = $9
       WHERE id = $10`,
      [
        f.filter_name ?? null,
        toNumberOrNull(f.year_from),
        toNumberOrNull(f.year_to),
        f.auction_type ?? null,
        f.inventory_type ?? null,
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
        auction_type, inventory_type,
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
