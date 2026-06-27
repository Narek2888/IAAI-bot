const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteerExtra.use(StealthPlugin());

const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-zygote",
  "--single-process",
  "--disable-crash-reporter",
  "--disable-crashpad",
  "--disable-blink-features=AutomationControlled",
];

const CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes

let cachedSession = null; // { cookieString, xsrfToken }
let cacheExpiresAt = 0;
let refreshPromise = null;

async function fetchFreshSession() {
  let browser;
  try {
    browser = await puppeteerExtra.launch({
      args: CHROME_ARGS,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "chromium",
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Intercept the search API call the page makes to capture its exact headers
    let capturedXsrfToken = null;
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.url().includes("/public/lots/search")) {
        const h = req.headers();
        capturedXsrfToken =
          h["x-xsrf-token"] || h["X-XSRF-TOKEN"] || capturedXsrfToken;
      }
      req.continue();
    });

    // Navigate with a free-form search so the page triggers a search API call
    await page.goto(
      "https://www.copart.com/lotSearchResults?free_form_search=tesla",
      { waitUntil: "networkidle2", timeout: 30000 }
    );

    // Poll until Imperva sets the reese84 challenge cookie (up to 15s)
    let cookies = [];
    for (let i = 0; i < 30; i++) {
      cookies = await page.cookies("https://www.copart.com");
      if (cookies.some((c) => c.name === "reese84")) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!cookies.some((c) => c.name === "reese84")) {
      throw new Error("reese84 cookie not found after challenge wait");
    }

    // If XSRF token wasn't in the intercepted request, try extracting from cookies/page
    if (!capturedXsrfToken) {
      const xsrfCookie = cookies.find(
        (c) => c.name.toLowerCase() === "xsrf-token"
      );
      if (xsrfCookie) capturedXsrfToken = xsrfCookie.value;
    }

    if (!capturedXsrfToken) {
      capturedXsrfToken = await page
        .evaluate(() => {
          const meta = document.querySelector(
            'meta[name="csrf-token"], meta[name="_csrf"]'
          );
          if (meta) return meta.getAttribute("content");
          if (window._csrf) return window._csrf;
          return null;
        })
        .catch(() => null);
    }

    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    return { cookieString, xsrfToken: capturedXsrfToken || null };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function getCopartSession() {
  // Authenticated session from .env always takes priority
  const envCookie = process.env.COPART_COOKIE;
  if (envCookie) return { cookieString: envCookie, xsrfToken: null };

  const now = Date.now();
  if (cachedSession && now < cacheExpiresAt) return cachedSession;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      console.log("[copart-cookies] Launching Puppeteer to refresh session...");
      const session = await fetchFreshSession();
      cachedSession = session;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      console.log(
        `[copart-cookies] Session refreshed, valid for 25 min. XSRF token: ${session.xsrfToken ? "found" : "not found"}`
      );
      return session;
    } catch (e) {
      console.error("[copart-cookies] Puppeteer failed:", e.message);
      return { cookieString: null, xsrfToken: null };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Legacy helper — used by bot.js warm-up check
async function getCopartCookies() {
  const session = await getCopartSession();
  return session.cookieString;
}

function invalidateCopartCookies() {
  cachedSession = null;
  cacheExpiresAt = 0;
}

module.exports = { getCopartSession, getCopartCookies, invalidateCopartCookies };
