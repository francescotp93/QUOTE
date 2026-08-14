#!/usr/bin/env bash
# Ricifratura fonti — SOLA LETTURA. Nessun --scrivi: guarda e riferisce.
set -u
cd /opt/withus-backend || exit 1

echo "== aspetto lo strumento (max 150s) =="
for i in $(seq 1 30); do
  [ -f server/fontiRicifra.mjs ] && { echo "arrivato dopo ~$((i*5))s"; break; }
  sleep 5
done
[ -f server/fontiRicifra.mjs ] || { echo "non ancora arrivato"; exit 0; }
echo "commit: $(git log -1 --pretty='%h %s')"

echo
echo "== prima le prove, qui sulla macchina =="
node server/fontiRicifra.test.mjs 2>&1 | tail -22

echo
echo "== e ora il giro a vuoto sull'archivio vero (NESSUNA SCRITTURA) =="
node server/fontiRicifra.mjs
echo "esito: $?"

echo
echo "== controprova: il file e' rimasto identico? =="
echo "impronta archivio: $(sha256sum server/fonti.store.json | cut -c1-32)"
echo "copie di sicurezza presenti: $(ls server/fonti.store.json.prima-di-* 2>/dev/null | wc -l)  (deve essere 0)"
