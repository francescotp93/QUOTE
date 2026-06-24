#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# Display dedicato :97 e VNC su 5902 (Allianz :98/5901 — 24H :99/5900): convivono.
export DISPLAY=:97
VNC_PASS="${VNC_PASS:-italiana2026}"
pgrep -f "Xvfb :97" >/dev/null || { Xvfb :97 -screen 0 1440x900x24 >/tmp/xvfb-italiana.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:97" >/dev/null || { DISPLAY=:97 fluxbox >/tmp/fluxbox-italiana.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5902" >/dev/null || x11vnc -display :97 -rfbport 5902 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-italiana.log 2>&1
echo "🔑 VNC Italiana su 127.0.0.1:5902 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login"
node quote-service.mjs
