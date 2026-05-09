#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gongxin-monitor}"
INTERVAL_MINUTES="${INTERVAL_MINUTES:-10}"
IMAGE_NAME="${IMAGE_NAME:-gongxin-monitor:latest}"
CRON_MARKER="# gongxin-monitor"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root: sudo bash scripts/quick-deploy-centos.sh" >&2
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y yum-utils rsync
    if ! command -v docker >/dev/null 2>&1; then
      dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    fi
    dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    yum install -y yum-utils rsync
    if ! command -v docker >/dev/null 2>&1; then
      yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    fi
    yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi

  systemctl enable --now docker
}

copy_project() {
  mkdir -p "${APP_DIR}/data"
  rsync -a --delete \
    --exclude ".git" \
    --exclude "node_modules" \
    --exclude "data" \
    --exclude ".env" \
    "${SOURCE_DIR}/" "${APP_DIR}/"

  if [ ! -f "${APP_DIR}/config.json" ]; then
    cp "${APP_DIR}/config.example.json" "${APP_DIR}/config.json"
  fi

  if [ ! -f "${APP_DIR}/.env" ]; then
    if [ -n "${FEISHU_WEBHOOK_URL:-}" ]; then
      cat > "${APP_DIR}/.env" <<EOF
GONGXIN_CONFIG=/app/config.json
FEISHU_WEBHOOK_URL=${FEISHU_WEBHOOK_URL}
EOF
    else
      cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
    fi
  fi
}

build_image() {
  docker compose -f "${APP_DIR}/docker-compose.yml" build
}

install_cron() {
  local cron_line
  cron_line="*/${INTERVAL_MINUTES} * * * * cd ${APP_DIR} && docker compose run --rm monitor >> ${APP_DIR}/monitor.log 2>&1 ${CRON_MARKER}"

  (crontab -l 2>/dev/null | grep -v "${CRON_MARKER}" || true; echo "${cron_line}") | crontab -
}

install_docker
copy_project
build_image
install_cron

cat <<EOF
Done.

App directory: ${APP_DIR}
Cron interval: every ${INTERVAL_MINUTES} minutes

Next steps:
1. Edit ${APP_DIR}/.env if the Feishu webhook is not set.
2. Put a valid login state at ${APP_DIR}/data/storage_state.json.
   Or generate it on this server:
   cd ${APP_DIR} && docker compose up login
   Then open http://SERVER_IP:6080/vnc.html and complete login.
3. Test once:
   cd ${APP_DIR} && docker compose run --rm monitor
4. Watch logs:
   tail -f ${APP_DIR}/monitor.log
EOF
