#!/usr/bin/env bash
# READ-ONLY: diagnostica perche' il login kube fallisce. Nessun nuovo submit.
set -u
B=http://127.0.0.1:4900
echo "== /status =="
curl -s --max-time 8 $B/status; echo
echo
echo "== /logindump (schermo attuale: url/title/text/controlli) =="
curl -s --max-time 20 $B/logindump; echo
echo
echo "== /probe q=errat (banner errore?) =="
curl -s --max-time 15 "$B/probe?q=errat"; echo
echo
echo "== /probe q=password (campo pwd ancora presente?) =="
curl -s --max-time 15 "$B/probe?q=password"; echo
echo
echo "== /probe q=connetti (bottone submit) =="
curl -s --max-time 15 "$B/probe?q=connetti"; echo
echo FINE.
