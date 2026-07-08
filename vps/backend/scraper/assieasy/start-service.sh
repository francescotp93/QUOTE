#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# ── ISTANZA SINGOLA (flock) — un solo processo sul profilo userdata ─────────────
exec 9>/tmp/assieasy-scraper.lock
if ! flock -n 9; then
  echo "[assieasy] un'altra istanza è già attiva (lock occupato) → esco"
  exit 0
fi
# Ripulisco eventuali chromium orfani SOLO sul profilo Assieasy (non tocca gli altri scraper).
pkill -9 -f "scraper/assieasy/userdata" 2>/dev/null || true
rm -f userdata/Singleton* 2>/dev/null || true
sleep 1
# Display dedicato :92 e VNC su 5907 (AXA :93/5906 — Prima :94/5905 — Groupama :95/5904 — HDI :96/5903): convivono.
export DISPLAY=:92
VNC_PASS="${VNC_PASS:-assieasy2026}"
pgrep -f "Xvfb :92" >/dev/null || { Xvfb :92 -screen 0 1440x900x24 >/tmp/xvfb-assieasy.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:92" >/dev/null || { DISPLAY=:92 fluxbox >/tmp/fluxbox-assieasy.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5907" >/dev/null || x11vnc -display :92 -rfbport 5907 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-assieasy.log 2>&1
echo "🔑 VNC Assieasy su 127.0.0.1:5907 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login se serve"
node quote-service.mjs
