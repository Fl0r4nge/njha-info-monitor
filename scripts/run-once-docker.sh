#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gongxin-monitor}"

cd "${APP_DIR}"
docker compose run --rm monitor
