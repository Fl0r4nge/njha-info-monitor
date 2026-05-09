#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root: sudo bash scripts/open-vnc-firewall-centos.sh" >&2
  exit 1
fi

if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --add-port=6080/tcp --permanent
  firewall-cmd --reload
  firewall-cmd --list-ports
  echo "Opened TCP 6080 in firewalld. Also check your cloud security group."
else
  echo "firewalld is not running. Check your cloud security group and any custom firewall rules."
fi
