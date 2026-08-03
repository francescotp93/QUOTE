#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# ── ISTANZA SINGOLA (flock) — un solo processo sul profilo userdata ─────────────
exec 9>/tmp/axa-scraper.lock
if ! flock -n 9; then
  echo "[axa] un'altra istanza è già attiva (lock occupato) → esco"
  exit 0
fi
# Ripulisco eventuali chromium orfani SOLO sul profilo AXA (non tocca gli altri scraper).
pkill -9 -f "scraper/axa/userdata" 2>/dev/null || true
rm -f userdata/Singleton* 2>/dev/null || true
sleep 1
# Display dedicato :93 e VNC su 5906 (Prima :94/5905 — Groupama :95/5904 — HDI :96/5903 — Allianz :98/5901 — 24H :99/5900): convivono.
export DISPLAY=:93
VNC_PASS="${VNC_PASS:-axa2026}"
pgrep -f "Xvfb :93" >/dev/null || { Xvfb :93 -screen 0 1440x900x24 >/tmp/xvfb-axa.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:93" >/dev/null || { DISPLAY=:93 fluxbox >/tmp/fluxbox-axa.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5906" >/dev/null || x11vnc -display :93 -rfbport 5906 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-axa.log 2>&1
echo "🔑 VNC AXA su 127.0.0.1:5906 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login se serve"
node quote-service.mjs
