const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteerExtra.use(StealthPlugin());

const SESSION_TTL_MS = 25 * 60 * 1000; // 25 minutes

let browser = null;
let page = null;
let sessionExpiresAt = 0;
let initPromise = null;

async function openSession() {
  browser = await puppeteerExtra.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Navigate to Copart to establish session (Imperva challenge + cookies)
  await page.goto("https://www.copart.com/lotSearchResults", {
    waitUntil: "networkidle2",
    timeout: 40000,
  });

  // Wait until Imperva sets the reese84 cookie
  for (let i = 0; i < 30; i++) {
    const cookies = await page.cookies("https://www.copart.com");
    if (cookies.some((c) => c.name === "reese84")) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  sessionExpiresAt = Date.now() + SESSION_TTL_MS;
  console.log("[copart-scraper] Browser session ready, valid for 25 min");
}

async function ensureSession() {
  const now = Date.now();
  if (page && browser && now < sessionExpiresAt) return;

  // Deduplicate concurrent callers
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (browser) await browser.close().catch(() => {});
      browser = null;
      page = null;
      console.log("[copart-scraper] Starting browser session...");
      await openSession();
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

async function searchCopart(payload) {
  await ensureSession();

  try {
    // Make the API call from within the browser page context so all
    // session cookies and CORS credentials are handled natively.
    const result = await page.evaluate(async (body) => {
      // Spring Security requires X-XSRF-TOKEN header for POST requests.
      // The XSRF-TOKEN cookie is readable by JS (not HttpOnly by design).
      const xsrfRaw = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => /^XSRF-TOKEN=/i.test(c))
        ?.split("=")
        .slice(1)
        .join("=");
      const xsrfToken = xsrfRaw ? decodeURIComponent(xsrfRaw) : null;

      const headers = { "Content-Type": "application/json" };
      if (xsrfToken) headers["X-XSRF-TOKEN"] = xsrfToken;

      headers["X-Requested-With"] = "XMLHttpRequest";

      const resp = await fetch("/public/lots/search-results", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!resp.ok) return { error: resp.status };
      return resp.json();
    }, payload);

    return result;
  } catch (e) {
    // If the page context is gone (browser crashed etc.), invalidate session
    console.error("[copart-scraper] fetch failed:", e.message);
    browser = null;
    page = null;
    sessionExpiresAt = 0;
    throw e;
  }
}

// Fetch a Copart CDN image server-side using session cookies from Puppeteer.
// Server-side fetch has no CORS restrictions, and the Imperva cookies ensure
// the CDN serves the image rather than returning a bot challenge.
async function fetchCopartImageAsDataUri(imageUrl) {
  if (!imageUrl) return null;
  try {
    await ensureSession();

    // Collect cookies for both the main site and CDN subdomain.
    // Imperva sets reese84 with domain=.copart.com so it covers cs.copart.com too.
    const [mainCookies, cdnCookies] = await Promise.all([
      page.cookies("https://www.copart.com").catch(() => []),
      page.cookies("https://cs.copart.com").catch(() => []),
    ]);
    const seen = new Set();
    const allCookies = [...mainCookies, ...cdnCookies].filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    });
    const cookieStr = allCookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const axios = require("axios");
    const resp = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: {
        Cookie: cookieStr,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.copart.com/",
      },
      validateStatus: () => true,
    });

    if (resp.status !== 200) {
      console.warn("[copart-img] fetch failed, status:", resp.status, imageUrl);
      return null;
    }

    const ct = resp.headers["content-type"] || "image/jpeg";
    const b64 = Buffer.from(resp.data).toString("base64");
    return `data:${ct};base64,${b64}`;
  } catch (e) {
    console.warn("[copart-img] exception:", e.message, imageUrl);
    return null;
  }
}

function invalidateCopartSession() {
  if (browser) browser.close().catch(() => {});
  browser = null;
  page = null;
  sessionExpiresAt = 0;
}

module.exports = { searchCopart, invalidateCopartSession, ensureSession, fetchCopartImageAsDataUri };
