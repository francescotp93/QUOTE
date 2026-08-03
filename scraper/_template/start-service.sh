#!/usr/bin/env bash
# TEMPLATE avvio scraper portale proprio (SCAFFOLD). Copia in scraper/<nome>/start-service.sh.
set -e
cd "$(dirname "$0")"
# TODO[ADAPTER] scegli display/VNC liberi: :96/5903, poi :95/5904 … (vedi tabella nel doc)
export DISPLAY=:96
VNC_PASS="${VNC_PASS:-compagniax2026}"
pgrep -f "Xvfb :96" >/dev/null || { Xvfb :96 -screen 0 1440x900x24 >/tmp/xvfb-compagniax.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:96" >/dev/null || { DISPLAY=:96 fluxbox >/tmp/fluxbox-compagniax.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5903" >/dev/null || x11vnc -display :96 -rfbport 5903 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-compagniax.log 2>&1
echo "VNC su 127.0.0.1:5903 (password: $VNC_PASS) — tunnel SSH per il primo login"
node quote-service.mjs
