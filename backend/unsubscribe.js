const express = require("express");

const db = require("./db");

const router = express.Router();

function esc(s) {
  const str = String(s ?? "");
  return str.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

function page({ title, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 24px;">
  <h2 style="margin: 0 0 12px 0;">${esc(title)}</h2>
  <div>${bodyHtml}</div>
</body>
</html>`;
}

function normalizeToken(token) {
  const t = String(token ?? "").trim();
  return t ? t : null;
}

async function unsubscribeByToken(token) {
  const t = normalizeToken(token);
  if (!t) {
    return { ok: false, status: 400, title: "Missing token" };
  }

  const r = await db.query(
    "UPDATE users SET email_unsubscribed = true WHERE unsubscribe_token = $1 RETURNING id",
    [t],
  );

  if (!r.rows[0]) {
    return { ok: false, status: 404, title: "Invalid unsubscribe link" };
  }

  return { ok: true, status: 200, title: "You are unsubscribed" };
}

router.get("/unsubscribe", async (req, res) => {
  try {
    const result = await unsubscribeByToken(req.query.token);

    if (!result.ok) {
      return res.status(result.status).send(
        page({
          title: result.title,
          bodyHtml: "<p>This unsubscribe link is invalid or missing.</p>",
        }),
      );
    }

    return res.status(200).send(
      page({
        title: result.title,
        bodyHtml:
          "<p>You will no longer receive IAAI update emails from this service.</p>",
      }),
    );
  } catch (e) {
    console.error("[unsubscribe] error:", e);
    return res.status(500).send(
      page({
        title: "Server error",
        bodyHtml: "<p>Please try again later.</p>",
      }),
    );
  }
});

// Support email clients that use List-Unsubscribe one-click POST
router.post(
  "/unsubscribe",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    try {
      const token = req.query.token || req.body?.token || null;
      const result = await unsubscribeByToken(token);
      // One-click expects a simple success response.
      return res
        .status(result.ok ? 200 : result.status)
        .send(result.ok ? "OK" : "Invalid");
    } catch (e) {
      console.error("[unsubscribe] error:", e);
      return res.status(500).send("Server error");
    }
  },
);

module.exports = router;
