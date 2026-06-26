#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# ── PULIZIA ISTANZE ORFANE ────────────────────────────────────────────────────
# Più processi NON possono usare lo stesso profilo userdata: il secondo contesto
# Chromium viene chiuso subito → errori "Target page, context or browser has been
# closed" su /premio. Prima di avviare, elimino eventuali vecchie istanze di QUESTO
# scraper (node + chromium sul profilo) e i lock orfani del profilo.
SELF=$$
for pid in $(pgrep -f "quote-service.mjs" 2>/dev/null); do [ "$pid" = "$SELF" ] || kill -9 "$pid" 2>/dev/null || true; done
pkill -9 -f "italiana/userdata" 2>/dev/null || true
rm -f userdata/Singleton* 2>/dev/null || true
sleep 1
# Display dedicato :97 e VNC su 5902 (Allianz :98/5901 — 24H :99/5900): convivono.
export DISPLAY=:97
VNC_PASS="${VNC_PASS:-italiana2026}"
pgrep -f "Xvfb :97" >/dev/null || { Xvfb :97 -screen 0 1440x900x24 >/tmp/xvfb-italiana.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:97" >/dev/null || { DISPLAY=:97 fluxbox >/tmp/fluxbox-italiana.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5902" >/dev/null || x11vnc -display :97 -rfbport 5902 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-italiana.log 2>&1
echo "🔑 VNC Italiana su 127.0.0.1:5902 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login"
node quote-service.mjs
