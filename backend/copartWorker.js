const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");

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

const SESSION_TTL_MS = 25 * 60 * 1000;
const MAX_LAUNCH_RETRIES = 10;
const RETRY_BASE_DELAY_MS = 3000;

let browser = null;
let page = null;
let sessionExpiresAt = 0;
let initPromise = null;

async function openSession() {
  browser = await puppeteerExtra.launch({
    args: CHROME_ARGS,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "chromium",
    headless: true,
  });

  page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  await page.goto("https://www.copart.com/lotSearchResults", {
    waitUntil: "networkidle2",
    timeout: 40000,
  });

  for (let i = 0; i < 30; i++) {
    const cookies = await page.cookies("https://www.copart.com");
    if (cookies.some((c) => c.name === "reese84")) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  sessionExpiresAt = Date.now() + SESSION_TTL_MS;
  console.log("[copart-worker] Browser session ready, valid for 25 min");
}

async function ensureSession() {
  const now = Date.now();
  if (page && browser && now < sessionExpiresAt) return;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (browser) await browser.close().catch(() => {});
      browser = null;
      page = null;

      let lastErr;
      for (let attempt = 1; attempt <= MAX_LAUNCH_RETRIES; attempt++) {
        try {
          console.log(`[copart-worker] Starting browser session (attempt ${attempt}/${MAX_LAUNCH_RETRIES})...`);
          await openSession();
          return;
        } catch (e) {
          lastErr = e;
          console.error(`[copart-worker] Launch attempt ${attempt}/${MAX_LAUNCH_RETRIES} failed: ${e.message}`);
          browser = null;
          page = null;
          if (attempt < MAX_LAUNCH_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * attempt;
            console.log(`[copart-worker] Retrying in ${delay / 1000}s...`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      console.error("[copart-worker] All launch attempts exhausted, giving up.");
      throw lastErr;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

async function searchCopart(payload) {
  await ensureSession();

  try {
    const result = await page.evaluate(async (body) => {
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
    console.error("[copart-worker] fetch failed:", e.message);
    browser = null;
    page = null;
    sessionExpiresAt = 0;
    throw e;
  }
}

async function fetchCopartImageAsDataUri(imageUrl) {
  if (!imageUrl) return null;
  try {
    await ensureSession();

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
      console.warn("[copart-worker] image fetch failed, status:", resp.status, imageUrl);
      return null;
    }

    const ct = resp.headers["content-type"] || "image/jpeg";
    const b64 = Buffer.from(resp.data).toString("base64");
    return `data:${ct};base64,${b64}`;
  } catch (e) {
    console.warn("[copart-worker] image exception:", e.message, imageUrl);
    return null;
  }
}

function invalidateSession() {
  if (browser) browser.close().catch(() => {});
  browser = null;
  page = null;
  sessionExpiresAt = 0;
}

// Clean up browser when parent closes the IPC channel
process.on("disconnect", () => {
  if (browser) browser.close().catch(() => {});
  process.exit(0);
});

process.on("message", async (msg) => {
  const { type, id } = msg;
  try {
    let data;
    if (type === "ensureSession") {
      await ensureSession();
      data = { ok: true };
    } else if (type === "search") {
      data = await searchCopart(msg.payload);
    } else if (type === "fetchImage") {
      data = await fetchCopartImageAsDataUri(msg.url);
    } else if (type === "invalidateSession") {
      invalidateSession();
      data = { ok: true };
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
    process.send({ type: "result", id, data });
  } catch (e) {
    process.send({ type: "error", id, error: e.message, code: e.code });
  }
});

process.send({ type: "ready" });
