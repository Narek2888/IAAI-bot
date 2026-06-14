import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../src/api";
import VehiclesPanel from "./VehiclesPanel";

export default function Bot({ source = "IAAI", disabled = false }) {
  const [bot, setBot] = useState({
    running: false,
    lastOutput: null,
    continuousEnabled: null,
    filtersSet: null,
  });

  const [runOnceSuccessOpen, setRunOnceSuccessOpen] = useState(false);
  const [runOnceLoading, setRunOnceLoading] = useState(false);
  const [runOnceHasEmail, setRunOnceHasEmail] = useState(null); // null | boolean
  const [runOnceBusy, setRunOnceBusy] = useState(false);
  const [runOnceChangesCount, setRunOnceChangesCount] = useState(null); // null | number
  const [runOnceEmailed, setRunOnceEmailed] = useState(null); // null | boolean
  const [runOnceLastOutput, setRunOnceLastOutput] = useState(null);

  const inFlightRef = useRef(false);
  const loopIdRef = useRef(0); // increments to cancel previous loops
  const timeoutRef = useRef(null);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [settings, status] = await Promise.all([
        apiGet(`/api/bot/settings?source=${encodeURIComponent(source)}`),
        apiGet(`/api/bot/status?source=${encodeURIComponent(source)}`),
      ]);

      setBot((prev) => ({
        ...prev,
        ...(settings?.ok ? settings.bot : null),
        ...(status?.ok ? status.bot : null),
      }));
    } finally {
      inFlightRef.current = false;
    }
  }, [source]);

  // One-time fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll ONLY while running; no overlap; pause when tab is hidden
  useEffect(() => {
    // cancel any previous loop
    loopIdRef.current += 1;
    const myLoopId = loopIdRef.current;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;

    if (!bot.running) return;

    // 15 minutes
    const uiPollMs = 15 * 60 * 1000;

    const tick = async () => {
      if (loopIdRef.current !== myLoopId) return;

      if (document.visibilityState !== "visible") {
        timeoutRef.current = setTimeout(tick, uiPollMs);
        return;
      }

      await refresh();

      if (loopIdRef.current !== myLoopId) return;
      timeoutRef.current = setTimeout(tick, uiPollMs);
    };

    timeoutRef.current = setTimeout(tick, uiPollMs);

    return () => {
      loopIdRef.current += 1;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
  }, [bot.running, refresh]);

  const runOnce = async () => {
    if (runOnceBusy) return;

    setRunOnceSuccessOpen(true);
    setRunOnceLoading(true);
    setRunOnceHasEmail(null);
    setRunOnceChangesCount(null);
    setRunOnceEmailed(null);
    setRunOnceLastOutput(null);
    setRunOnceBusy(true);

    const minSpinnerMs = 650;
    const startedAt = Date.now();

    try {
      // Snapshot current lastRunAt so we know when a new run finishes
      let prevRunAt = null;
      try {
        const before = await apiGet(`/api/bot/status?source=${encodeURIComponent(source)}`);
        prevRunAt = before?.bot?.lastRunAt ?? null;
      } catch { /* ignore */ }

      // Kick off the run — server responds immediately, scrape runs in background
      const r = await apiPost(
        `/api/bot/run?mode=once&source=${encodeURIComponent(source)}`,
      );
      if (!r?.ok) {
        setRunOnceSuccessOpen(false);
        setRunOnceLoading(false);
        setRunOnceHasEmail(null);
        setRunOnceChangesCount(null);
        setRunOnceEmailed(null);
        setRunOnceLastOutput(null);
        return alert(r?.msg || "Failed");
      }

      // Poll status until lastRunAt changes (meaning the background run finished)
      const maxWaitMs = 120_000;
      const pollIntervalMs = 2000;
      while (Date.now() - startedAt < maxWaitMs) {
        await new Promise((res) => setTimeout(res, pollIntervalMs));
        try {
          const status = await apiGet(`/api/bot/status?source=${encodeURIComponent(source)}`);
          const curRunAt = status?.bot?.lastRunAt ?? null;
          if (curRunAt !== null && curRunAt !== prevRunAt) {
            const c = Number(status?.bot?.lastChangesCount);
            setRunOnceChangesCount(Number.isFinite(c) ? c : 0);
            if (typeof status?.bot?.lastEmailed === "boolean") setRunOnceEmailed(status.bot.lastEmailed);
            if (status?.bot?.lastOutput) setRunOnceLastOutput(String(status.bot.lastOutput));
            break;
          }
        } catch { /* keep polling */ }
      }

      try {
        const settings = await apiGet(`/api/bot/settings?source=${encodeURIComponent(source)}`);
        setRunOnceHasEmail(!!(settings?.ok && settings?.bot?.hasEmail));
      } catch {
        setRunOnceHasEmail(false);
      }

      await refresh();
    } finally {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, minSpinnerMs - elapsed);
      if (remaining) {
        await new Promise((r) => setTimeout(r, remaining));
      }
      setRunOnceLoading(false);
      setRunOnceBusy(false);
    }
  };

  const start = async () => {
    const r = await apiPost(
      `/api/bot/run?mode=start&source=${encodeURIComponent(source)}`,
    );
    if (!r?.ok) return alert(r?.msg || "Failed");
    await refresh();
  };

  const stop = async () => {
    const r = await apiPost(
      `/api/bot/run?mode=stop&source=${encodeURIComponent(source)}`,
    );
    if (!r?.ok) return alert(r?.msg || "Failed");
    await refresh();
  };

  return (
    <div style={{ marginTop: 16 }}>
      <style>{`
        @keyframes botSpinner {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <h3>Bot</h3>
      <div>Running: {String(bot.running)}</div>
      <div>Auto-resume (saved): {String(bot.continuousEnabled)}</div>

      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <button onClick={runOnce} disabled={disabled || runOnceBusy}>
          Run once
        </button>
        <button onClick={start} disabled={bot.running || disabled}>
          Start continuous
        </button>
        <button onClick={stop} disabled={!bot.running}>
          Stop
        </button>
      </div>

      {runOnceSuccessOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Run once success"
          onMouseDown={() => {
            setRunOnceSuccessOpen(false);
            setRunOnceLoading(false);
            setRunOnceHasEmail(null);
            setRunOnceChangesCount(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1500,
            background: "rgba(0, 0, 0, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              borderRadius: 8,
              padding: 16,
              boxShadow: "0 6px 20px rgba(0, 0, 0, 0.06)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Success</div>
            {runOnceLoading ? (
              <div
                style={{
                  marginBottom: 12,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  color: "#6b7280",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: "3px solid #e5e7eb",
                    borderTopColor: "#3b82f6",
                    animation: "botSpinner 0.9s linear infinite",
                  }}
                />
                <div>The request is accepted. Working on it.</div>
              </div>
            ) : (runOnceChangesCount ?? 0) <= 0 ? (
              <div style={{ marginBottom: 12 }}>
                No updates matched your current filters.
              </div>
            ) : runOnceHasEmail ? (
              <div style={{ marginBottom: 12 }}>
                {runOnceEmailed === true
                  ? "Updates were found and an email was sent."
                  : runOnceEmailed === false
                    ? "Updates were found, but email was not sent (see details below)."
                    : "Updates were found. Check details below."}
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                Updates were found, but your email is not configured. Please set
                your email in Manage account.
              </div>
            )}
            {!runOnceLoading && runOnceLastOutput && (
              <div style={{ marginBottom: 12, padding: "8px 10px", background: "#f3f4f6", borderRadius: 6, fontSize: 11, color: "#374151", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5 }}>
                {runOnceLastOutput}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setRunOnceSuccessOpen(false);
                  setRunOnceLoading(false);
                  setRunOnceHasEmail(null);
                  setRunOnceChangesCount(null);
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <VehiclesPanel source={source} refreshKey={bot.lastRunAt} />
    </div>
  );
}
