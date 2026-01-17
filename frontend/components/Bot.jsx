import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../src/api";

export default function Bot({ disabled = false }) {
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

  const inFlightRef = useRef(false);
  const loopIdRef = useRef(0); // increments to cancel previous loops
  const timeoutRef = useRef(null);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [settings, status] = await Promise.all([
        apiGet("/api/bot/settings"),
        apiGet("/api/bot/status"),
      ]);

      setBot((prev) => ({
        ...prev,
        ...(settings?.ok ? settings.bot : null),
        ...(status?.ok ? status.bot : null),
      }));
    } finally {
      inFlightRef.current = false;
    }
  }, []);

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

    // Open popup immediately, show spinner while working.
    setRunOnceSuccessOpen(true);
    setRunOnceLoading(true);
    setRunOnceHasEmail(null);
    setRunOnceChangesCount(null);
    setRunOnceBusy(true);

    const minSpinnerMs = 650;
    const startedAt = Date.now();

    try {
      const r = await apiPost("/api/bot/run?mode=once");
      if (!r?.ok) {
        setRunOnceSuccessOpen(false);
        setRunOnceLoading(false);
        setRunOnceHasEmail(null);
        setRunOnceChangesCount(null);
        return alert(r?.msg || "Failed");
      }

      const c = Number(r?.changesCount);
      setRunOnceChangesCount(Number.isFinite(c) ? c : 0);

      try {
        const settings = await apiGet("/api/bot/settings");
        const hasEmail = !!(settings?.ok && settings?.bot?.hasEmail);
        setRunOnceHasEmail(hasEmail);
      } catch {
        // If we can't verify, treat as not configured to avoid misleading message.
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
    const r = await apiPost("/api/bot/run?mode=start");
    if (!r?.ok) return alert(r?.msg || "Failed");
    await refresh();
  };

  const stop = async () => {
    const r = await apiPost("/api/bot/run?mode=stop");
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
                There are no updates. Change filters for new data.
              </div>
            ) : runOnceHasEmail ? (
              <div style={{ marginBottom: 12 }}>
                Run once was made successfully. Check your email.
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                Updates were found, but your email is not configured. Please set
                your email in Manage account.
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
    </div>
  );
}
