#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# ── ISTANZA SINGOLA (flock) — un solo processo sul profilo userdata ─────────────
exec 9>/tmp/prima-scraper.lock
if ! flock -n 9; then
  echo "[prima] un'altra istanza è già attiva (lock occupato) → esco"
  exit 0
fi
# Ripulisco eventuali chromium orfani SOLO sul profilo Prima (non tocca gli altri scraper).
pkill -9 -f "scraper/prima/userdata" 2>/dev/null || true
rm -f userdata/Singleton* 2>/dev/null || true
sleep 1
# Display dedicato :94 e VNC su 5905 (Groupama :95/5904 — HDI :96/5903 — Allianz :98/5901 — 24H :99/5900): convivono.
export DISPLAY=:94
VNC_PASS="${VNC_PASS:-prima2026}"
pgrep -f "Xvfb :94" >/dev/null || { Xvfb :94 -screen 0 1440x900x24 >/tmp/xvfb-prima.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:94" >/dev/null || { DISPLAY=:94 fluxbox >/tmp/fluxbox-prima.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5905" >/dev/null || x11vnc -display :94 -rfbport 5905 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-prima.log 2>&1
echo "🔑 VNC Prima su 127.0.0.1:5905 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login se serve"
node quote-service.mjs
