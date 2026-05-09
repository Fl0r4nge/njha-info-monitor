#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"

Xvfb "${DISPLAY}" -screen 0 1440x1000x24 -ac +extension GLX +render -noreset &
fluxbox >/tmp/fluxbox.log 2>&1 &
x11vnc -display "${DISPLAY}" -forever -shared -nopw -rfbport 5900 >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc/ 6080 localhost:5900 >/tmp/novnc.log 2>&1 &

echo "Open http://SERVER_IP:6080/vnc.html to complete login."
node src/login.js
