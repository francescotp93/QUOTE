#!/usr/bin/env bash
# RIAVVIO backend + verifica auto-guarigione (registraDigestKey scrive posta_config).
# Chiavi solo come md5. Autorizzato da Francesco ("riavvia ora").
set -u
mm(){ printf %s "$1" | md5sum | cut -c1-8; }
ENVF=/opt/withus-backend/server/.env
LK=$(grep -E '^MAIL_DIGEST_KEY=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
SRK=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
SBURL=$(grep -E '^SUPABASE_URL=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'); [ -z "$SBURL" ] && SBURL=https://ekjxrnsfqxnfxzrthdcf.supabase.co

echo "== 1. Riavvio withus-backend =="
systemctl restart withus-backend
sleep 4
echo "stato: $(systemctl is-active withus-backend)"

echo; echo "== 2. Backend risponde? =="
for i in 1 2 3 4 5; do
  H=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/mail/digest?key=$LK&filtro=oggi" 2>/dev/null)
  echo "tentativo $i: localhost:3000 /mail/digest -> $H"
  [ "$H" = "200" ] && break
  sleep 3
done

echo; echo "== 3. Attendo l'auto-registrazione (registraDigestKey all'avvio) =="
sleep 12
DBK=$(curl -sS --max-time 20 "$SBURL/rest/v1/posta_config?id=eq.1&select=digest_key" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" | sed -n 's/.*"digest_key":"\([^"]*\)".*/\1/p')
echo ".env  MAIL_DIGEST_KEY md5=$(mm "$LK")"
echo "DB    digest_key       md5=$(mm "$DBK")"
[ "$LK" = "$DBK" ] && echo ">> ALLINEATE ✓ (auto-guarigione attiva)" || echo ">> ancora diverse — l'auto-registrazione potrebbe scrivere entro 10 min"

echo; echo "== 4. Verifica finale pubblica =="
echo "dominio pubblico (chiave DB) -> $(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "https://api.withusassicurazioni.it/mail/digest?key=$DBK&filtro=oggi")"
echo "uptime backend: $(ps -o etimes= -p $(pgrep -f 'node index.js'|head -1) 2>/dev/null | tr -d ' ')s (piccolo = appena riavviato)"
echo FINE.
