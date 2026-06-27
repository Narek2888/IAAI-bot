#!/bin/bash
ulimit -u unlimited

CHROMIUM_BIN=$(which chromium 2>/dev/null || which chromium-browser 2>/dev/null || "")
if [ -n "$CHROMIUM_BIN" ]; then
  export PUPPETEER_EXECUTABLE_PATH="$CHROMIUM_BIN"
  echo "[start] Using chromium at: $CHROMIUM_BIN"
else
  echo "[start] WARNING: chromium not found in PATH"
fi

exec node backend/index.js
