#!/usr/bin/env bash
# Il registro delle richieste sta scrivendo davvero?
set -u
echo "=== ultime righe del giornale withus-backend ==="
journalctl -u withus-backend --since "10 min ago" --no-pager | tail -40
echo
echo "=== quante righe di richiesta negli ultimi 10 minuti ==="
journalctl -u withus-backend --since "10 min ago" --no-pager | grep -cE ' (GET|POST|PUT|DELETE|OPTIONS) +/' || true
echo
echo "=== controllo privacy: qualche riga porta una query o una chiocciola? ==="
journalctl -u withus-backend --since "30 min ago" --no-pager | grep -E ' (GET|POST|PUT|DELETE|OPTIONS) +/' | grep -E '\?|@' | head -5 || echo "nessuna, come deve essere"
