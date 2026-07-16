#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# Quotiamo — comparatore. Display :96 e VNC 5903 dedicati (non collidono con gli altri).
export DISPLAY=:96
export PORTAL_ID=quotiamo
export PORT=4400
export FONTE_ID="${FONTE_ID:-c-quotiamo}"
export FONTE_MATCH='quotiam'
# Il link di accesso reale arriva dal Pannello Fonti (campo url della fonte).
export DEFAULT_LOGIN="${DEFAULT_LOGIN:-}"
VNC_PASS="${VNC_PASS:-quotiamo2026}"
pgrep -f "Xvfb :96" >/dev/null || { Xvfb :96 -screen 0 1440x900x24 >/tmp/xvfb-quotiamo.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:96" >/dev/null || { DISPLAY=:96 fluxbox >/tmp/fluxbox-quotiamo.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5903" >/dev/null || x11vnc -display :96 -rfbport 5903 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-quotiamo.log 2>&1
echo "🔑 VNC Quotiamo su 127.0.0.1:5903 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login"
node quote-service.mjs
