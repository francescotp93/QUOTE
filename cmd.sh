#!/usr/bin/env bash
# DIAGNOSI SOLA LETTURA: cerca processi backend doppioni e confronta le chiavi.
# Nessuna modifica. Chiavi solo come md5/len.
set -u
mm(){ printf %s "$1" | md5sum | cut -c1-8; }
ENVF=/opt/withus-backend/server/.env

echo "== processi node attivi =="
ps -eo pid,etimes,args 2>/dev/null | grep -i node | grep -v grep | head -20

echo; echo "== servizi node/withus in esecuzione =="
systemctl list-units --type=service --state=running 2>/dev/null | grep -iE 'withus|backend|scraper|node' | head

echo; echo "== pm2 =="
command -v pm2 >/dev/null 2>&1 && pm2 list 2>/dev/null | head -15 || echo "pm2 assente"

echo; echo "== chi ascolta su :3000 =="
ss -ltnp 2>/dev/null | grep ':3000' | head

echo; echo "== tutti i .env sotto /opt e la loro MAIL_DIGEST_KEY (md5) =="
for f in $(find /opt -maxdepth 4 -name .env 2>/dev/null); do
  k=$(grep -E '^MAIL_DIGEST_KEY=' "$f" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
  [ -n "$k" ] && echo "$f  -> md5=$(mm "$k") len=${#k}" || echo "$f  -> (nessuna MAIL_DIGEST_KEY)"
done

echo; echo "== chiave nel DB adesso =="
SRK=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
SBURL=$(grep -E '^SUPABASE_URL=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'); [ -z "$SBURL" ] && SBURL=https://ekjxrnsfqxnfxzrthdcf.supabase.co
DBK=$(curl -sS --max-time 20 "$SBURL/rest/v1/posta_config?id=eq.1&select=digest_key" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" | sed -n 's/.*"digest_key":"\([^"]*\)".*/\1/p')
echo "DB digest_key md5=$(mm "$DBK") len=${#DBK}"

echo; echo "== test endpoint con la chiave del .env principale =="
LK=$(grep -E '^MAIL_DIGEST_KEY=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
echo ".env principale MAIL_DIGEST_KEY md5=$(mm "$LK")"
echo "localhost:3000 (chiave .env)      -> $(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/mail/digest?key=$LK&filtro=oggi")"
echo "dominio pubblico (chiave .env)    -> $(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "https://api.withusassicurazioni.it/mail/digest?key=$LK&filtro=oggi")"
echo "dominio pubblico (chiave del DB)  -> $(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "https://api.withusassicurazioni.it/mail/digest?key=$DBK&filtro=oggi")"
echo FINE.
