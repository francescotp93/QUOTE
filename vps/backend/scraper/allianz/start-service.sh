#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# Display dedicato :98 e VNC su 5901 (il 24H usa :99 / 5900): i due scraper convivono.
export DISPLAY=:98
VNC_PASS="${VNC_PASS:-allianz2026}"
pgrep -f "Xvfb :98" >/dev/null || { Xvfb :98 -screen 0 1440x900x24 >/tmp/xvfb-allianz.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:98" >/dev/null || { DISPLAY=:98 fluxbox >/tmp/fluxbox-allianz.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5901" >/dev/null || x11vnc -display :98 -rfbport 5901 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-allianz.log 2>&1
echo "🔑 VNC Allianz su 127.0.0.1:5901 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login"
node quote-service.mjs
