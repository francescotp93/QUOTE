#!/usr/bin/env bash
# Verifica finale: con le correzioni in linea, il quadro e' stabile e assieasy
# non va piu' muta. Due letture a un minuto. Solo diagnosi.
set -u
cd /opt/withus-backend || exit 1
echo "commit sulla macchina: $(git log -1 --format='%h %s' | cut -c1-60)"
if [ ! -f scraper/comune/entroTempo.mjs ]; then
  echo "le correzioni non sono ancora arrivate qui: l'autopull passa ogni minuto"
  exit 0
fi
echo "scraper riavviati di recente:"
for s in assieasy axa groupama kube prima; do
  printf '  %-10s %s\n' "$s" "$(systemctl show -p ActiveEnterTimestamp --value ${s}-scraper 2>/dev/null | cut -c1-30)"
done
echo
echo "════════ PRIMA LETTURA ════════"
node server/verifica/fonti-vive.mjs; echo "uscita: $?"
sleep 60
echo
echo "════════ SECONDA LETTURA ════════"
node server/verifica/fonti-vive.mjs; echo "uscita: $?"
