#!/usr/bin/env bash
# Imposta posta_config.digest_key_lock = MAIL_DIGEST_KEY del .env (chiave valida,
# stabile, che nessuna automazione tocca). Chiave solo come md5. Nessun riavvio.
set -u
mm(){ printf %s "$1" | md5sum | cut -c1-8; }
ENVF=/opt/withus-backend/server/.env
LK=$(grep -E '^MAIL_DIGEST_KEY=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
SRK=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
SBURL=$(grep -E '^SUPABASE_URL=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'); [ -z "$SBURL" ] && SBURL=https://ekjxrnsfqxnfxzrthdcf.supabase.co

echo "MAIL_DIGEST_KEY (.env) md5=$(mm "$LK")"
[ -z "$LK" ] && { echo "STOP: chiave vuota"; exit 1; }

HTTP=$(curl -sS --max-time 20 -o /tmp/po -w '%{http_code}' -X PATCH \
  "$SBURL/rest/v1/posta_config?id=eq.1" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"digest_key_lock\":\"$LK\"}")
echo "PATCH digest_key_lock -> HTTP $HTTP"

LOCK=$(curl -sS --max-time 20 "$SBURL/rest/v1/posta_config?id=eq.1&select=digest_key_lock" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" | sed -n 's/.*"digest_key_lock":"\([^"]*\)".*/\1/p')
echo "digest_key_lock (DB) md5=$(mm "$LOCK")"
[ "$LOCK" = "$LK" ] && echo ">> BLINDATA ✓" || echo ">> errore: non impostata"
echo FINE.
