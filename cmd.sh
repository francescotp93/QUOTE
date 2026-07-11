set -uo pipefail
APP=/opt/withus-backend
ENV="$APP/server/.env"
SD="$(cd "$(dirname "$0")" && pwd)"
STAMP=$(date +%Y%m%d-%H%M%S)
SCRAPERS="italiana hdi groupama moto axa prima allianz"
OLD=$(grep "^FONTI_SECRET=" "$ENV" 2>/dev/null | head -1 | cut -d= -f2-)
[ -z "$OLD" ] && OLD="withus-fonti-vps-v1"
NEW=$(openssl rand -base64 36 | tr -d "\n")
echo "== backup =="
cp -a "$ENV" "$ENV.bak-$STAMP" && echo ".env salvato"
FOUND=0
while IFS= read -r STORE; do
  FOUND=$((FOUND+1)); cp -a "$STORE" "$STORE.bak-$STAMP"
  OLD_SECRET="$OLD" NEW_SECRET="$NEW" node "$SD/reenc.js" "$STORE" || { echo "ABORT: re-cifratura fallita su $STORE (nulla applicato)"; exit 1; }
  mv "$STORE.new" "$STORE"; chmod 600 "$STORE"; echo "ri-cifrato: $STORE"
done < <(find "$APP" -name fonti.store.json ! -name "*.bak-*" 2>/dev/null)
echo "store trovati: $FOUND"
echo "== aggiorno chiave in .env e nei drop-in scraper =="
grep -v "^FONTI_SECRET=" "$ENV" > "$ENV.tmp" && mv "$ENV.tmp" "$ENV"
printf "FONTI_SECRET=%s\n" "$NEW" >> "$ENV"; chmod 600 "$ENV"
for c in $SCRAPERS; do D="/etc/systemd/system/${c}-scraper.service.d"; mkdir -p "$D"; printf "[Service]\nEnvironment=FONTI_SECRET=%s\n" "$NEW" > "$D/secret.conf"; done
echo "== riavvio servizi =="
systemctl daemon-reload
systemctl restart withus-backend && echo "backend: $(systemctl is-active withus-backend)"
for c in $SCRAPERS; do systemctl restart "${c}-scraper" 2>/dev/null; echo "${c}: $(systemctl is-active ${c}-scraper 2>/dev/null)"; done
echo "== FATTO. Chiave ruotata + credenziali ri-cifrate. Nessun segreto stampato. =="
echo "Backup: ${ENV}.bak-$STAMP e ogni fonti.store.json.bak-$STAMP"
