import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../src/api";

export default function Bot() {
  const [bot, setBot] = useState({ running: false, lastOutput: null });

  const inFlightRef = useRef(false);
  const loopIdRef = useRef(0); // increments to cancel previous loops
  const timeoutRef = useRef(null);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const r = await apiGet("/api/bot/status");
      if (r?.ok) setBot(r.bot || { running: false, lastOutput: null });
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
    const r = await apiPost("/api/bot/run?mode=once");
    if (!r?.ok) return alert(r?.msg || "Failed");
    await refresh();
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
      <h3>Bot</h3>
      <div>Running: {String(bot.running)}</div>

      <button onClick={runOnce}>Run once</button>
      <button onClick={start} disabled={bot.running}>
        Start continuous
      </button>
      <button onClick={stop} disabled={!bot.running}>
        Stop
      </button>
    </div>
  );
}
