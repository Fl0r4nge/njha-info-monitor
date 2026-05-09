#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gongxin-monitor}"
APP_USER="${APP_USER:-gongxin-monitor}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install Node.js first, then rerun this script." >&2
  exit 1
fi

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --shell /sbin/nologin "${APP_USER}"
fi

mkdir -p "${APP_DIR}/data"
cp -R package.json src config.example.json deploy "${APP_DIR}/"

if [ ! -f "${APP_DIR}/config.json" ]; then
  cp "${APP_DIR}/config.example.json" "${APP_DIR}/config.json"
fi

if [ ! -f "${APP_DIR}/.env" ]; then
  cp .env.example "${APP_DIR}/.env"
fi

cd "${APP_DIR}"
npm install --omit=dev
npx playwright install chromium

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
cp "${APP_DIR}/deploy/gongxin-monitor.service" /etc/systemd/system/gongxin-monitor.service
cp "${APP_DIR}/deploy/gongxin-monitor.timer" /etc/systemd/system/gongxin-monitor.timer

systemctl daemon-reload
echo "Installed. Edit ${APP_DIR}/config.json and ${APP_DIR}/.env, then run manual login before enabling the timer."
