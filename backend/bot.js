const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto"); // ADD

const db = require("./db");
const { authRequired } = require("./authMiddleware");
const { extractVehiclesFromHtml } = require("./scrapeIaai");
const { sendVehiclesEmail } = require("./mailer");

const router = express.Router();

const BASE_URL = "https://www.iaai.com";
const makeApiUrl = () => `${BASE_URL}/Search?c=${Date.now()}`;

const IAAI_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json",
  Referer: "https://www.iaai.com/advanced-search",
  Origin: "https://www.iaai.com",
  "X-Requested-With": "XMLHttpRequest",
};

// per-user bot state
const states = new Map(); // userId -> state

async function setBotContinuous(userId, enabled) {
  await db.query("UPDATE users SET bot_continuous = $1 WHERE id = $2", [
    !!enabled,
    userId,
  ]);
}

async function getBotContinuous(userId) {
  const r = await db.query(
    "SELECT bot_continuous FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const row = r.rows[0];
  return row ? !!row.bot_continuous : false;
}

function hasAnyFiltersSet(u) {
  if (!u) return false;
  return [
    u.filter_name,
    u.year_from,
    u.year_to,
    u.auction_type,
    u.inventory_type,
    Array.isArray(u.inventory_types) ? u.inventory_types.join(",") : null,
    u.fuel_type,
    Array.isArray(u.fuel_types) ? u.fuel_types.join(",") : null,
    u.min_bid,
    u.max_bid,
    u.odo_from,
    u.odo_to,
  ].some((v) => v !== null && v !== undefined && String(v).trim() !== "");
}

function getState(userId) {
  if (!states.has(userId)) {
    states.set(userId, {
      running: false,
      inFlight: false,
      lastOutput: null,
      lastRunAt: null,
      timer: null,

      // persisted preference (DB)
      continuousEnabled: null,
      lastContinuousAt: 0,

      lastSeen: {},
      lastCount: 0,

      // NEW: status response coalescing
      lastStatusAt: 0,
      lastStatusJson: null,
      lastStatusEtag: null,

      lastIaaiRequest: null,
      lastIaaiResponse: null,
      lastUserFilters: null,
    });
  }
  return states.get(userId);
}

async function refreshContinuousState(userId, st, maxAgeMs = 5000) {
  const now = Date.now();
  if (st.continuousEnabled !== null && now - st.lastContinuousAt < maxAgeMs) {
    return st.continuousEnabled;
  }
  const enabled = await getBotContinuous(userId);
  st.continuousEnabled = enabled;
  st.lastContinuousAt = now;
  return enabled;
}

function computeEtag(obj) {
  const s = JSON.stringify(obj ?? {});
  return crypto.createHash("sha1").update(s).digest("hex");
}

// Normalize price so we can reliably detect changes:
// "$1,400 USD" -> "1400"
// "$1400" -> "1400"
// "1400" -> "1400"
// otherwise -> trimmed string or null
function normPrice(p) {
  if (p === null || p === undefined) return null;
  const s = String(p).trim();
  if (!s) return null;

  const m = s.match(/\$[\d,]+(?:\.\d{2})?/);
  if (m) return m[0].replace(/[^0-9.]/g, "");

  const digits = s.replace(/[^0-9.]/g, "");
  return digits ? digits : s;
}

function diffVehicles(prevSeen, currentVehicles) {
  const changes = [];
  const nextSeen = {};

  for (const v of currentVehicles || []) {
    const key = makeKey(v);
    if (!key) continue;

    const price = normPrice(v.price);
    nextSeen[key] = price;

    const prevPrice = Object.prototype.hasOwnProperty.call(prevSeen, key)
      ? prevSeen[key]
      : undefined;

    // New vehicle (new Stock ID or new Link)
    if (prevPrice === undefined) {
      changes.push({ ...v, changeType: "NEW", old_price: null });
      continue;
    }

    // Price changed (only if we have a current price and it differs)
    if (price !== null && prevPrice !== price) {
      changes.push({ ...v, changeType: "PRICE_CHANGED", old_price: prevPrice });
    }
  }

  return { changes, nextSeen };
}

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractImgSrc(imageValue) {
  if (!imageValue) return null;
  const s = String(imageValue);
  if (!s) return null;

  if (s.toLowerCase().includes("<img")) {
    const m = s.match(/src\s*=\s*["']([^"']+)["']/i);
    return m ? m[1] : null;
  }

  return s;
}

// ✅ MISSING HELPERS (were causing 500)
function pushLongRange(Searches, name, from, to) {
  const From = toNumberOrNull(from);
  const To = toNumberOrNull(to);
  if (From === null && To === null) return;

  Searches.push({
    Facets: null,
    FullSearch: null,
    LongRanges: [
      {
        From: From ?? 0,
        Name: name,
        To: To ?? From ?? 0,
      },
    ],
  });
}

function pushFacet(Searches, group, value, forAnalytics) {
  if (value === null || value === undefined || String(value).trim() === "")
    return;

  const facet = {
    Group: group,
    Value: String(value),
  };

  // request_data.js sometimes omits ForAnalytics; only include when explicitly passed.
  if (forAnalytics !== undefined) {
    facet.ForAnalytics = !!forAnalytics;
  }

  Searches.push({
    Facets: [facet],
    FullSearch: null,
    LongRanges: null,
  });
}

// EXACT shape as request_data.js, but values come from DB
function buildIaaiPayloadFromUserFilters(u) {
  const Searches = [];

  const inventoryTypes =
    Array.isArray(u.inventory_types) && u.inventory_types.length
      ? u.inventory_types
      : u.inventory_type
      ? [u.inventory_type]
      : [];
  const fuelTypes =
    Array.isArray(u.fuel_types) && u.fuel_types.length
      ? u.fuel_types
      : u.fuel_type
      ? [u.fuel_type]
      : [];

  // Keep payload stable and website-like ordering
  const fuelTypesOrdered = ["Electric", "Other"].filter((v) =>
    fuelTypes.includes(v)
  );
  const inventoryTypesOrdered = ["Automobiles", "Motorcycles"].filter((v) =>
    inventoryTypes.includes(v)
  );

  // Match real IAAI payload style: one Searches entry per facet value.
  for (const ft of fuelTypesOrdered) pushFacet(Searches, "FuelTypeDesc", ft);

  // Ranges and single facets
  pushLongRange(Searches, "ODOValue", u.odo_from, u.odo_to);
  // Auction Type is no longer user-configurable in the UI; always use Buy Now.
  pushFacet(Searches, "AuctionType", "Buy Now");
  pushLongRange(Searches, "MinimumBidAmount", u.min_bid, u.max_bid);
  const yearFrom = toNumberOrNull(u.year_from);
  const yearTo = toNumberOrNull(u.year_to);
  if (yearFrom === null && yearTo === null) {
    pushLongRange(Searches, "Year", 1900, 2027);
  } else {
    pushLongRange(Searches, "Year", yearFrom, yearTo);
  }

  for (const it of inventoryTypesOrdered)
    pushFacet(Searches, "InventoryTypes", it);

  return {
    Searches,
    ZipCode: "",
    miles: 0,
    PageSize: 100,
    CurrentPage: 1,
    Sort: [
      {
        IsGeoSort: false,
        SortField: "AuctionDateTime",
        IsDescending: false,
      },
    ],
    ShowRecommendations: false,
    SaleStatusFilters: [{ SaleStatus: 1, IsSelected: true }],
    BidStatusFilters: [{ BidStatus: 6, IsSelected: true }],
  };
}

async function fetchUserFilters(userId) {
  const r = await db.query(
    `SELECT
      filter_name,
      year_from, year_to,
      auction_type, inventory_type, inventory_types, fuel_type, fuel_types,
      min_bid, max_bid,
      odo_from, odo_to
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function fetchUserBotSettings(userId) {
  const r = await db.query(
    `SELECT
      bot_continuous,
      filter_name,
      year_from, year_to,
      auction_type, inventory_type, inventory_types, fuel_type, fuel_types,
      min_bid, max_bid,
      odo_from, odo_to
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function startContinuousForUser(userId) {
  const st = getState(userId);

  // Idempotent: if already running, do nothing
  if (st.running && st.timer) return;

  // Only start if user has some filters configured
  const filters = await fetchUserFilters(userId);
  if (!hasAnyFiltersSet(filters)) {
    st.running = false;
    if (st.timer) clearInterval(st.timer);
    st.timer = null;
    st.lastRunAt = Date.now();
    st.lastOutput = "Not started: no filters saved for this user";
    return;
  }

  if (st.timer) clearInterval(st.timer);
  st.running = true;

  // Run immediately once, then schedule
  await runOnceForUser(userId);

  const pollMs = Number(process.env.BOT_POLL_MS || 10 * 60 * 1000);
  st.timer = setInterval(() => {
    runOnceForUser(userId).catch((e) => {
      console.error("Bot interval error:", e);
      st.lastRunAt = Date.now();
      st.lastOutput = `IAAI error: ${e?.message || "unknown error"}`;
      st.lastIaaiResponse = {
        status: null,
        contentType: "error",
        text: st.lastOutput,
      };
    });
  }, pollMs);

  if (typeof st.timer.unref === "function") st.timer.unref();
}

function stopContinuousForUser(userId) {
  const st = getState(userId);
  st.running = false;
  if (st.timer) clearInterval(st.timer);
  st.timer = null;
}

function summarizeIaaiResponse(resp) {
  const status = resp?.status;
  const contentType = resp?.headers?.["content-type"] || "unknown";
  const data = resp?.data;

  if (typeof data === "string") {
    const snippet = data.slice(0, 600);
    return `IAAI response: HTTP ${status} (${contentType}), text[0..600]=${JSON.stringify(
      snippet
    )}`;
  }

  if (data && typeof data === "object") {
    const keys = Object.keys(data).slice(0, 30);
    return `IAAI response: HTTP ${status} (${contentType}), json keys=${keys.join(
      ", "
    )}`;
  }

  return `IAAI response: HTTP ${status} (${contentType}), type=${typeof data}`;
}

function extractIaaiData(resp, maxChars = 8000) {
  const status = resp?.status ?? null;
  const contentType = resp?.headers?.["content-type"] || "unknown";
  const data = resp?.data;

  // Only return JSON object when response is JSON-like
  if (
    contentType.includes("application/json") &&
    data &&
    typeof data === "object"
  ) {
    return { status, contentType, json: data };
  }

  // Otherwise return a truncated text snippet
  const text =
    typeof data === "string"
      ? data
      : data === undefined
      ? ""
      : JSON.stringify(data);

  return { status, contentType, text: text.slice(0, maxChars) };
}

async function runOnceForUser(userId) {
  const st = getState(userId);

  // Prevent overlap if interval fires while a request is still running
  if (st.inFlight) {
    st.lastOutput = "IAAI poll skipped (previous poll still running)";
    return { iaai: st.lastIaaiResponse };
  }

  st.inFlight = true;
  try {
    const u = await fetchUserFilters(userId);
    st.lastUserFilters = u || null;

    const payload = buildIaaiPayloadFromUserFilters(u || {});
    const url = makeApiUrl();
    st.lastIaaiRequest = { url, payload };

    const resp = await axios.post(url, payload, {
      headers: IAAI_HEADERS,
      timeout: 20000,
      validateStatus: () => true,

      responseType: "text",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    st.lastRunAt = Date.now();
    st.lastOutput = summarizeIaaiResponse(resp);
    st.lastIaaiResponse = extractIaaiData(resp);

    const contentType = resp?.headers?.["content-type"] || "";
    const isHtml =
      typeof resp?.data === "string" && contentType.includes("text/html");

    if (isHtml) {
      if (String(process.env.DEBUG_IAAI_HTML || "") === "1") {
        const outPath = path.join(process.cwd(), "iaai-response.html");
        fs.writeFileSync(outPath, resp.data, "utf8");
        st.lastOutput += ` | saved html -> ${outPath}`;
      }

      // IMPORTANT: don’t cap below your PageSize (you set PageSize=100)
      const vehicles = extractVehiclesFromHtml(resp.data, 200);
      st.lastCount = vehicles.length;

      const { changes, nextSeen } = diffVehicles(st.lastSeen || {}, vehicles);
      st.lastSeen = nextSeen;

      if (changes.length > 0) {
        const userRes = await db.query(
          "SELECT email, username FROM users WHERE id = $1",
          [userId]
        );
        const user = userRes.rows[0];

        if (user?.email) {
          try {
            if (String(process.env.DEBUG_EMAIL_VEHICLES || "") === "1") {
              const sample = changes[0] || null;
              if (sample) {
                console.log("[email-debug] sample vehicle", {
                  userId,
                  email: user.email,
                  changes: changes.length,
                  title: sample.title ?? null,
                  vehicle_link: sample.vehicle_link ?? null,
                  stock_id: sample.stock_id ?? null,
                  price: sample.price ?? null,
                  image_src: extractImgSrc(sample.image),
                });
              } else {
                console.log("[email-debug] no sample vehicle", {
                  userId,
                  email: user.email,
                  changes: 0,
                });
              }
            }

            await sendVehiclesEmail({
              to: user.email,
              subject: `IAAI updates for ${user.username} (${changes.length})`,
              vehicles: changes,
            });
            st.lastOutput += ` | emailed ${changes.length} update(s)`;
          } catch (e) {
            console.error("SendGrid error:", e?.response?.body || e);
            st.lastOutput += ` | email failed: ${
              e?.message || "unknown error"
            }`;
          }
        } else {
          st.lastOutput += " | user has no email set";
        }
      } else {
        st.lastOutput += " | no changes detected";
      }
    }

    return { iaai: st.lastIaaiResponse };
  } finally {
    st.inFlight = false;
  }
}

// GET /api/bot/status
router.get("/status", authRequired, async (req, res) => {
  const userId = req.user.id;
  const st = getState(userId);
  const debug = String(req.query.debug || "") === "1";

  // Coalesce frequent status calls (e.g. refresh + polling)
  const now = Date.now();
  const minIntervalMs = Number(process.env.STATUS_MIN_INTERVAL_MS || 1000);

  if (st.lastStatusJson && now - st.lastStatusAt < minIntervalMs) {
    // Support conditional requests to avoid sending body repeatedly
    const inm = req.headers["if-none-match"];
    if (st.lastStatusEtag && inm === st.lastStatusEtag) {
      return res.status(304).end();
    }
    res.setHeader("ETag", st.lastStatusEtag || "");
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    return res.json(st.lastStatusJson);
  }

  // Include persisted preference for UI (survives restarts/deploys)
  let continuousEnabled = st.continuousEnabled;
  try {
    continuousEnabled = await refreshContinuousState(userId, st);
  } catch (e) {
    // Don't fail status if DB read fails; just omit preference.
    console.error("Failed to read bot_continuous:", e);
  }

  const payload = {
    ok: true,
    bot: {
      running: !!st.running,
      continuousEnabled,
      lastOutput: st.lastOutput,
      lastRunAt: st.lastRunAt,
      ...(debug
        ? {
            lastUserFilters: st.lastUserFilters,
            lastIaaiRequest: st.lastIaaiRequest,
            lastIaaiResponse: st.lastIaaiResponse,
          }
        : {}),
    },
  };

  st.lastStatusJson = payload;
  st.lastStatusAt = now;
  st.lastStatusEtag = computeEtag(payload);

  const inm = req.headers["if-none-match"];
  if (inm === st.lastStatusEtag) return res.status(304).end();

  res.setHeader("ETag", st.lastStatusEtag);
  res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
  return res.json(payload);
});

// GET /api/bot/settings
// Exposes DB-backed preferences so the UI can reflect auto-resume state after restart.
router.get("/settings", authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const st = getState(userId);

    const row = await fetchUserBotSettings(userId);
    const continuousEnabled = !!row?.bot_continuous;
    const filtersSet = hasAnyFiltersSet(row || null);

    st.continuousEnabled = continuousEnabled;
    st.lastContinuousAt = Date.now();

    return res.json({
      ok: true,
      bot: {
        continuousEnabled,
        filtersSet,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// POST /api/bot/run?mode=once|start|stop
router.post("/run", authRequired, async (req, res) => {
  const mode = String(req.query.mode || "once");
  const userId = req.user.id;
  const st = getState(userId);

  try {
    if (mode === "once") {
      const r = await runOnceForUser(userId);
      return res.json({ ok: true, iaai: r.iaai });
    }

    if (mode === "start") {
      // Persist preference so it can resume after deploy/restart
      await setBotContinuous(userId, true);
      st.continuousEnabled = true;
      st.lastContinuousAt = Date.now();
      st.lastStatusJson = null;

      const alreadyRunning = !!(st.running && st.timer);
      await startContinuousForUser(userId);

      const pollMs = Number(process.env.BOT_POLL_MS || 10 * 60 * 1000);
      return res.json({
        ok: true,
        iaai: st.lastIaaiResponse,
        pollMs,
        alreadyRunning,
      });
    }

    if (mode === "stop") {
      await setBotContinuous(userId, false);
      st.continuousEnabled = false;
      st.lastContinuousAt = Date.now();
      st.lastStatusJson = null;
      stopContinuousForUser(userId);
      return res.json({ ok: true });
    }

    return res
      .status(400)
      .json({ ok: false, msg: "Invalid mode. Use once|start|stop" });
  } catch (e) {
    console.error("Bot run failed:", e);
    st.lastRunAt = Date.now();
    st.lastOutput = `IAAI error: ${e?.message || "unknown error"}`;
    st.lastIaaiResponse = {
      status: null,
      contentType: "error",
      text: st.lastOutput,
    };
    return res.status(500).json({ ok: false, msg: st.lastOutput });
  }
});

// Resume per-user continuous bots after deploy/restart.
// This is intentionally called from backend/index.js after migrations.
router.resumeContinuousBots = async function resumeContinuousBots() {
  const pollMs = Number(process.env.BOT_POLL_MS || 10 * 60 * 1000);

  const r = await db.query(
    "SELECT id FROM users WHERE bot_continuous = true ORDER BY id"
  );

  const userIds = r.rows.map((row) => row.id);
  if (userIds.length === 0) return { resumed: 0, pollMs };

  let resumed = 0;
  for (const userId of userIds) {
    try {
      await startContinuousForUser(userId);
      const st = getState(userId);
      if (st.running && st.timer) resumed += 1;
    } catch (e) {
      console.error("Failed to resume bot for user", userId, e);
      const st = getState(userId);
      st.lastRunAt = Date.now();
      st.lastOutput = `Resume failed: ${e?.message || "unknown error"}`;
    }
  }

  return { resumed, pollMs };
};

function isMeaningful(v) {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  return (
    s.toLowerCase() !== "n/a" &&
    s.toLowerCase() !== "na" &&
    s.toLowerCase() !== "null"
  );
}

// Used by diffVehicles(): prefer stock_id; fallback to vehicle_link
function makeKey(v) {
  const stock = isMeaningful(v?.stock_id) ? String(v.stock_id).trim() : null;
  if (stock) return stock;

  const link = isMeaningful(v?.vehicle_link)
    ? String(v.vehicle_link).trim()
    : null;
  if (link) return link;

  return null;
}

module.exports = router;
