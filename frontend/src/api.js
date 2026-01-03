let authToken = null;

const TOKEN_KEY = "authToken";

// NEW: in-memory caches to avoid duplicate calls
const inflight = new Map(); // key -> Promise
const etagCache = new Map(); // url -> { etag, json }

export function setAuthToken(token) {
  authToken = token || null;
  try {
    if (authToken) localStorage.setItem(TOKEN_KEY, authToken);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export function loadTokenFromStorage() {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    authToken = t || null;
    return authToken;
  } catch {
    authToken = null;
    return null;
  }
}

async function request(method, url, body) {
  const key = `${method}::${url}::${
    body === undefined ? "" : JSON.stringify(body)
  }`;

  // Dedupe identical concurrent requests
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    const headers = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    // Only set JSON content-type when we actually send a JSON body
    if (body !== undefined) headers["Content-Type"] = "application/json";

    // ETag: for GET requests, send If-None-Match when we have one
    if (method === "GET") {
      const cached = etagCache.get(url);
      if (cached?.etag) headers["If-None-Match"] = cached.etag;
      headers.Accept = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Handle 304 with cached payload (no body)
    if (res.status === 304 && method === "GET") {
      const cached = etagCache.get(url);
      const json = cached?.json || { ok: true };
      return { ...json, _status: 304, _fromCache: true };
    }

    const json = await res.json().catch(() => ({}));

    // Save ETag + payload for GET responses
    if (method === "GET") {
      const etag = res.headers.get("etag");
      if (etag) etagCache.set(url, { etag, json });
    }

    json._status = res.status;
    return json;
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

export function apiGet(url) {
  return request("GET", url);
}

export function apiPost(url, body) {
  return request("POST", url, body);
}
