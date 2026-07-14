#!/usr/bin/env bash
# Allinea FONTI_SECRET del backend a quella degli scraper. Il segreto NON viene mai stampato.
set -u
ENVF=/opt/withus-backend/server/.env
SCR=/opt/withus-backend/scraper/diagnosi-fonti.mjs
TS=$(date +%Y%m%d-%H%M%S)

echo "== 1) Backup .env =="
cp -a "$ENVF" "$ENVF.bak-$TS" && echo "backup -> $ENVF.bak-$TS"

echo "== 2) Estraggo FONTI_SECRET dallo scraper (mai mostrata) =="
SECRET=$(systemctl show axa-scraper -p Environment --value 2>/dev/null | tr ' ' '\n' | grep '^FONTI_SECRET=' | head -1 | cut -d= -f2-)
if [ -z "$SECRET" ]; then echo "❌ FONTI_SECRET non trovata nell'ambiente axa-scraper. ABORT (nessuna modifica)."; exit 1; fi
echo "lunghezza segreto: ${#SECRET}  md5(fingerprint-check): $(printf %s "$SECRET" | md5sum | cut -c1-8)  (solo controllo, non è il segreto)"

echo "== 3) Scrivo nel .env (idempotente) =="
# rimuovo eventuale riga esistente e aggiungo quella nuova, senza stampare il valore
grep -v '^FONTI_SECRET=' "$ENVF" > "$ENVF.tmp" 2>/dev/null || true
printf 'FONTI_SECRET=%s\n' "$SECRET" >> "$ENVF.tmp"
mv "$ENVF.tmp" "$ENVF"
echo "riga FONTI_SECRET presente nel .env: $(grep -c '^FONTI_SECRET=' "$ENVF")"

echo "== 4) Riavvio backend =="
systemctl restart withus-backend && sleep 4
echo "stato: $(systemctl is-active withus-backend)"

echo "== 5) Verifica: il backend ora decifra? (impronta deve essere 4d1bed7abc80) =="
env $(systemctl show withus-backend -p Environment --value 2>/dev/null) \
  bash -c 'set -a; . /opt/withus-backend/server/.env 2>/dev/null; set +a; node '"$SCR" 2>&1 \
  | grep -iE 'Impronta|decifrabili|non decifrabili|Tutte le credenziali' | sed 's/^/[backend] /'
echo "FINE."
