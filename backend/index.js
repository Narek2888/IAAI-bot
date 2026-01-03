require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { migrate } = require("./migrate");

const app = express();
const PORT = process.env.PORT || 5174;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", require("./auth"));
app.use("/api/filters", require("./filters"));
app.use("/api/bot", require("./bot"));

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
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
}

start().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
