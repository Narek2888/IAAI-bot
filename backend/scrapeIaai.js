const cheerio = require("cheerio");

const BASE_URL = "https://www.iaai.com";

function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function absUrl(u) {
  const s = decodeHtmlEntities(u || "").trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `${BASE_URL}${s}`;
  return `${BASE_URL}/${s}`;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function extractNameFromVehicleDetailUrl(u) {
  const s = String(u || "");
  const m = s.match(/\/VehicleDetail\/([A-Za-z0-9]+)~US/i);
  return m ? m[1] : null;
}

function isValidVehicleId(id) {
  const s = String(id || "").trim();
  // IAAI VehicleDetail ids are numeric inventory ids (e.g. 44226123)
  return /^\d{6,}$/.test(s);
}

function extractVehicleIdFromVehicleDetailUrl(u) {
  const raw = extractNameFromVehicleDetailUrl(u);
  return isValidVehicleId(raw) ? raw : null;
}

function getNextValueByLabel($, scope, labelText) {
  const label = scope
    .find(".data-list__label")
    .filter(
      (_, el) =>
        $(el).text().replace(/\s+/g, " ").trim().toLowerCase() ===
        labelText.toLowerCase(),
    )
    .first();

  if (!label.length) return null;

  const v = label.next(".data-list__value").first().text().trim();
  return v || null;
}

function extractMoney(text) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  const m = s.match(/\$[\d,]+(?:\.\d{2})?/);
  return m ? m[0] : null;
}

function extractOdometer(text) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;

  // Common formats: "123,456 mi", "123456 miles", "Odometer: 12,345"
  const m = s.match(/\b[\d,]{1,9}\b/);
  return m ? m[0] : null;
}

