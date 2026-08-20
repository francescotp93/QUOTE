#!/usr/bin/env bash
# Il metro corretto, due volte a distanza di un minuto: se le due letture
# dicono la stessa cosa, il metro e' stabile. Solo diagnosi.
set -u
cd /opt/withus-backend || exit 1
echo "commit sulla macchina: $(git log -1 --format='%h %s' | cut -c1-60)"
if ! grep -q "non_interrogabile" server/verifica/fonti-vive.mjs 2>/dev/null; then
  echo "il metro corretto non e' ancora arrivato qui: l'autopull passa ogni minuto"
  exit 0
fi
echo
echo "════════════ PRIMA LETTURA ════════════"
node server/verifica/fonti-vive.mjs; echo "uscita: $?"
sleep 60
echo
echo "════════════ SECONDA LETTURA, un minuto dopo ════════════"
node server/verifica/fonti-vive.mjs; echo "uscita: $?"
