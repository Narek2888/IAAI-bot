const { fork } = require("child_process");
const path = require("path");
const crypto = require("crypto");

const WORKER_PATH = path.join(__dirname, "copartWorker.js");
const RESTART_DELAY_MS = 3000;

let worker = null;
const pending = new Map(); // id -> { resolve, reject }

function startWorker() {
  worker = fork(WORKER_PATH, [], {
    // stdin ignored; stdout/stderr flow through to the parent process logs
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });

  worker.on("message", (msg) => {
    if (msg.type === "ready") {
      console.log("[copart-proxy] Worker process ready");
      return;
    }

    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);

    if (msg.type === "error") {
      const err = new Error(msg.error);
      if (msg.code) err.code = msg.code;
      p.reject(err);
    } else {
      p.resolve(msg.data);
    }
  });

  worker.on("exit", (code, signal) => {
    console.error(
      `[copart-proxy] Worker exited (code=${code}, signal=${signal}), restarting in ${RESTART_DELAY_MS / 1000}s...`
    );
    worker = null;

    // Reject all in-flight calls so callers get an immediate error instead of hanging
    for (const [id, p] of pending) {
      p.reject(new Error("Copart worker crashed — will retry on next poll"));
      pending.delete(id);
    }

    setTimeout(startWorker, RESTART_DELAY_MS);
  });

  worker.on("error", (e) => {
    console.error("[copart-proxy] Worker spawn error:", e.message);
  });
}

function send(msg) {
  return new Promise((resolve, reject) => {
    if (!worker || !worker.connected) {
      return reject(new Error("Copart worker not available (starting up or restarting)"));
    }
    const id = crypto.randomBytes(8).toString("hex");
    pending.set(id, { resolve, reject });
    worker.send({ ...msg, id });
  });
}

function ensureSession() {
  return send({ type: "ensureSession" });
}

function searchCopart(payload) {
  return send({ type: "search", payload });
}

function fetchCopartImageAsDataUri(url) {
  return send({ type: "fetchImage", url });
}

function invalidateCopartSession() {
  // Fire-and-forget: the worker will close and reopen the browser on next use
  send({ type: "invalidateSession" }).catch(() => {});
}

// Fork the worker as soon as this module is loaded so the browser
// session can warm up in the background before the first search.
startWorker();

module.exports = { searchCopart, invalidateCopartSession, ensureSession, fetchCopartImageAsDataUri };
