#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# ── ISTANZA SINGOLA (flock) ──
exec 9>/tmp/kube-scraper.lock
if ! flock -n 9; then
  echo "[kube] un'altra istanza è già attiva (lock occupato) → esco"
  exit 0
fi
pkill -9 -f "scraper/kube/userdata" 2>/dev/null || true
rm -f userdata/Singleton* 2>/dev/null || true
sleep 1
# Display dedicato :91 e VNC 5908 (liberi: assieasy :92/5907, AXA :93/5906, Prima :94/5905, Groupama :95/5904, HDI :96/5903, italiana :97).
export DISPLAY=:91
VNC_PASS="${VNC_PASS:-kube2026}"
pgrep -f "Xvfb :91" >/dev/null || { Xvfb :91 -screen 0 1440x900x24 >/tmp/xvfb-kube.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:91" >/dev/null || { DISPLAY=:91 fluxbox >/tmp/fluxbox-kube.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5908" >/dev/null || x11vnc -display :91 -rfbport 5908 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-kube.log 2>&1
echo "🔑 VNC Kube su 127.0.0.1:5908 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login se serve"
node quote-service.mjs
