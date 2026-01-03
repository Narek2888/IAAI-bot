const express = require("express");
const router = express.Router();

// Dummy user info
router.get("/info", (req, res) => {
  const { username } = req.query;
  res.json({ ok: true, username });
});

module.exports = router;
