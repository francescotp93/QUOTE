#!/usr/bin/env bash
# HDI end-to-end: stato -> (se non dentro) avvio accesso -> seguo fino a esito.
set -u
P=4400
red(){ sed -E 's/("(token|cookie|password|otp|code|codice|secret|authorization)"[: ]*)"[^"]*"/\1"***"/gI'; }
js(){ grep -oE "\"$1\":(\"[^\"]*\"|[a-z]+|[0-9]+)" | head -1 | sed -E 's/^"[^"]*"://; s/^"//; s/"$//'; }
echo "== stato iniziale =="
LS=$(curl -s -m 12 "http://127.0.0.1:$P/loginstate" 2>/dev/null | red); echo "$LS"
FR=$(curl -s -m 12 "http://127.0.0.1:$P/status" 2>/dev/null | grep -oE '"freno":\{[^}]*\}' | red); echo "freno: $FR"
STEP=$(echo "$LS" | js step)
echo "step: ${STEP:-?}"
if [ "$STEP" != "loggato" ]; then
  echo "== avvio accesso (POST /accedi) =="
  curl -s -m 25 -X POST "http://127.0.0.1:$P/accedi" 2>/dev/null | red | head -c 250; echo
  for i in $(seq 1 20); do
    sleep 5
    S=$(curl -s -m 12 "http://127.0.0.1:$P/loginstate" 2>/dev/null | red)
    ST=$(echo "$S" | js step); MSG=$(echo "$S" | js msg)
    echo "[$((i*5))s] ${ST:-?} — ${MSG:-}"
    case "$ST" in loggato|attesa_otp|attesa_codice|errore|non_loggato|senza_credenziali|timeout_otp|totp_rifiutato) break;; esac
  done
fi
echo "== stato finale =="
curl -s -m 12 "http://127.0.0.1:$P/status" 2>/dev/null | grep -oE '"(loggato|step|url)"[: ]*("[^"]*"|[a-z]+)' | red | head
echo "(fine)"
