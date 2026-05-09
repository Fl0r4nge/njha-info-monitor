#!/usr/bin/env bash
set -u

APP_DIR="${APP_DIR:-/opt/gongxin-monitor}"

echo "== Gongxin noVNC diagnostics =="
echo "App dir: ${APP_DIR}"
echo

if [ ! -d "${APP_DIR}" ]; then
  echo "ERROR: ${APP_DIR} does not exist."
  exit 1
fi

cd "${APP_DIR}" || exit 1

echo "== Docker version =="
docker --version || true
docker compose version || true
echo

echo "== Login container status =="
docker compose ps login || true
echo

echo "== Login container recent logs =="
docker compose logs --tail=80 login || true
echo

echo "== Host port 6080 listener =="
if command -v ss >/dev/null 2>&1; then
  ss -lntp | grep ':6080' || echo "No host listener found on 6080."
elif command -v netstat >/dev/null 2>&1; then
  netstat -lntp | grep ':6080' || echo "No host listener found on 6080."
else
  echo "Neither ss nor netstat is installed."
fi
echo

echo "== Local noVNC HTTP check =="
if curl -fsSI http://127.0.0.1:6080/vnc.html >/tmp/gongxin-vnc-curl.out 2>/tmp/gongxin-vnc-curl.err; then
  cat /tmp/gongxin-vnc-curl.out
  echo "Local check OK: noVNC is reachable from the server itself."
else
  echo "Local check FAILED."
  cat /tmp/gongxin-vnc-curl.err || true
fi
echo

echo "== firewalld ports =="
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --state || true
  firewall-cmd --list-ports || true
else
  echo "firewall-cmd not installed."
fi
echo

echo "== iptables hint =="
if command -v iptables >/dev/null 2>&1; then
  iptables -S INPUT | grep 6080 || echo "No explicit INPUT rule for 6080 shown by iptables -S INPUT."
else
  echo "iptables not installed."
fi
echo

cat <<'EOF'
== What to do next ==
1. If the login container is not running:
   cd /opt/gongxin-monitor && docker compose up login

2. If local noVNC check fails:
   inspect the login logs above.

3. If local noVNC check is OK but http://SERVER_IP:6080/vnc.html is unreachable:
   open TCP 6080 in the cloud security group and server firewall, or use an SSH tunnel:
   ssh -L 6080:127.0.0.1:6080 root@SERVER_IP
   then open http://127.0.0.1:6080/vnc.html locally.
EOF
