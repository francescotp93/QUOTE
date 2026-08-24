#!/usr/bin/env bash
# Il login HDI (avviato prima) e' non-bloccante: ricontrollo SOLO lo stato,
# senza rilanciarlo. E rileggo AXA per conferma. Sola lettura, segreti redatti.
set -u
red() { sed -E 's/("(token|cookie|password|otp|code|codice|secret|authorization)"[: ]*)"[^"]*"/\1"***"/gI'; }
echo "== HDI /loginstate (dove e' finito) =="
curl -s -m 12 "http://127.0.0.1:4400/loginstate" 2>/dev/null | red | head -c 600; echo
echo "== HDI /status (dentro?) =="
curl -s -m 12 "http://127.0.0.1:4400/status" 2>/dev/null | grep -oE '"(loggato|step|url)"[: ]*("[^"]*"|[a-z]+)' | red | head
echo
echo "== AXA /loginstate (conferma password) =="
curl -s -m 12 "http://127.0.0.1:4700/loginstate" 2>/dev/null | red | head -c 500; echo
echo "(fine)"
