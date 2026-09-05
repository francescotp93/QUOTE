#!/usr/bin/env bash
# Qualcuno ha aperto l'analisi previdenziale mentre i bottoni erano invisibili?
# Il registro esiste solo dalle 15:36 del 4/9: copre le ultime 2h45 della finestra.
set -u
echo "=== chiamate all'analisi previdenziale dal 4/9 (tutto quello che il registro ha) ==="
journalctl -u withus-backend --since "2026-09-04 00:00" --no-pager \
  | grep -E '(parametri-previdenziali|analisi-previdenziali)' || echo "nessuna"
echo
echo "=== quante richieste con un utente riconosciuto, per ora ==="
journalctl -u withus-backend --since "2026-09-04 00:00" --no-pager \
  | grep -E ' (GET|POST|PUT|DELETE) +/' | grep -v 'u:-' \
  | sed -E 's/.*node\[[0-9]+\]: ([0-9-]+)T([0-9]{2}):.*/\1 ore \2/' | sort | uniq -c || echo "nessuna"
echo
echo "=== da quando il registro scrive ==="
journalctl -u withus-backend --since "2026-09-04 00:00" --no-pager \
  | grep -E ' (GET|POST|PUT|DELETE|OPTIONS) +/' | head -1
