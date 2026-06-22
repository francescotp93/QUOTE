#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
export DISPLAY=:99
VNC_PASS="${VNC_PASS:-moto2026}"
pgrep -f "Xvfb :99" >/dev/null || { Xvfb :99 -screen 0 1440x900x24 >/tmp/xvfb.log 2>&1 & sleep 2; }
pgrep -f "fluxbox"  >/dev/null || { fluxbox >/tmp/fluxbox.log 2>&1 & sleep 1; }
pgrep -f "x11vnc"   >/dev/null || x11vnc -display :99 -rfbport 5900 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc.log 2>&1
echo "🔑 VNC su 127.0.0.1:5900 (password: $VNC_PASS) — tunnel SSH dal Mac se devi fare login"
node quote-service.mjs
