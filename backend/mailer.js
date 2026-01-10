const sgMail = require("@sendgrid/mail");

const BASE_URL = process.env.IAAI_BASE_URL || "https://www.iaai.com";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

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

function absolutizeUrl(u) {
  const s = String(u ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `${BASE_URL}${s}`;
  return `${BASE_URL}/${s}`;
}

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

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && isMeaningful(obj[k])) return obj[k];
  }
  return null;
}

function extractVehicleIdFromVehicleDetailUrl(u) {
  const s = String(u ?? "");
  const m = s.match(/\/VehicleDetail\/(\w+)~US/i);
  if (!m) return null;
  const id = String(m[1] ?? "").trim();
  return /^\d{6,}$/.test(id) ? id : null;
}

function isValidVisResizerImage(u) {
  const s = String(u ?? "");
  const m = s.match(/imageKeys=([^&]+)~SID~I1/i);
  if (!m) return true; // not a resizer URL
  const key = String(m[1] ?? "").trim();
  return /^\d{6,}$/.test(key);
}

function normalizeVehicle(v) {
  const rawLink = pick(v, ["vehicle_link", "link", "url", "href"]);
  const candidateLink = rawLink ? absolutizeUrl(rawLink) : "";
  const vehicle_link = extractVehicleIdFromVehicleDetailUrl(candidateLink)
    ? candidateLink
    : "";

  const title = pick(v, ["title", "name", "vehicle", "vehicle_title"]);
  const stock_id = pick(v, ["stock_id", "stockId", "stock", "stock_number"]);
  const price = pick(v, ["price", "current_bid", "bid", "buy_now"]);
  const image = pick(v, ["image", "image_url", "imageUrl", "img", "photo"]);

  const safeImage = isValidVisResizerImage(image) ? image : null;

  return { vehicle_link, title, stock_id, price, image: safeImage };
}

function buildImageHtml(imageValue) {
  if (!imageValue) return "";

  const raw = String(imageValue).trim();

  // Case A: scraper provided an <img ...> tag (sanitize it)
  if (raw.toLowerCase().includes("<img")) {
    let html = raw;

    // If it uses data-src, convert to src (email clients need src)
    if (!/src\s*=/.test(html) && /data-src\s*=/.test(html)) {
      html = html.replace(/data-src\s*=/i, "src=");
    }

    // Ensure src is quoted (best-effort)
    html = html.replace(/src=([^"'\s>]+)/i, 'src="$1"');

    // Absolutize src URL if needed
    html = html.replace(/src\s*=\s*["']([^"']+)["']/i, (_, src) => {
      const abs = absolutizeUrl(src);
      return `src="${esc(abs)}"`;
    });

    // Add basic sizing if not present
    if (!/style\s*=/.test(html)) {
      html = html.replace(
        /<img/i,
        '<img style="max-width:400px;height:auto;display:block;"'
      );
    }

    return html;
  }

  // Case B: scraper provided a plain image URL
  const absUrl = absolutizeUrl(raw);
  if (!absUrl) return "";

  return `<img src="${esc(
    absUrl
  )}" style="max-width:400px;height:auto;display:block;" width="400" />`;
}

function vehiclesToHtml(vehicles) {
  const normalized = (vehicles || []).map(normalizeVehicle);

  const items = normalized
    .map((v) => {
      const stock = v.stock_id ? esc(v.stock_id) : "N/A";
      const price = v.price ? esc(v.price) : "N/A";
      const href = v.vehicle_link || "";
      const label = v.title ? esc(v.title) : href ? esc(href) : "N/A";
      const imgHtml = buildImageHtml(v.image);

      return `
        <div style="border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin:12px 0; font-family: Arial, sans-serif;">
          <div style="margin:0 0 6px 0;"><strong>Stock Id:</strong> ${stock}</div>
          <div style="margin:0 0 6px 0;"><strong>Price:</strong> ${price}</div>
          <div style="margin:0 0 10px 0;">
            <strong>Link:</strong>
            ${
              href
                ? `<a href="${esc(
                    href
                  )}" target="_blank" rel="noopener noreferrer">${label}</a>`
                : "N/A"
            }
          </div>
          <div style="margin:0;">
            ${imgHtml || "<em>Image not available</em>"}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div style="font-family: Arial, sans-serif;">
      <h3 style="margin:0 0 8px 0;">IAAI Updates</h3>
      <div style="margin:0 0 12px 0;">Found ${
        (vehicles || []).length
      } update(s).</div>
      ${items || "<div>No vehicles.</div>"}
    </div>
  `;
}

async function sendVehiclesEmail({ to, subject, vehicles }) {
  const apiKey = requireEnv("SENDGRID_API_KEY");
  const from = requireEnv("SENDGRID_FROM");

  sgMail.setApiKey(apiKey);

  await sgMail.send({
    to,
    from,
    subject,
    html: vehiclesToHtml(vehicles),
  });
}

module.exports = { sendVehiclesEmail };
