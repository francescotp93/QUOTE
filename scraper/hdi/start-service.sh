#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# ── ISTANZA SINGOLA (flock) ───────────────────────────────────────────────────
# Più processi NON possono usare lo stesso profilo userdata: il secondo contesto
# Chromium viene chiuso subito → errori "Target page, context or browser has been
# closed" su /premio. In passato corse di systemd (Restart + restart sovrapposti)
# lasciavano 2-3 istanze vive sullo stesso profilo. Un lock esclusivo garantisce
# che giri UNA sola istanza: se il lock è già preso, esco pulito (no restart loop).
exec 9>/tmp/hdi-scraper.lock
if ! flock -n 9; then
  echo "[hdi] un'altra istanza è già attiva (lock occupato) → esco"
  exit 0
fi
# Siamo i soli titolari del lock (quindi UNICA istanza italiana): ripulisco solo eventuali
# chromium orfani rimasti sul PROFILO ITALIANA da un SIGKILL precedente. NB: il filtro è
# specifico per "hdi/userdata" → NON tocca gli altri scraper (moto/allianz), che hanno
# anch'essi un file chiamato quote-service.mjs su profili diversi.
pkill -9 -f "scraper/hdi/userdata" 2>/dev/null || true
rm -f userdata/Singleton* 2>/dev/null || true
sleep 1
# Display dedicato :96 e VNC su 5903 (Allianz :98/5901 — 24H :99/5900): convivono.
export DISPLAY=:96
VNC_PASS="${VNC_PASS:-hdi2026}"
pgrep -f "Xvfb :96" >/dev/null || { Xvfb :96 -screen 0 1440x900x24 >/tmp/xvfb-hdi.log 2>&1 & sleep 2; }
pgrep -f "fluxbox.*:96" >/dev/null || { DISPLAY=:96 fluxbox >/tmp/fluxbox-hdi.log 2>&1 & sleep 1; }
pgrep -f "x11vnc.*5903" >/dev/null || x11vnc -display :96 -rfbport 5903 -localhost -passwd "$VNC_PASS" -forever -shared -bg -quiet >/tmp/x11vnc-hdi.log 2>&1
echo "🔑 VNC HDI su 127.0.0.1:5903 (password: $VNC_PASS) — tunnel SSH dal Mac per il primo login"
node quote-service.mjs
