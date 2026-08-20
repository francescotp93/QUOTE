#!/usr/bin/env bash
# Installa il pacchetto Prima Intermediari sulla macchina. Nessun segreto
# viene stampato e nessuno viene copiato: le chiavi Supabase restano nel .env
# del backend e il pacchetto le legge da li'.
set -u
D=/opt/withus-backend/prima-intermediari
if [ ! -d "$D" ]; then
  echo "il pacchetto non e' ancora arrivato qui: l'autopull passa ogni minuto"
  exit 0
fi
cd "$D" || exit 1
echo "commit sulla macchina: $(git -C /opt/withus-backend log -1 --format='%h %s' | cut -c1-60)"

echo
echo "== dipendenze =="
npm install --omit=dev --silent 2>&1 | tail -3
echo "  node_modules: $([ -d node_modules ] && echo ok || echo MANCA)"

echo
echo "== le sue prove, qui sulla macchina =="
npm test --silent 2>&1 | grep -E "passati|falliti|SCHEMA PRIMA" | tail -4

echo
echo "== il .env: solo le credenziali Prima, il resto viene dal backend =="
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "  creato da .env.example (PRIMA_EMAIL e PRIMA_PASSWORD ancora vuote)"
else
  echo "  c'era gia': non lo tocco"
fi
for k in PRIMA_EMAIL PRIMA_PASSWORD; do
  v=$(grep "^$k=" .env 2>/dev/null | cut -d= -f2-)
  if [ -n "$v" ]; then echo "  $k: valorizzata"; else echo "  $k: DA COMPILARE"; fi
done
echo "  chiavi Supabase lette dal backend: $(grep -c '^SUPABASE_SERVICE_ROLE_KEY=' /opt/withus-backend/server/.env 2>/dev/null) riga trovata"

echo
echo "== lo schema c'e' gia' su Supabase? (lo ha applicato Claude) =="
echo "  tabelle attese: prima_preventivi, prima_scrape_runs"

echo
echo "== la sessione del portale =="
node src/session-check.js 2>&1 | tail -5
echo "  (uscita $? — 2 = mai fatto il login, ed e' atteso: serve una persona una volta sola)"

echo
echo "== stato di Xvfb/x11vnc, che servono al login mensile =="
for p in Xvfb x11vnc; do
  printf '  %-8s %s\n' "$p" "$(command -v $p >/dev/null 2>&1 && echo installato || echo 'DA INSTALLARE (deploy/install-vps.sh)')"
done
