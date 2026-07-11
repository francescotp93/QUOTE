#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# ── ISTANZA SINGOLA (flock) — un solo processo sul profilo userdata ─────────────
exec 9>/tmp/groupama-scraper.lock
if ! flock -n 9; then
  echo "[groupama] un'altra istanza è già attiva (lock occupato) → esco"
  exit 0
fi
# Ripulisco eventuali chromium orfani SOLO sul profilo Groupama (non tocca gli altri scraper).
pkill -9 -f "scraper/groupama/userdata" 2>/dev/null || true
rm -f userdata/Singleton* 2>/dev/null || true
sleep 1
# Display dedicato :95 e VNC su 5904 (HDI :96/5903 — Allianz :98/5901 — 24H :99/5900): convivono.
export DISPLAY=:95
VNC_PASS="${VNC_PASS:-groupama2026}"
pgrep -f "Xvfb :95" >/dev/null || { Xvfb :95 -screen 0 1440x900x24 >/tmp/xvfb-groupama.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:95" >/dev/null || { DISPLAY=:95 fluxbox >/tmp/fluxbox-groupama.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5904" >/dev/null || x11vnc -display :95 -rfbport 5904 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-groupama.log 2>&1
echo "🔑 VNC Groupama su 127.0.0.1:5904 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login se serve"
node quote-service.mjs
