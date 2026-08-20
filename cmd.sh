#!/usr/bin/env bash
# Il programma nuovo, lanciato dove le compagnie sono vere. Solo diagnosi:
# nessun accesso avviato, nessun tentativo consumato.
set -u
cd /opt/withus-backend || exit 1
echo "commit sulla macchina: $(git log -1 --format='%h %s' | cut -c1-70)"
echo
if [ ! -f server/verifica/fonti-vive.mjs ]; then
  echo "il programma non e' ancora arrivato qui: l'autopull passa ogni minuto"
  exit 0
fi
node server/verifica/fonti-vive.mjs
echo
echo "uscita: $?"
