require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { migrate } = require("./migrate");

const app = express();
// Vite dev server proxies /api -> http://127.0.0.1:5174 by default.
// Avoid defaulting to 5432 (Postgres default port).
const PORT = process.env.PORT || 5174;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

function getGitSha8() {
  const envKeys = [
    // Manual overrides
    "GIT_SHA",
    "VITE_GIT_SHA",
    // Railway
    "RAILWAY_GIT_COMMIT_SHA",
    // Common CI/CD providers
    "GITHUB_SHA",
    "CI_COMMIT_SHA",
    "VERCEL_GIT_COMMIT_SHA",
    "RENDER_GIT_COMMIT",
    "HEROKU_SLUG_COMMIT",
    "SOURCE_VERSION",
    "COMMIT_SHA",
  ];
  for (const k of envKeys) {
    const v = process.env[k];
    if (v) return String(v).trim().slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short=7 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "0000000";
  }
}

const SERVER_VERSION_7 = getGitSha8();

app.get("/api/version", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, version: SERVER_VERSION_7 });
});

// Public unsubscribe endpoint (used from email links)
app.use(require("./unsubscribe"));

app.use("/api/auth", require("./auth"));
app.use("/api/filters", require("./filters"));
const botRouter = require("./bot");
app.use("/api/bot", botRouter);

// Serve built Vite frontend (optional, for production deploys)
const FRONTEND_DIST = path.join(__dirname, "../frontend/dist");
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback, but never hijack API routes
  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
}

// Optional: helps diagnose future 404s
app.use("/api", (req, res) => {
  res
    .status(404)
    .json({ ok: false, msg: `Not found: ${req.method} ${req.originalUrl}` });
});

async function start() {
  await migrate();

  // IMPORTANT:
  // Do not auto-resume bots on deploy by default. This avoids restarting
  // everyone at the same time when a new version is deployed.
  // Opt-in only via BOT_AUTO_RESUME_ON_START=1.
  if (String(process.env.BOT_AUTO_RESUME_ON_START || "") === "1") {
    if (typeof botRouter.resumeContinuousBots === "function") {
      try {
        const r = await botRouter.resumeContinuousBots();
        console.log(
          `Resumed continuous bots: ${r?.resumed ?? 0} (pollMs=${
            r?.pollMs ?? "?"
          })`,
        );
      } catch (e) {
        console.error("Failed to resume continuous bots:", e);
      }
    }
  }

  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
}

start().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
