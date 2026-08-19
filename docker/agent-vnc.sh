#!/usr/bin/env bash
set -euo pipefail

if [ -z "${VNC_PASSWORD:-}" ]; then
  echo "VNC_PASSWORD is required for the agent service" >&2
  exit 1
fi

export DISPLAY="${DISPLAY:-:99}"

Xvfb "${DISPLAY}" -screen 0 1440x1000x24 -ac +extension GLX +render -noreset &
fluxbox >/tmp/fluxbox.log 2>&1 &
x11vnc -display "${DISPLAY}" -forever -shared -passwd "${VNC_PASSWORD}" -rfbport 5900 >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc/ 0.0.0.0:6080 localhost:5900 >/tmp/novnc.log 2>&1 &

echo "Agent ready. Open the configured PLATFORM_AGENT_VNC_URL when verification is required."
exec node src/agent.js --watch
