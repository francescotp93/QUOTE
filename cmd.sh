#!/usr/bin/env bash
# La correzione e' arrivata? E salvare le credenziali di HDI adesso funziona?
# Nessun segreto stampato: si guarda solo la risposta del server.
set -u
cd /opt/withus-backend || exit 1
echo "commit sulla macchina: $(git log -1 --format='%h %s' | cut -c1-60)"
if ! grep -q "const custom = (store.__custom" server/fonti.js 2>/dev/null; then
  echo "la correzione non e' ancora qui: l'autopull passa ogni minuto"
  exit 0
fi
echo "  la correzione c'e'"
echo "  backend: $(systemctl is-active withus-backend)"
echo
echo "== la prova nuova, qui sulla macchina =="
node server/fontiCredenzialiCustom.test.mjs 2>&1 | tail -4
