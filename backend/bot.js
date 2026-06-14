const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto"); // ADD

const db = require("./db");
const { authRequired } = require("./authMiddleware");
const { extractVehiclesFromHtml } = require("./scrapeIaai");
const { sendVehiclesEmail, sendTestEmail, sendErrorEmail } = require("./mailer");

const router = express.Router();

const BASE_URL = "https://www.iaai.com";
const makeIaaiApiUrl = () => `${BASE_URL}/Search?c=${Date.now()}`;
const COPART_API_URL = "https://www.copart.com/public/lots/search-results";

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

async function buildCopartHeaders() {
  const { getCopartSession } = require("./copartCookies");
  const h = {
    "User-Agent": IAAI_HEADERS["User-Agent"],
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Origin: "https://www.copart.com",
    Referer: "https://www.copart.com/lotSearchResults",
  };
  const session = await getCopartSession();
  if (session.cookieString) h["Cookie"] = session.cookieString;
  if (session.xsrfToken) h["X-XSRF-TOKEN"] = session.xsrfToken;
  return h;
}

const SOURCE_IAAI = "IAAI";
const SOURCE_COPART = "COPART";
const SUPPORTED_SOURCES = [SOURCE_IAAI, SOURCE_COPART];

function normalizeAuctionSource(v) {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  return s === SOURCE_COPART ? SOURCE_COPART : SOURCE_IAAI;
}

function getBotContinuousColumn(source) {
  return source === SOURCE_COPART ? "copart_bot_continuous" : "bot_continuous";
}

function getStateKey(userId, source, profileId = null) {
  return profileId ? `${userId}:${source}:p:${profileId}` : `${userId}:${source}`;
}

// per-user, per-source (per-profile) bot state
const states = new Map();

async function setBotContinuous(userId, enabled, source = SOURCE_IAAI, profileId = null) {
  if (profileId) {
    await db.query(
      "UPDATE search_profiles SET bot_continuous = $1 WHERE id = $2 AND user_id = $3",
      [!!enabled, profileId, userId],
    );
    return;
  }
  const column = getBotContinuousColumn(source);
  await db.query(`UPDATE users SET ${column} = $1 WHERE id = $2`, [
    !!enabled,
    userId,
  ]);
}