// compatibility for older code in this file
function parseMoney(text) {
  const m = extractMoney(text);
  if (!m) return null;
  const num = Number(m.replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function parseVehicleFromRow($, $row) {
  // Title + link (most reliable)
  const titleA = $row.find('h4 a[href^="/VehicleDetail/"]').first();
  const anyLinkA = $row.find('a[href^="/VehicleDetail/"]').first();
  const linkA = titleA.length ? titleA : anyLinkA;

  const title = linkA.text().trim() || null;
  const vehicle_link = absUrl(linkA.attr("href"));

  // Stock #
  const stock_id =
    getNextValueByLabel($, $row, "Stock #:") ||
    getNextValueByLabel($, $row, "Stock #") ||
    null;

  // Price (Buy Now / Current Bid text is often in action list)
  const actionA = $row
    .find('ul.data-list--action a[href^="/VehicleDetail/"]')
    .filter((_, a) => /buy\s+now|current\s+bid|bid/i.test($(a).text()))
    .first();
  const actionText = actionA.text().trim();
  const priceFromAction = extractMoney(actionText);

  // Fallback: some layouts expose bid/buy-now values as label/value pairs
  const priceFromLabels =
    extractMoney(getNextValueByLabel($, $row, "Buy Now:") || "") ||
    extractMoney(getNextValueByLabel($, $row, "Buy Now") || "") ||
    extractMoney(getNextValueByLabel($, $row, "Current Bid:") || "") ||
    extractMoney(getNextValueByLabel($, $row, "Current Bid") || "") ||
    extractMoney(getNextValueByLabel($, $row, "Bid:") || "") ||
    extractMoney(getNextValueByLabel($, $row, "Bid") || "") ||
    null;

  // Last resort: scan row text for a money token
  const priceFromRowText = extractMoney($row.text()) || null;

  const price = priceFromAction || priceFromLabels || priceFromRowText;

  const odometer =
    extractOdometer(getNextValueByLabel($, $row, "Odometer:") || "") ||
    extractOdometer(getNextValueByLabel($, $row, "Odometer") || "") ||
    extractOdometer(getNextValueByLabel($, $row, "Mileage:") || "") ||
    extractOdometer(getNextValueByLabel($, $row, "Mileage") || "") ||
    extractOdometer(getNextValueByLabel($, $row, "ODO:") || "") ||
    extractOdometer(getNextValueByLabel($, $row, "ODO") || "") ||
    null;

  // Image
  const imgEl = $row.find("img[data-src], img[src]").first();
  const imgUrl = absUrl(imgEl.attr("data-src") || imgEl.attr("src"));
  const image = imgUrl
    ? `<img src="${imgUrl}" width="400" height="300" />`
    : null;

  const name = extractVehicleIdFromVehicleDetailUrl(vehicle_link);

  return {
    name,
    title,
    vehicle_link,
    stock_id,
    price,
    odometer,
    image,
  };
}

/**
 * Normalize "Stock #" to digits only.
 */
function normalizeStockNumber(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;

  const tagged = s.match(/Stock\s*#\s*[:\-]?\s*(\d{5,})/i);
  if (tagged) return tagged[1];

  const digits = s.replace(/[^\d]/g, "");
  return digits.length >= 5 ? digits : null;
}

function getAny(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null)
      return obj[k];
  }
  return null;
}

function extractVehiclesFromHtml(html, limit = 500) {
  const $ = cheerio.load(html);

  // Strategy A (preferred): DOM rows (contains Stock # / title / Buy Now)
  const rows = $(
    "div.table-row.table-row-border, div.table-row, div.table-row-border",
  );
  if (rows.length) {
    const parsed = rows
      .map((_, row) => {
        try {
          const v = parseVehicleFromRow($, $(row));
          if (!v.vehicle_link && !v.name) return null;

          const vehicleId =
            v.name || extractVehicleIdFromVehicleDetailUrl(v.vehicle_link);
          if (!vehicleId) return null;

          // normalize stock to digits (if present)
          const stock_id = normalizeStockNumber(v.stock_id);

          // If image missing, fall back to vis resizer using name (when possible)
          const image =
            v.image ||
            (vehicleId
              ? `<img src="https://vis.iaai.com/resizer?imageKeys=${vehicleId}~SID~I1&width=400&height=300" width="400" height="300" />`
              : null);

          return {
            title: v.title,
            vehicle_link:
              v.vehicle_link ||
              (vehicleId ? `${BASE_URL}/VehicleDetail/${vehicleId}~US` : null),
            stock_id,
            price: v.price,
            odometer: v.odometer,
            image,
          };
        } catch {
          return null;
        }
      })
      .get()
      .filter(Boolean);

    const byLink = new Map();
    for (const v of parsed) {
      if (v?.vehicle_link && !byLink.has(v.vehicle_link))
        byLink.set(v.vehicle_link, v);
    }

    // Backfill: if markup changed and some rows were missed, fall back to ids
    // found in the HTML (links/images). This keeps extraction closer to the UI count.
    if (byLink.size < limit) {
      const namesFromImages = uniq(
        [...html.matchAll(/imageKeys=([A-Za-z0-9]+)~SID~I1/g)].map((m) => m[1]),
      );

      const namesFromLinks = uniq(
        [...html.matchAll(/\/VehicleDetail\/([A-Za-z0-9]+)~US/g)].map(
          (m) => m[1],
        ),
      );

      const names = uniq([...namesFromImages, ...namesFromLinks]).filter((n) =>
        isValidVehicleId(n),
      );

      for (const name of names) {
        if (byLink.size >= limit) break;
        const link = `${BASE_URL}/VehicleDetail/${name}~US`;
        if (byLink.has(link)) continue;
        byLink.set(link, {
          title: null,
          vehicle_link: link,
          stock_id: null,
          price: null,
          odometer: null,
          image: `<img src="https://vis.iaai.com/resizer?imageKeys=${name}~SID~I1&width=400&height=300" width="400" height="300" />`,
        });
      }
    }

    const out = Array.from(byLink.values()).slice(0, limit);
    if (out.length) return out;
  }

  // Strategy B: JSON scripts (may be present, but often lacks title/image details)
  const vehicles = [];
  const scripts = $('script[type="application/json"]')
    .map((_, el) => $(el).text())
    .get();

  for (const txt of scripts) {
    const trimmed = (txt || "").trim();
    if (!trimmed) continue;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const stack = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;

      if (Array.isArray(node)) {
        for (const x of node) stack.push(x);
        continue;
      }

      if (typeof node === "object") {
        const name = node.name ?? node.Name ?? null;

        const rawStock = getAny(node, [
          "stockNumber",
          "StockNumber",
          "stockNo",
          "StockNo",
          "stockNum",
          "StockNum",
          "stockNbr",
          "StockNbr",
          "stock_number",
          "stock",
          "Stock",
        ]);

        const rawMaybeLabeled = getAny(node, [
          "stockLabel",
          "StockLabel",
          "displayStock",
          "DisplayStock",
          "vehicleDescription",
          "VehicleDescription",
          "title",
          "Title",
        ]);

        const stock_id =
          normalizeStockNumber(rawStock) ||
          normalizeStockNumber(rawMaybeLabeled) ||
          null;

        const price =
          node.price ??
          node.Price ??
          node.buyNowPrice ??
          node.BuyNowPrice ??
          node.currentBid ??
          node.CurrentBid ??
          null;

        const odometer =
          node.odometer ??
          node.Odometer ??
          node.odometerReading ??
          node.OdometerReading ??
          node.mileage ??
          node.Mileage ??
          node.odo ??
          node.ODO ??
          null;

        if (name && typeof name === "string" && isValidVehicleId(name)) {
          vehicles.push({
            name,
            stock_id,
            price: price != null ? String(price) : null,
            odometer: odometer != null ? String(odometer) : null,
          });
        }

        for (const k of Object.keys(node)) stack.push(node[k]);
      }
    }
  }

  if (vehicles.length > 0) {
    const byName = new Map();
    for (const v of vehicles) {
      if (v?.name && !byName.has(v.name)) byName.set(v.name, v);
    }
    return Array.from(byName.values())
      .slice(0, limit)
      .map((v) => ({
        title: null,
        vehicle_link: `${BASE_URL}/VehicleDetail/${v.name}~US`,
        stock_id: v.stock_id,
        image: `<img src="https://vis.iaai.com/resizer?imageKeys=${v.name}~SID~I1&width=400&height=300" width="400" height="300" />`,
        price: v.price,
        odometer: v.odometer,
      }));
  }

  // Strategy C: Hidden IDs
  const vehicleDetailsAttr = $("#VehicleDetails").attr("value");
  if (vehicleDetailsAttr) {
    const decoded = decodeHtmlEntities(vehicleDetailsAttr);
    try {
      const arr = JSON.parse(decoded);
      const out = arr
        .map((x) => {
          const id = x?.Id; // "44226123~US"
          const inv = id ? String(id).split("~")[0] : null;
          if (!inv || !isValidVehicleId(inv)) return null;

          return {
            title: null,
            vehicle_link: `${BASE_URL}/VehicleDetail/${inv}~US`,
            stock_id: null,
            image: `<img src="https://vis.iaai.com/resizer?imageKeys=${inv}~SID~I1&width=400&height=300" width="400" height="300" />`,
            price: null,
            odometer: null,
          };
        })
        .filter(Boolean)
        .slice(0, limit);

      if (out.length) return out;
    } catch {
      // ignore
    }
  }

  // Strategy D: Regex fallbacks
  const namesFromImages = uniq(
    [...html.matchAll(/imageKeys=([A-Za-z0-9]+)~SID~I1/g)].map((m) => m[1]),
  );

  const namesFromLinks = uniq(
    [...html.matchAll(/\/VehicleDetail\/([A-Za-z0-9]+)~US/g)].map((m) => m[1]),
  );

  const names = uniq([...namesFromImages, ...namesFromLinks])
    .filter((n) => isValidVehicleId(n))
    .slice(0, limit);

  return names.map((name) => ({
    title: null,
    vehicle_link: `${BASE_URL}/VehicleDetail/${name}~US`,
    stock_id: null,
    image: `<img src="https://vis.iaai.com/resizer?imageKeys=${name}~SID~I1&width=400&height=300" width="400" height="300" />`,
    price: null,
    odometer: null,
  }));
}

module.exports = { extractVehiclesFromHtml };
