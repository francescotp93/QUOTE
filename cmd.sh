#!/usr/bin/env bash
# PERCHE' ALLIANZ NON ENTRA, pur avendo credenziali E segreto 2FA.
# Prima leggo lo stato del FRENO (se e' bloccato, non provo nemmeno).
# Poi UNA sola prova di login e leggo il passo/errore. Nessun valore segreto.
set -u
B=http://127.0.0.1:4200
echo "== stato attuale (loginstate) =="
curl -s -m 10 "$B/loginstate" 2>/dev/null | sed -E 's/("(token|cookie|password)"[: ]*)"[^"]*"/\1"***"/g' | head -c 600; echo
echo
echo "== il freno e' scattato? =="
curl -s -m 10 "$B/status" 2>/dev/null | grep -oE '"(freno|bloccato|blocked|tentativi|cooldown)"[: ]*[^,}]+' | head
echo
echo "== UNA prova di login (max 90s) — leggo solo passo/esito, niente segreti =="
curl -s -m 95 "$B/login" 2>/dev/null | sed -E 's/("(token|cookie|password|otp|code)"[: ]*)"[^"]*"/\1"***"/g' | head -c 900; echo
echo "(fine)"