async function getBotContinuous(userId, source = SOURCE_IAAI, profileId = null) {
  if (profileId) {
    const r = await db.query(
      "SELECT bot_continuous FROM search_profiles WHERE id = $1 AND user_id = $2 LIMIT 1",
      [profileId, userId],
    );
    return r.rows[0] ? !!r.rows[0].bot_continuous : false;
  }
  const column = getBotContinuousColumn(source);
  const r = await db.query(
    `SELECT ${column} FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const row = r.rows[0];
  return row ? !!row[column] : false;
}

async function ensureUnsubscribeToken(userId) {
  const r = await db.query(
    "SELECT unsubscribe_token FROM users WHERE id = $1 LIMIT 1",
    [userId],
  );
  const existing = String(r.rows[0]?.unsubscribe_token || "").trim();
  if (existing) return existing;

  const token = crypto.randomBytes(32).toString("hex");
  await db.query(
    "UPDATE users SET unsubscribe_token = $1 WHERE id = $2 AND (unsubscribe_token IS NULL OR unsubscribe_token = '')",
    [token, userId],
  );
  return token;
}

function hasAnyFiltersSet(u) {
  if (!u) return false;
  return [
    u.filter_name,
    u.full_search,
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

function getState(userId, source = SOURCE_IAAI, profileId = null) {
  const key = getStateKey(userId, source, profileId);
  if (!states.has(key)) {
    states.set(key, {
      running: false,
      inFlight: false,
      queued: false,
      lastOutput: null,
      lastRunAt: null,
      timer: null,

      // persisted preference (DB)
      continuousEnabled: null,
      lastContinuousAt: 0,

      lastSeen: {},
      lastSeenLoaded: false,
      pendingLastSeenReset: false,
      lastCount: 0,

      // NEW: status response coalescing
      lastStatusAt: 0,
      lastStatusJson: null,
      lastStatusEtag: null,

      lastRequest: null,
      lastResponse: null,
      lastUserFilters: null,

      lastChangesCount: 0,
      lastEmailed: false,
    });
  }
  return states.get(key);
}

async function resetLastSeenForUser(userId, source = null, profileId = null) {
  const lastSeenKey = source
    ? (profileId ? `${source}:p:${profileId}` : source)
    : null;
  const st = source ? getState(userId, source, profileId) : null;
  if (st && st.inFlight) {
    st.pendingLastSeenReset = true;
    st.lastStatusJson = null;
    return { ok: true, deferred: true };
  }

  if (st) {
    st.pendingLastSeenReset = false;
    st.lastSeen = {};
    st.lastSeenLoaded = true;
  }

  const r = await db.query(
    "SELECT last_seen FROM bot_states WHERE user_id = $1 LIMIT 1",
    [userId],
  );
  const raw = r.rows[0]?.last_seen;
  const data = raw && typeof raw === "object" ? raw : {};

  if (lastSeenKey) {
    data[lastSeenKey] = {};
  } else {
    for (const s of SUPPORTED_SOURCES) {
      data[s] = {};
    }
  }

  await db.query(
    `INSERT INTO bot_states (user_id, last_seen, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET last_seen = EXCLUDED.last_seen, updated_at = NOW()`,
    [userId, data],
  );

  return { ok: true, source };
}

// ── Per-platform sequential request queue ─────────────────────────────────────
// Ensures only one IAAI request and one Copart request run at a time.
// Prevents concurrent session conflicts on Copart and reduces ban risk on IAAI.

const MIN_QUEUE_GAP_MS = Number(process.env.BOT_QUEUE_GAP_MS || 15 * 1000);

const platformQueues = new Map(); // source -> { running, jobs, lastFinishedAt }

function getPlatformQueue(source) {
  if (!platformQueues.has(source)) {
    platformQueues.set(source, { running: false, jobs: [], lastFinishedAt: 0 });
  }
  return platformQueues.get(source);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function drainQueue(source) {
  const pq = getPlatformQueue(source);
  if (pq.running) return;
  pq.running = true;

  while (pq.jobs.length > 0) {
    // Enforce minimum gap between consecutive polls
    if (pq.lastFinishedAt > 0) {
      const gap = Date.now() - pq.lastFinishedAt;
      if (gap < MIN_QUEUE_GAP_MS) {
        await sleep(MIN_QUEUE_GAP_MS - gap);
      }
    }

    const { fn, resolve, reject } = pq.jobs.shift();
    try {
      resolve(await fn());
    } catch (e) {
      reject(e);
    }
    pq.lastFinishedAt = Date.now();
  }

  pq.running = false;
}

// Enqueue a runOnce job for a profile. Returns a promise that resolves with the
// run result. Skips silently if the profile is already queued or in-flight.
function enqueueRun(userId, source, profileId) {
  const st = getState(userId, source, profileId);

  if (st.queued || st.inFlight) {
    return Promise.resolve({ response: st.lastResponse, changesCount: 0, emailed: false });
  }

  st.queued = true;

  return new Promise((resolve, reject) => {
    const pq = getPlatformQueue(source);
    pq.jobs.push({
      fn: async () => {
        st.queued = false;
        return runOnceForUser(userId, source, profileId);
      },
      resolve,
      reject,
    });
    drainQueue(source).catch((e) => console.error("[queue] drain error:", e));
  });
}
// ─────────────────────────────────────────────────────────────────────────────

async function loadLastSeen(userId, source = SOURCE_IAAI, profileId = null) {
  try {
    const lastSeenKey = profileId ? `${source}:p:${profileId}` : source;
    const r = await db.query(
      "SELECT last_seen FROM bot_states WHERE user_id = $1 LIMIT 1",
      [userId],
    );
    const raw = r.rows[0]?.last_seen;
    const data = raw && typeof raw === "object" ? raw : {};
    return data[lastSeenKey] && typeof data[lastSeenKey] === "object" ? data[lastSeenKey] : {};
  } catch (e) {
    return {};
  }
}

async function saveLastSeen(userId, lastSeen, source = SOURCE_IAAI, profileId = null) {
  try {
    const lastSeenKey = profileId ? `${source}:p:${profileId}` : source;
    const r = await db.query(
      "SELECT last_seen FROM bot_states WHERE user_id = $1 LIMIT 1",
      [userId],
    );
    const raw = r.rows[0]?.last_seen;
    const data = raw && typeof raw === "object" ? raw : {};
    data[lastSeenKey] = lastSeen || {};
    await db.query(
      `INSERT INTO bot_states (user_id, last_seen, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET last_seen = EXCLUDED.last_seen, updated_at = NOW()`,
      [userId, data],
    );
  } catch {
    // ignore
  }
}

async function refreshContinuousState(
  userId,
  st,
  source = SOURCE_IAAI,
  maxAgeMs = 5000,
  profileId = null,
) {
  const now = Date.now();
  if (st.continuousEnabled !== null && now - st.lastContinuousAt < maxAgeMs) {
    return st.continuousEnabled;
  }
  const enabled = await getBotContinuous(userId, source, profileId);
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

function parsePriceToNumber(price) {
  if (price === null || price === undefined) return null;
  const s = String(price).trim();
  if (!s) return null;

  // Prefer a $-prefixed token if present, but fall back to any digits.
  const m = s.match(/\$[\d,]+(?:\.\d+)?/);
  const token = m ? m[0] : s;
  const digits = token.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function parseOdometerToNumber(odometer) {
  if (odometer === null || odometer === undefined) return null;
  const s = String(odometer).trim();
  if (!s) return null;

  // Common formats: "123,456", "123,456 mi", "123456 miles", "N/A"
  const m = s.match(/\b[\d,]{1,9}\b/);
  if (!m) return null;
  const digits = m[0].replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function filterVehiclesByBidRange(vehicles, u, requirePrice = false) {
  const min = toNumberOrNull(u?.min_bid);
  const max = toNumberOrNull(u?.max_bid);

  if (min === null && max === null && !requirePrice) return vehicles || [];

  return (vehicles || []).filter((v) => {
    const p = parsePriceToNumber(v?.price);
    // For Copart: always drop vehicles with no price (requirePrice=true).
    // For IAAI: pass through — server-side filtering already handled it.
    if (p === null) return !requirePrice;
    if (min !== null && p < min) return false;
    if (max !== null && p > max) return false;
    return true;
  });
}

function filterVehiclesByOdoRange(vehicles, u) {
  const from = toNumberOrNull(u?.odo_from);
  const to = toNumberOrNull(u?.odo_to);

  if (from === null && to === null) return vehicles || [];

  return (vehicles || []).filter((v) => {
    const raw = v?.odometer ?? v?.odo ?? v?.mileage ?? null;
    const miles = parseOdometerToNumber(raw);
    if (miles === null) return true;
    if (from !== null && miles < from) return false;
    if (to !== null && miles > to) return false;
    return true;
  });
}

function filterVehiclesByBuyItNow(vehicles) {
  return (vehicles || []).filter((v) => v?.buy_it_now === true);
}

function filterVehiclesByYearRange(vehicles, u) {
  const from = toNumberOrNull(u?.year_from);
  const to = toNumberOrNull(u?.year_to);

  if (from === null && to === null) return vehicles || [];

  return (vehicles || []).filter((v) => {
    const year = toNumberOrNull(v?.year);
    if (year === null) return true;
    if (from !== null && year < from) return false;
    if (to !== null && year > to) return false;
    return true;
  });
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
function pushLongRange(
  Searches,
  name,
  from,
  to,
  { defaultFrom = null, defaultTo = null } = {},
) {
  const fromN = toNumberOrNull(from);
  const toN = toNumberOrNull(to);

  // If user didn't provide anything, only emit when defaults are provided.
  if (fromN === null && toN === null) {
    if (defaultFrom === null && defaultTo === null) return;
  }

  const resolvedFrom = fromN ?? defaultFrom ?? 0;
  const resolvedTo = toN ?? defaultTo ?? resolvedFrom;

  Searches.push({
    Facets: null,
    FullSearch: null,
    LongRanges: [
      {
        From: resolvedFrom,
        Name: name,
        To: resolvedTo,
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

function pushFullSearch(Searches, value) {
  if (value === null || value === undefined) return;
  const s = String(value).trim();
  if (!s) return;

  Searches.push({
    Facets: null,
    FullSearch: s,
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
    fuelTypes.includes(v),
  );
  const inventoryTypesOrdered = ["Automobiles", "Motorcycles"].filter((v) =>
    inventoryTypes.includes(v),
  );

  // Match real IAAI payload ordering.
  // IMPORTANT: Only emit filters the user actually set.
  // (Default ranges like ODO 0..150k can unintentionally narrow results.)

  // 1) AuctionType (optional)
  pushFacet(Searches, "AuctionType", u.auction_type);

  // 2) Year (optional)
  pushLongRange(Searches, "Year", u.year_from, u.year_to);

  // 3) InventoryTypes (one Searches entry per selected value)
  for (const it of inventoryTypesOrdered) {
    pushFacet(Searches, "InventoryTypes", it);
  }

  // 4) ODO range (optional)
  pushLongRange(Searches, "ODOValue", u.odo_from, u.odo_to);

  // 5) Full text search (optional)
  pushFullSearch(Searches, u.full_search);

  // 6) FuelTypeDesc (one Searches entry per selected value)
  for (const ft of fuelTypesOrdered) {
    pushFacet(Searches, "FuelTypeDesc", ft);
  }

  // 7) MinimumBidAmount (optional)
  pushLongRange(Searches, "MinimumBidAmount", u.min_bid, u.max_bid);

  return {
    Searches,
    ZipCode: "",
    miles: 0,
    PageSize: 500,
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

function buildCopartPayloadFromUserFilters(u) {
  const filter = {};

  // Only request Buy It Now lots when user explicitly set auction_type = "Buy Now"
  if (u.auction_type === "Buy Now") {
    filter.FETI = ["buy_it_now_code:B1"];
  }

  const yearFrom = toNumberOrNull(u.year_from);
  const yearTo = toNumberOrNull(u.year_to);
  if (yearFrom !== null || yearTo !== null) {
    filter.YEAR = [
      `lot_year:[${yearFrom ?? 1900} TO ${yearTo ?? new Date().getFullYear() + 1}]`,
    ];
  }

  const odoFrom = toNumberOrNull(u.odo_from);
  const odoTo = toNumberOrNull(u.odo_to);
  if (odoFrom !== null || odoTo !== null) {
    filter.ODM = [
      `odometer_reading_received:[${odoFrom ?? 0} TO ${odoTo ?? 999999}]`,
    ];
  }

  const searchQuery = String(u.full_search || "").trim();

  return {
    query: searchQuery ? [searchQuery] : ["*"],
    filter,
    sort: [
      "salelight_priority asc",
      "member_damage_group_priority asc",
      "auction_date_type desc",
      "auction_date_utc asc",
    ],
    page: 0,
    size: 20,
    start: 0,
    watchListOnly: false,
    freeFormSearch: true,
    hideImages: false,
    defaultSort: false,
    specificRowProvided: false,
    displayName: "",
    searchName: "",
    backUrl: "",
    includeTagByField: {
      ...(odoFrom !== null || odoTo !== null ? { ODM: "{!tag=ODM} " } : {}),
      ...(yearFrom !== null || yearTo !== null ? { YEAR: "{!tag=YEAR}" } : {}),
    },
    rawParams: {},
  };
}

function buildCopartLotLink(item) {
  const lotNumber = String(item?.ln || item?.lotNumberStr || "").trim();
  if (lotNumber) return `https://www.copart.com/lot/${lotNumber}`;
  return null;
}

function extractVehiclesFromCopartResponse(resp, maxItems = 500) {
  const data = resp?.data;
  let json = null;
  if (typeof data === "object" && data !== null) {
    json = data;
  } else if (typeof data === "string") {
    try {
      json = JSON.parse(data);
    } catch {
      json = null;
    }
  }

  const results = json?.data?.results;
  const totalElements = results?.totalElements ?? null;
  const content = results?.content;
  if (!Array.isArray(content)) return { vehicles: [], totalElements };

  const vehicles = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const stockId = String(
      item.ln || item.lotNumberStr || item.lotNumber || "",
    ).trim();
    // bnp = static BIN price; dynamicLotDetails.buyTodayBid = live BIN price (fallback)
    // Never fall back to hb (regular auction bid) — that's not a Buy It Now price
    const buyTodayBid = item.dynamicLotDetails?.buyTodayBid;
    const rawPrice = Number(item.bnp) > 0 ? item.bnp
      : Number(buyTodayBid) > 0 ? buyTodayBid
      : null;
    const buy_it_now = rawPrice !== null;
    const price = rawPrice != null ? String(rawPrice) : null;
    const link = buildCopartLotLink(item);
    // tims = thumbnail image source (full CDN URL); lh is a hash, not a URL
    const image = item.tims || item.image || null;
    const title = item.ld || item.lm || item.mkn || item.title || null;
    // lcy = lot calendar year; orr = odometer reading received
    const year = item.lcy != null ? item.lcy : null;
    const odometer = item.orr != null ? item.orr : null;

    vehicles.push({
      stock_id: stockId || null,
      price: price === null ? null : String(price).trim(),
      vehicle_link: link,
      image,
      title,
      year,
      odometer,
      buy_it_now,
      source: SOURCE_COPART,
    });

    if (vehicles.length >= maxItems) break;
  }

  return { vehicles, totalElements };
}

async function fetchUserFilters(userId, source = SOURCE_IAAI, profileId = null) {
  if (profileId) {
    const r = await db.query(
      `SELECT profile_name AS filter_name, full_search, year_from, year_to,
              auction_type, inventory_type, inventory_types, fuel_type, fuel_types,
              min_bid, max_bid, odo_from, odo_to
       FROM search_profiles
       WHERE id = $1 AND user_id = $2`,
      [profileId, userId],
    );
    return r.rows[0] || null;
  }
  const prefix = source === SOURCE_COPART ? "copart_" : "";
  const r = await db.query(
    `SELECT
      ${prefix}filter_name AS filter_name,
      ${prefix}full_search AS full_search,
      ${prefix}year_from AS year_from, ${prefix}year_to AS year_to,
      ${prefix}auction_type AS auction_type,
      ${prefix}inventory_type AS inventory_type,
      ${prefix}inventory_types AS inventory_types,
      ${prefix}fuel_type AS fuel_type,
      ${prefix}fuel_types AS fuel_types,
      ${prefix}min_bid AS min_bid,
      ${prefix}max_bid AS max_bid,
      ${prefix}odo_from AS odo_from,
      ${prefix}odo_to AS odo_to
     FROM users
     WHERE id = $1`,
    [userId],
  );
  return r.rows[0] || null;
}

async function fetchUserBotSettings(userId, source = SOURCE_IAAI, profileId = null) {
  if (profileId) {
    const userRow = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
    const profileRow = await db.query(
      `SELECT bot_continuous, profile_name AS filter_name, full_search,
              year_from, year_to, auction_type, inventory_type, inventory_types,
              fuel_type, fuel_types, min_bid, max_bid, odo_from, odo_to
       FROM search_profiles WHERE id = $1 AND user_id = $2`,
      [profileId, userId],
    );
    if (!profileRow.rows[0]) return null;
    return { ...profileRow.rows[0], email: userRow.rows[0]?.email || null };
  }
  const prefix = source === SOURCE_COPART ? "copart_" : "";
  const r = await db.query(
    `SELECT
      email,
      ${getBotContinuousColumn(source)} AS bot_continuous,
      ${prefix}filter_name AS filter_name,
      ${prefix}full_search AS full_search,
      ${prefix}year_from AS year_from, ${prefix}year_to AS year_to,
      ${prefix}auction_type AS auction_type,
      ${prefix}inventory_type AS inventory_type,
      ${prefix}inventory_types AS inventory_types,
      ${prefix}fuel_type AS fuel_type,
      ${prefix}fuel_types AS fuel_types,
      ${prefix}min_bid AS min_bid,
      ${prefix}max_bid AS max_bid,
      ${prefix}odo_from AS odo_from,
      ${prefix}odo_to AS odo_to
     FROM users
     WHERE id = $1`,
    [userId],
  );
  return r.rows[0] || null;
}

async function startContinuousForUser(userId, source = SOURCE_IAAI, profileId = null) {
  const st = getState(userId, source, profileId);

  // Idempotent: if already running, do nothing
  if (st.running && st.timer) return;

  const filters = await fetchUserFilters(userId, source, profileId);
  if (!hasAnyFiltersSet(filters)) {
    st.running = false;
    if (st.timer) clearInterval(st.timer);
    st.timer = null;
    st.lastRunAt = Date.now();
    st.lastOutput = `${source} not started: no filters saved for this user`;
    return;
  }

  if (st.timer) clearInterval(st.timer);
  st.running = true;

  // Queue the first run immediately, then schedule subsequent ones via the queue
  enqueueRun(userId, source, profileId).catch((e) => {
    console.error("Bot initial run error:", e);
    st.lastRunAt = Date.now();
    st.lastOutput = `${source} error: ${e?.message || "unknown error"}`;
  });

  const pollMs = Number(process.env.BOT_POLL_MS || 10 * 60 * 1000);
  st.timer = setInterval(() => {
    enqueueRun(userId, source, profileId).catch((e) => {
      console.error("Bot interval error:", e);
      st.lastRunAt = Date.now();
      st.lastOutput = `${source} error: ${e?.message || "unknown error"}`;
      st.lastResponse = {
        status: null,
        contentType: "error",
        text: st.lastOutput,
      };
    });
  }, pollMs);

  if (typeof st.timer.unref === "function") st.timer.unref();
}

function stopContinuousForUser(userId, source = SOURCE_IAAI, profileId = null) {
  const st = getState(userId, source, profileId);
  st.running = false;
  if (st.timer) clearInterval(st.timer);
  st.timer = null;
}

// Exported alias used by searchProfiles.js on delete
function stopProfileBot(userId, source, profileId) {
  stopContinuousForUser(userId, source, profileId);
}

function summarizeResponse(resp, source) {
  const status = resp?.status;
  const contentType = resp?.headers?.["content-type"] || "unknown";
  const data = resp?.data;
  const prefix = String(source || SOURCE_IAAI).toUpperCase();

  if (typeof data === "string") {
    const snippet = data.slice(0, 600);
    return `${prefix} response: HTTP ${status} (${contentType}), text[0..600]=${JSON.stringify(
      snippet,
    )}`;
  }

  if (data && typeof data === "object") {
    const keys = Object.keys(data).slice(0, 30);
    return `${prefix} response: HTTP ${status} (${contentType}), json keys=${keys.join(
      ", ",
    )}`;
  }

  return `${prefix} response: HTTP ${status} (${contentType}), type=${typeof data}`;
}

function extractResponseData(resp, maxChars = 8000) {
  const status = resp?.status ?? null;
  const contentType = resp?.headers?.["content-type"] || "unknown";
  const data = resp?.data;

  if (
    contentType.includes("application/json") &&
    data &&
    typeof data === "object"
  ) {
    return { status, contentType, json: data };
  }

  const text =
    typeof data === "string"
      ? data
      : data === undefined
        ? ""
        : JSON.stringify(data);

  return { status, contentType, text: text.slice(0, maxChars) };
}

function vehicleUniqKey(v) {
  if (!v) return null;
  const link = v?.vehicle_link ? String(v.vehicle_link).trim() : "";
  if (link) return link;
  const stock = v?.stock_id ? String(v.stock_id).trim() : "";
  if (stock) return `stock:${stock}`;
  return null;
}

async function fetchVehiclesPaged({
  firstHtml,
  basePayload,
  maxPages,
  maxVehicles,
}) {
  const uniq = new Map();
  const addMany = (arr) => {
    let added = 0;
    for (const v of arr || []) {
      const k = vehicleUniqKey(v);
      if (!k) continue;
      if (uniq.has(k)) continue;
      uniq.set(k, v);
      added += 1;
      if (uniq.size >= maxVehicles) break;
    }
    return added;
  };

  // Page 1: use the already-fetched HTML
  const p1 = extractVehiclesFromHtml(firstHtml, maxVehicles);
  addMany(p1);

  let pagesFetched = 1;
  let pagedTimedOut = false;
  for (let page = 2; page <= maxPages; page += 1) {
    if (uniq.size >= maxVehicles) break;

    const url = makeIaaiApiUrl();
    const payload = { ...basePayload, CurrentPage: page };

    let resp;
    try {
      resp = await axios.post(url, payload, {
        headers: IAAI_HEADERS,
        timeout: 10000,
        validateStatus: () => true,
        responseType: "text",
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
    } catch (e) {
      if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") {
        pagedTimedOut = true;
        break;
      }
      throw e;
    }

    const contentType = resp?.headers?.["content-type"] || "";
    const isHtml =
      typeof resp?.data === "string" && contentType.includes("text/html");
    if (!isHtml) break;

    const pageVehicles = extractVehiclesFromHtml(resp.data, maxVehicles);
    const added = addMany(pageVehicles);
    pagesFetched = page;

    // Stop when a page adds nothing new (likely end of results)
    if (added <= 0) break;
  }

  return {
    vehicles: Array.from(uniq.values()).slice(0, maxVehicles),
    pagesFetched,
    timedOut: pagedTimedOut,
  };
}

async function runOnceForUser(userId, source = SOURCE_IAAI, profileId = null) {
  const st = getState(userId, source, profileId);

  let changesCount = 0;
  let emailed = false;

  if (source === SOURCE_COPART) {
    const { ensureSession } = require("./copartScraper");
    if (!st.lastOutput || st.lastOutput.includes("warming")) {
      st.lastOutput = `${source} warming up session...`;
    }
    await ensureSession().catch((e) =>
      console.error("[copart-scraper] pre-run warm failed:", e.message),
    );
  }

  if (st.pendingLastSeenReset) {
    st.pendingLastSeenReset = false;
    st.lastSeen = {};
    st.lastSeenLoaded = true;
    await saveLastSeen(userId, {}, source, profileId);
  }

  if (!st.lastSeenLoaded) {
    st.lastSeen = await loadLastSeen(userId, source, profileId);
    st.lastSeenLoaded = true;
  }

  if (st.inFlight) {
    st.lastOutput = `${source} poll skipped (previous poll still running)`;
    return { response: st.lastResponse, changesCount: 0, emailed: false };
  }

  st.inFlight = true;
  try {
    const u = await fetchUserFilters(userId, source, profileId);
    st.lastUserFilters = u || null;

    let payload;
    let url;
    let headers;
    if (source === SOURCE_COPART) {
      payload = buildCopartPayloadFromUserFilters(u || {});
    } else {
      payload = buildIaaiPayloadFromUserFilters(u || {});
      url = makeIaaiApiUrl();
      headers = IAAI_HEADERS;
    }

    st.lastRequest = { url: source === SOURCE_COPART ? COPART_API_URL : url, payload };

    let resp;
    let vehicles = [];

    if (source === SOURCE_COPART) {
      const { searchCopart, invalidateCopartSession } = require("./copartScraper");
      const maxCopartVehicles = Math.max(1, Number(process.env.COPART_MAX_VEHICLES || 100));

      let json;
      try {
        json = await searchCopart(payload);
      } catch (e) {
        st.lastRunAt = Date.now();
        st.lastOutput = `${source} search failed: ${e.message}`;
        return { response: st.lastResponse, changesCount: 0, emailed: false };
      }

      if (json?.error) {
        invalidateCopartSession();
        st.lastRunAt = Date.now();
        st.lastOutput = `${source} session rejected (HTTP ${json.error}) — will retry next poll`;
        return { response: st.lastResponse, changesCount: 0, emailed: false };
      }

      if (String(process.env.DEBUG_COPART_JSON || "") === "1") {
        try {
          const outPath = path.join(process.cwd(), "copart-response.json");
          fs.writeFileSync(outPath, JSON.stringify(json, null, 2), "utf8");
        } catch { /* ignore */ }
      }

      // Wrap in axios-like shape for extractVehiclesFromCopartResponse
      const fakeResp = { data: json };
      const copartResult = extractVehiclesFromCopartResponse(fakeResp, maxCopartVehicles);
      vehicles = copartResult.vehicles;
      const totalElements = copartResult.totalElements;

      // Paginate if more vehicles are needed
      const uniqCopart = new Map();
      for (const v of vehicles) {
        const k = vehicleUniqKey(v);
        if (k) uniqCopart.set(k, v);
      }
      let copartPage = 1;
      while (uniqCopart.size < maxCopartVehicles && uniqCopart.size < (totalElements ?? 0)) {
        let nextJson;
        try {
          nextJson = await searchCopart({ ...payload, page: copartPage });
        } catch {
          break;
        }
        const nextResult = extractVehiclesFromCopartResponse({ data: nextJson }, maxCopartVehicles);
        if (!nextResult.vehicles.length) break;
        for (const v of nextResult.vehicles) {
          const k = vehicleUniqKey(v);
          if (k && !uniqCopart.has(k)) uniqCopart.set(k, v);
          if (uniqCopart.size >= maxCopartVehicles) break;
        }
        copartPage += 1;
      }
      vehicles = [...uniqCopart.values()];

      st.lastRunAt = Date.now();
      st.lastCount = vehicles.length;
      st.lastOutput = `${source} | API total: ${totalElements ?? "?"} | extracted: ${vehicles.length}`;
      st.lastResponse = { status: 200, contentType: "application/json", json };
    } else {
      try {
        resp = await axios.post(url, payload, {
          headers,
          timeout: 10000,
          validateStatus: () => true,
          responseType: "text",
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } catch (e) {
        if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") {
          const msg = `The ${source} bot request timed out after 10 seconds. The auction server may be slow or unreachable. The bot will retry on the next scheduled poll.`;
          st.lastRunAt = Date.now();
          st.lastOutput = `${source} request timed out`;
          try {
            const userRow = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
            const email = userRow.rows[0]?.email;
            if (email) await sendErrorEmail({ to: email, subject: `${source} bot: request timed out`, message: msg });
          } catch { /* ignore email failure */ }
          return { response: st.lastResponse, changesCount: 0, emailed: false };
        }
        throw e;
      }

      st.lastRunAt = Date.now();
      st.lastOutput = "";
      st.lastResponse = extractResponseData(resp);
    }

    const contentType = resp?.headers?.["content-type"] || "";
    const isHtml =
      typeof resp?.data === "string" && contentType.includes("text/html");

    if (source !== SOURCE_COPART && isHtml) {
      if (String(process.env.DEBUG_IAAI_HTML || "") === "1") {
        const outPath = path.join(process.cwd(), "iaai-response.html");
        fs.writeFileSync(outPath, resp.data, "utf8");
        st.lastOutput += ` | saved html -> ${outPath}`;
      }

      const maxPages = Math.max(1, Number(process.env.IAAI_MAX_PAGES || 5));
      const maxVehicles = Math.max(
        1,
        Number(process.env.IAAI_MAX_VEHICLES || 500),
      );

      const paged = await fetchVehiclesPaged({
        firstHtml: resp.data,
        basePayload: payload,
        maxPages,
        maxVehicles,
      });

      vehicles = paged.vehicles;
      st.lastCount = vehicles.length;
      if (maxPages > 1) {
        st.lastOutput += ` | pages ${paged.pagesFetched}/${maxPages} | vehicles ${vehicles.length}`;
      }
      if (paged.timedOut) {
        st.lastOutput += ` | pagination timed out (partial results)`;
        try {
          const userRow = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
          const email = userRow.rows[0]?.email;
          if (email) {
            await sendErrorEmail({
              to: email,
              subject: `${source} bot: pagination timed out`,
              message: `The ${source} bot fetched ${vehicles.length} vehicles before a page request timed out (10s limit). Results are partial. The bot will retry on the next scheduled poll.`,
            });
          }
        } catch { /* ignore email failure */ }
      }
    }

    // Merge nextSeen into prevSeen so vehicles that temporarily fall out of
    // the fetch window aren't forgotten and re-reported as NEW on return.
    const { changes, nextSeen } = diffVehicles(st.lastSeen || {}, vehicles);
    const mergedSeen = { ...(st.lastSeen || {}), ...nextSeen };
    st.lastSeen = mergedSeen;
    await saveLastSeen(userId, mergedSeen, source, profileId);

    // For Copart: BIN-only first, then price range on BIN price, then odo/year.
    // For IAAI: bid range, then odo.
    let filteredChanges;
    let droppedByBidRange = 0;
    let droppedByOdoRange = 0;
    let droppedByYearRange = 0;
    let droppedByBin = 0;

    if (source === SOURCE_COPART) {
      // requirePrice=true: always drop Copart vehicles with no price (bnp=0, hb=0)
      const afterBid = filterVehiclesByBidRange(changes, u || {}, true);
      droppedByBidRange = changes.length - afterBid.length;

      const afterOdo = filterVehiclesByOdoRange(afterBid, u || {});
      droppedByOdoRange = afterBid.length - afterOdo.length;

      filteredChanges = filterVehiclesByYearRange(afterOdo, u || {});
      droppedByYearRange = afterOdo.length - filteredChanges.length;

      // Only enforce BIN client-side when user explicitly chose "Buy Now"
      if (u?.auction_type === "Buy Now") {
        const afterBin = filterVehiclesByBuyItNow(filteredChanges);
        droppedByBin = filteredChanges.length - afterBin.length;
        filteredChanges = afterBin;
      }
    } else {
      const afterBid = filterVehiclesByBidRange(changes, u || {});
      droppedByBidRange = changes.length - afterBid.length;

      filteredChanges = filterVehiclesByOdoRange(afterBid, u || {});
      droppedByOdoRange = afterBid.length - filteredChanges.length;
    }

    changesCount = filteredChanges.length;

    if (droppedByBidRange > 0) {
      st.lastOutput += ` | dropped ${droppedByBidRange} out-of-bid-range update(s)`;
    }
    if (droppedByOdoRange > 0) {
      st.lastOutput += ` | dropped ${droppedByOdoRange} out-of-odo-range update(s)`;
    }
    if (droppedByYearRange > 0) {
      st.lastOutput += ` | dropped ${droppedByYearRange} out-of-year-range update(s)`;
    }
    if (droppedByBin > 0) {
      st.lastOutput += ` | dropped ${droppedByBin} non-buy-it-now update(s)`;
    }

    if (filteredChanges.length > 0) {
      // Persist detected changes to DB so the frontend can display them
      try {
        for (const v of filteredChanges) {
          await db.query(
            `INSERT INTO vehicle_changes
               (user_id, source, profile_id, stock_id, vehicle_link, title, price, old_price,
                year, odometer, image, buy_it_now, change_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              userId, source, profileId || null,
              v.stock_id || null,
              v.vehicle_link || null,
              v.title || null,
              v.price || null,
              v.old_price || null,
              parseInt(v.year, 10) || null,
              v.odometer || null,
              extractImgSrc(v.image) || null,
              !!v.buy_it_now,
              v.changeType || "NEW",
            ],
          );
        }
        // Keep only the 500 most recent records per bot context to prevent unbounded growth
        await db.query(
          `DELETE FROM vehicle_changes WHERE id IN (
             SELECT id FROM vehicle_changes
             WHERE user_id = $1 AND source = $2 AND profile_id IS NOT DISTINCT FROM $3
             ORDER BY detected_at DESC
             OFFSET 500
           )`,
          [userId, source, profileId || null],
        );
      } catch (e) {
        console.error("[bot] failed to persist vehicle changes:", e.message);
      }

      const userRes = await db.query(
        "SELECT email, username, email_unsubscribed, unsubscribe_token FROM users WHERE id = $1",
        [userId],
      );
      const user = userRes.rows[0];

      if (user?.email && !user?.email_unsubscribed) {
        try {
          if (String(process.env.DEBUG_EMAIL_VEHICLES || "") === "1") {
            const sample = filteredChanges[0] || null;
            if (sample) {
              console.log("[email-debug] sample vehicle", {
                userId,
                email: user.email,
                changes: filteredChanges.length,
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

          const token = await ensureUnsubscribeToken(userId);
          const appBase = String(
            process.env.APP_BASE_URL ||
              process.env.PUBLIC_BASE_URL ||
              process.env.PUBLIC_URL ||
              `http://127.0.0.1:${process.env.PORT || 5174}`,
          )
            .trim()
            .replace(/\/$/, "");
          const unsubscribeUrl = `${appBase}/unsubscribe?token=${encodeURIComponent(
            token,
          )}`;

          let vehiclesForEmail = filteredChanges;
          if (source === SOURCE_COPART) {
            const { fetchCopartImageAsDataUri } = require("./copartScraper");
            vehiclesForEmail = await Promise.all(
              filteredChanges.map(async (v) => {
                if (!v.image) return v;
                const dataUri = await fetchCopartImageAsDataUri(v.image).catch(() => null);
                return dataUri ? { ...v, image: dataUri } : v;
              }),
            );
          }

          await sendVehiclesEmail({
            to: user.email,
            subject: `${source} updates for ${user.username} (${filteredChanges.length})`,
            vehicles: vehiclesForEmail,
            unsubscribeUrl,
            source,
          });
          emailed = true;
          st.lastOutput += ` | emailed ${filteredChanges.length} update(s)`;
        } catch (e) {
          console.error("SendGrid error:", e?.response?.body || e);
          st.lastOutput += ` | email failed: ${e?.message || "unknown error"}`;
        }
      } else if (user?.email && user?.email_unsubscribed) {
        st.lastOutput += " | user unsubscribed from emails";
      } else {
        st.lastOutput += " | user has no email set";
      }
    } else {
      if ((changes || []).length <= 0) {
        st.lastOutput += " | no changes detected";
      } else if (droppedByBidRange > 0 || droppedByOdoRange > 0 || droppedByBin > 0) {
        st.lastOutput +=
          " | changes detected but all were filtered out (adjust filters)";
      } else {
        st.lastOutput += " | no changes after filters";
      }
    }

    st.lastChangesCount = changesCount;
    st.lastEmailed = emailed;
    return { response: st.lastResponse, changesCount, emailed };
  } finally {
    st.inFlight = false;
    st.lastStatusJson = null; // invalidate cache so next status poll reflects the completed run
  }
}

// Resume continuous bot for the current user, but only if they previously enabled it.
// This is used by the frontend when the user accepts an app update.
router.post("/resume", authRequired, async (req, res) => {
  const userId = req.user.id;
  const requestedSource = req.query.source
    ? normalizeAuctionSource(req.query.source)
    : null;
  try {
    const sources = requestedSource ? [requestedSource] : SUPPORTED_SOURCES;

    const resumed = [];
    for (const source of sources) {
      const enabled = await getBotContinuous(userId, source);
      if (!enabled) continue;
      const st = getState(userId, source);
      const alreadyRunning = !!(st.running && st.timer);
      await startContinuousForUser(userId, source);
      if (st.running && st.timer) {
        resumed.push({ source, alreadyRunning });
      }
    }

    return res.json({
      ok: true,
      resumed: resumed.length > 0,
      details: resumed,
    });
  } catch (e) {
    console.error("Bot resume failed:", e);
    return res.status(500).json({ ok: false, msg: "Failed to resume bot" });
  }
});

// GET /api/bot/status
router.get("/status", authRequired, async (req, res) => {
  const userId = req.user.id;
  const source = req.query.source
    ? normalizeAuctionSource(req.query.source)
    : SOURCE_IAAI;
  const profileId = req.query.profileId ? parseInt(req.query.profileId, 10) || null : null;
  const st = getState(userId, source, profileId);
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
    continuousEnabled = await refreshContinuousState(userId, st, source, 5000, profileId);
  } catch (e) {
    // Don't fail status if DB read fails; just omit preference.
    console.error("Failed to read bot_continuous:", e);
  }

  const payload = {
    ok: true,
    source,
    bot: {
      running: !!st.running,
      continuousEnabled,
      lastOutput: st.lastOutput,
      lastRunAt: st.lastRunAt,
      lastChangesCount: st.lastChangesCount ?? 0,
      lastEmailed: st.lastEmailed ?? false,
      ...(debug
        ? {
            lastUserFilters: st.lastUserFilters,
            lastRequest: st.lastRequest,
            lastResponse: st.lastResponse,
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
    const source = req.query.source
      ? normalizeAuctionSource(req.query.source)
      : SOURCE_IAAI;
    const profileId = req.query.profileId ? parseInt(req.query.profileId, 10) || null : null;
    const st = getState(userId, source, profileId);

    const row = await fetchUserBotSettings(userId, source, profileId);
    const continuousEnabled = !!row?.bot_continuous;
    const filtersSet = hasAnyFiltersSet(row || null);
    const hasEmail = !!(row?.email && String(row.email).trim());

    st.continuousEnabled = continuousEnabled;
    st.lastContinuousAt = Date.now();

    return res.json({
      ok: true,
      source,
      bot: {
        continuousEnabled,
        filtersSet,
        hasEmail,
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
  const source = req.query.source
    ? normalizeAuctionSource(req.query.source)
    : SOURCE_IAAI;
  const profileId = req.query.profileId ? parseInt(req.query.profileId, 10) || null : null;
  const userId = req.user.id;
  const st = getState(userId, source, profileId);

  try {
    if (mode === "once") {
      st.lastStatusJson = null; // allow immediate fresh status polls while running
      enqueueRun(userId, source, profileId).catch((e) => {
        console.error("Bot one-shot run error:", e);
        st.lastRunAt = Date.now();
        st.lastOutput = `${source} error: ${e?.message || "unknown error"}`;
        st.lastStatusJson = null;
      });
      return res.json({ ok: true, source, queued: true });
    }

    if (mode === "start") {
      await setBotContinuous(userId, true, source, profileId);
      st.continuousEnabled = true;
      st.lastContinuousAt = Date.now();
      st.lastStatusJson = null;

      const alreadyRunning = !!(st.running && st.timer);
      await startContinuousForUser(userId, source, profileId);

      const pollMs = Number(process.env.BOT_POLL_MS || 10 * 60 * 1000);
      return res.json({
        ok: true,
        source,
        response: st.lastResponse,
        pollMs,
        alreadyRunning,
      });
    }

    if (mode === "stop") {
      await setBotContinuous(userId, false, source, profileId);
      st.continuousEnabled = false;
      st.lastContinuousAt = Date.now();
      st.lastStatusJson = null;
      stopContinuousForUser(userId, source, profileId);
      return res.json({ ok: true, source });
    }

    return res
      .status(400)
      .json({ ok: false, msg: "Invalid mode. Use once|start|stop" });
  } catch (e) {
    console.error("Bot run failed:", e);
    st.lastRunAt = Date.now();
    st.lastOutput = `${source} error: ${e?.message || "unknown error"}`;
    st.lastResponse = {
      status: null,
      contentType: "error",
      text: st.lastOutput,
    };
    return res.status(500).json({ ok: false, msg: st.lastOutput });
  }
});

// POST /api/bot/test-email
// Sends a simple test email to the logged-in user's email address.
router.post("/test-email", authRequired, async (req, res) => {
  const userId = req.user.id;
  try {
    const r = await db.query(
      "SELECT email, username, email_unsubscribed FROM users WHERE id = $1 LIMIT 1",
      [userId],
    );
    const user = r.rows[0] || null;

    if (!user?.email) {
      return res
        .status(400)
        .json({ ok: false, msg: "No email set for this user" });
    }

    if (user?.email_unsubscribed) {
      return res.status(400).json({
        ok: false,
        msg: "This user is marked as unsubscribed (email_unsubscribed=true)",
      });
    }

    const subject = `IAAI-bot test email for ${user.username || "user"}`;
    const meta = await sendTestEmail({ to: user.email, subject });
    return res.json({ ok: true, to: user.email, subject, meta });
  } catch (e) {
    const details = e?.response?.body || e?.response?.text || null;
    console.error("SendGrid test email error:", details || e);
    return res.status(500).json({
      ok: false,
      msg: e?.message || "Failed to send test email",
      details,
    });
  }
});

// GET /api/bot/vehicles — returns recent vehicle changes detected by the bot
router.get("/vehicles", authRequired, async (req, res) => {
  const userId = req.user.id;
  const source = req.query.source
    ? normalizeAuctionSource(req.query.source)
    : SOURCE_IAAI;
  const profileId = req.query.profileId
    ? parseInt(req.query.profileId, 10) || null
    : null;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  try {
    const r = await db.query(
      `SELECT id, source, stock_id, vehicle_link, title, price, old_price,
              year, odometer, image, buy_it_now, change_type, detected_at
       FROM vehicle_changes
       WHERE user_id = $1 AND source = $2 AND profile_id IS NOT DISTINCT FROM $3
       ORDER BY detected_at DESC
       LIMIT $4 OFFSET $5`,
      [userId, source, profileId, limit, offset],
    );
    return res.json({ ok: true, vehicles: r.rows });
  } catch (e) {
    console.error("[vehicles] query error:", e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// Resume per-user continuous bots after deploy/restart.
// This is intentionally called from backend/index.js after migrations.
router.resumeContinuousBots = async function resumeContinuousBots() {
  const pollMs = Number(process.env.BOT_POLL_MS || 10 * 60 * 1000);

  let resumed = 0;

  // 1) Legacy bots stored in users table (kept for backward compat)
  const r = await db.query(
    "SELECT id, bot_continuous, copart_bot_continuous FROM users WHERE bot_continuous = true OR copart_bot_continuous = true ORDER BY id",
  );
  const rows = r.rows;

  if (rows.some((row) => row.copart_bot_continuous)) {
    const { ensureSession } = require("./copartScraper");
    ensureSession().catch((e) =>
      console.error("[copart-scraper] startup pre-warm failed:", e.message),
    );
  }

  for (const row of rows) {
    const userId = row.id;
    for (const source of SUPPORTED_SOURCES) {
      const enabled =
        source === SOURCE_COPART ? row.copart_bot_continuous : row.bot_continuous;
      if (!enabled) continue;
      try {
        await startContinuousForUser(userId, source);
        const st = getState(userId, source);
        if (st.running && st.timer) resumed += 1;
      } catch (e) {
        console.error("Failed to resume legacy bot for user", userId, source, e);
        const st = getState(userId, source);
        st.lastRunAt = Date.now();
        st.lastOutput = `Resume failed: ${e?.message || "unknown error"}`;
      }
    }
  }

  // 2) Profile-based bots stored in search_profiles table
  const profileRows = await db.query(
    "SELECT id, user_id, source FROM search_profiles WHERE bot_continuous = true ORDER BY id",
  );

  if (profileRows.rows.some((row) => row.source === SOURCE_COPART)) {
    const { ensureSession } = require("./copartScraper");
    ensureSession().catch((e) =>
      console.error("[copart-scraper] profile pre-warm failed:", e.message),
    );
  }

  for (const row of profileRows.rows) {
    const { id: profileId, user_id: userId, source } = row;
    try {
      await startContinuousForUser(userId, source, profileId);
      const st = getState(userId, source, profileId);
      if (st.running && st.timer) resumed += 1;
    } catch (e) {
      console.error("Failed to resume profile bot", userId, source, profileId, e);
      const st = getState(userId, source, profileId);
      st.lastRunAt = Date.now();
      st.lastOutput = `Resume failed: ${e?.message || "unknown error"}`;
    }
  }

  return { resumed, pollMs };
};

// Allow other routes (e.g. filters save) to clear the per-user seen cache.
// This is NOT done during normal polling; it only happens when explicitly called.
router.resetLastSeenForUser = resetLastSeenForUser;
router.stopProfileBot = stopProfileBot;

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
