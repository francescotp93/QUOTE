#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# Kube (K-UBE di Koala) — Blazor Server. Display :95 e VNC 5905 dedicati
# (Italiana :97/5902 — Allianz :98/5901 — 24H :99/5900 — Quotiamo :96/5903): convivono.
export DISPLAY=:95
export PORTAL_ID=kube
export PORT=4900
export FONTE_ID="${FONTE_ID:-c-kube}"
export FONTE_MATCH='kube|k-?ube|koala'
# Il link di accesso reale arriva dal Pannello Fonti (campo url della fonte).
export DEFAULT_LOGIN="${DEFAULT_LOGIN:-}"
VNC_PASS="${VNC_PASS:-kube2026}"
pgrep -f "Xvfb :95" >/dev/null || { Xvfb :95 -screen 0 1440x900x24 >/tmp/xvfb-kube.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:95" >/dev/null || { DISPLAY=:95 fluxbox >/tmp/fluxbox-kube.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5905" >/dev/null || x11vnc -display :95 -rfbport 5905 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-kube.log 2>&1
echo "🔑 VNC Kube su 127.0.0.1:5905 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login"
node quote-service.mjs
