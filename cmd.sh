#!/usr/bin/env bash
# HDI e AXA: DOVE si fermano. Per ciascuno: stato -> una prova di login -> stato.
# Redigo token/cookie/password/codici: nel log non finisce nessun segreto.
set -u
red() { sed -E 's/("(token|cookie|password|otp|code|codice|secret|authorization)"[: ]*)"[^"]*"/\1"***"/gI'; }
prova_portale() {
  nome="$1"; porta="$2"
  echo "=================== $nome (porta $porta) ==================="
  echo "-- stato PRIMA --"
  curl -s -m 12 "http://127.0.0.1:$porta/loginstate" 2>/dev/null | red | head -c 500; echo
  echo "-- freno --"
  curl -s -m 12 "http://127.0.0.1:$porta/status" 2>/dev/null | grep -oE '"(freno|bloccato|tentativi|motivo)"[: ]*[^,}]+' | head
  echo "-- UNA prova di login (max 110s) --"
  curl -s -m 115 "http://127.0.0.1:$porta/login" 2>/dev/null | red | head -c 900; echo
  echo "-- stato DOPO --"
  curl -s -m 12 "http://127.0.0.1:$porta/loginstate" 2>/dev/null | red | head -c 500; echo
  echo
}
prova_portale HDI 4400
prova_portale AXA 4700
echo "(fine)"
