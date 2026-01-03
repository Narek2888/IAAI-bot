const db = require("./db");

function authRequired(req, res, next) {
  (async () => {
    const h = req.headers.authorization || "";
    const m = /^Bearer\s+(.+)$/.exec(h);
    const token = m ? m[1] : null;

    if (!token) return res.status(401).json({ ok: false, msg: "unauthorized" });

    const sessionRes = await db.query(
      "SELECT token, user_id FROM sessions WHERE token = $1",
      [token]
    );
    const session = sessionRes.rows[0];
    if (!session)
      return res.status(401).json({ ok: false, msg: "unauthorized" });

    const userRes = await db.query(
      "SELECT id, username, email, filter_name, year_from, year_to, auction_type, inventory_type, min_bid, max_bid, odo_from, odo_to FROM users WHERE id = $1",
      [session.user_id]
    );
    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ ok: false, msg: "unauthorized" });

    req.user = user;
    req.token = token;
    next();
  })().catch((e) => {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Server error" });
  });
}

module.exports = { authRequired };
