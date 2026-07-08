#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
export DISPLAY=:99
VNC_PASS="${VNC_PASS:-moto2026}"

pkill -f "Xvfb :99" 2>/dev/null || true
pkill -f "x11vnc"   2>/dev/null || true
pkill -f "fluxbox"  2>/dev/null || true
sleep 1

Xvfb :99 -screen 0 1440x900x24 >/tmp/xvfb.log 2>&1 &
sleep 2
fluxbox >/tmp/fluxbox.log 2>&1 &
sleep 1
x11vnc -display :99 -rfbport 5900 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc.log 2>&1
echo "🔑 VNC attivo su 127.0.0.1:5900  (password: $VNC_PASS)"
echo "→ Apri il tunnel SSH dal Mac e collegati con Screen Sharing."
echo "→ Avvio il browser sul login..."
node login-vnc.mjs
