#!/usr/bin/env bash
# Sonda HDI: dove e' finito il login, e' dentro?, il freno e' scattato?
# Sola lettura, segreti redatti.
set -u
red() { sed -E 's/("(token|cookie|password|otp|code|codice|secret|authorization)"[: ]*)"[^"]*"/\1"***"/gI'; }
P=4400
echo "== HDI /loginstate =="
curl -s -m 12 "http://127.0.0.1:$P/loginstate" 2>/dev/null | red | head -c 800; echo
echo "== HDI /status (dentro?) =="
curl -s -m 12 "http://127.0.0.1:$P/status" 2>/dev/null | grep -oE '"(loggato|step|url|running)"[: ]*("[^"]*"|[a-z]+|[0-9]+)' | red | head
echo "== HDI freno =="
curl -s -m 12 "http://127.0.0.1:$P/status" 2>/dev/null | grep -oE '"freno":\{[^}]*\}' | red | head -c 300; echo
echo "(fine)"
