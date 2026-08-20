#!/usr/bin/env bash
# ---------------------------------------------------------------------
# Login interattivo con OTP su un VPS SENZA interfaccia grafica.
#
# IL PROBLEMA: il device trust di 30 giorni nasce dal browser che fa il
# login. Se fai il login sul tuo PC e copi il profilo sul server, Auth0
# vede un contesto diverso e puo' richiedere di nuovo l'OTP.
# Quindi il login va fatto DIRETTAMENTE SUL SERVER, una volta al mese.
#
# COME: avviamo un display virtuale (Xvfb) e ci attacchiamo un server VNC
# in ascolto SOLO su localhost. Tu ti colleghi con un tunnel SSH e digiti
# l'OTP come se fossi davanti al server.
#
# USO:
#   1) sul server:   ./scripts/login-vnc.sh
#   2) sul tuo PC:   ssh -L 5900:localhost:5900 utente@tuo-server
#   3) sul tuo PC:   apri un client VNC su  localhost:5900
#   4) digita l'OTP nella finestra del browser; la casella
#      "Ricorda questo dispositivo per 30 giorni" e' gia' spuntata
# ---------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

DISPLAY_NUM="${DISPLAY_NUM:-99}"
VNC_PORT="${VNC_PORT:-5900}"
GEOMETRY="${GEOMETRY:-1400x900x24}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "MANCA: $1"; MISSING=1; }; }
MISSING=0
need Xvfb; need x11vnc
if [ "$MISSING" = "1" ]; then
  echo
  echo "Installa le dipendenze:"
  echo "  sudo apt-get update && sudo apt-get install -y xvfb x11vnc"
  exit 1
fi

cleanup() {
  echo "Chiudo display virtuale e VNC…"
  [ -n "${VNC_PID:-}"  ] && kill "$VNC_PID"  2>/dev/null || true
  [ -n "${XVFB_PID:-}" ] && kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Avvio display virtuale :$DISPLAY_NUM ($GEOMETRY)…"
Xvfb ":$DISPLAY_NUM" -screen 0 "$GEOMETRY" >/dev/null 2>&1 &
XVFB_PID=$!
sleep 2

# -localhost: il VNC NON e' raggiungibile da internet, solo via tunnel SSH.
# Senza questo flag esporresti una sessione browser autenticata al mondo.
echo "Avvio VNC su 127.0.0.1:$VNC_PORT (solo locale)…"
x11vnc -display ":$DISPLAY_NUM" -localhost -nopw -quiet -forever -rfbport "$VNC_PORT" >/dev/null 2>&1 &
VNC_PID=$!
sleep 2

cat <<MSG

────────────────────────────────────────────────────────────────
  Ora, DAL TUO PC:

    ssh -L $VNC_PORT:localhost:$VNC_PORT $(whoami)@$(hostname -I 2>/dev/null | awk '{print $1}')

  poi apri un client VNC su:   localhost:$VNC_PORT

  Nella finestra vedrai il login Prima. Inserisci il codice OTP.
  Hai 5 minuti. La casella "Ricorda questo dispositivo" e' gia' spuntata.
────────────────────────────────────────────────────────────────

MSG

DISPLAY=":$DISPLAY_NUM" PRIMA_HEADLESS=0 node src/auth.js

echo
echo "Login completato. Sessione salvata."
node scripts/../src/session-check.js || true
