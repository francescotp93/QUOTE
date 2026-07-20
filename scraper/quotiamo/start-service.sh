#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# ── ISTANZA SINGOLA (flock) — un solo processo sul profilo userdata ─────────────
exec 9>/tmp/quotiamo-scraper.lock
if ! flock -n 9; then
  echo "[quotiamo] un'altra istanza è già attiva (lock occupato) → esco"
  exit 0
fi
pkill -9 -f "scraper/quotiamo/userdata" 2>/dev/null || true
rm -f userdata/Singleton* 2>/dev/null || true
sleep 1
# Display :90 e VNC 5909 (liberi: kube :91/5908, assieasy :92/5907, AXA :93/5906, Prima :94/5905,
# Groupama :95/5904, HDI :96/5903, italiana :97/5902, allianz :98/5901, 24h :99/5900).
export DISPLAY=:90
export PORT="${PORT:-5000}"
export FONTE_ID="${FONTE_ID:-c-quotiamo}"
VNC_PASS="${VNC_PASS:-quotiamo2026}"
pgrep -f "Xvfb :90" >/dev/null || { Xvfb :90 -screen 0 1440x900x24 >/tmp/xvfb-quotiamo.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:90" >/dev/null || { DISPLAY=:90 fluxbox >/tmp/fluxbox-quotiamo.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5909" >/dev/null || x11vnc -display :90 -rfbport 5909 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-quotiamo.log 2>&1
echo "🔑 VNC Quotiamo su 127.0.0.1:5909 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login se serve"
node quote-service.mjs
