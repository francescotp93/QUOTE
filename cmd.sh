#!/usr/bin/env bash
# FIX (zero downtime): allinea posta_config.digest_key alla chiave vera del backend
# (MAIL_DIGEST_KEY dal .env), usando la SERVICE_ROLE_KEY. Non tocca .env, non riavvia.
# La chiave non viene mai stampata: solo md5/len e l'esito HTTP.
set -u
ENVF=/opt/withus-backend/server/.env
val(){ grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
mask(){ local v="$1"; [ -z "$v" ] && { echo "VUOTA"; return; }; echo "len=${#v} md5=$(printf %s "$v" | md5sum | cut -c1-8)"; }

MDK=$(val MAIL_DIGEST_KEY)
SRK=$(val SUPABASE_SERVICE_ROLE_KEY)
SBURL=$(val SUPABASE_URL); [ -z "$SBURL" ] && SBURL="https://ekjxrnsfqxnfxzrthdcf.supabase.co"
DURL=$(val MAIL_DIGEST_URL); [ -z "$DURL" ] && DURL="https://api.withusassicurazioni.it/mail/digest"
echo "MAIL_DIGEST_KEY (backend): $(mask "$MDK")"
[ -z "$MDK" ] && { echo "STOP: MAIL_DIGEST_KEY vuota."; exit 1; }
[ -z "$SRK" ] && { echo "STOP: SERVICE_ROLE_KEY vuota."; exit 1; }

echo "== PATCH posta_config (digest_key + digest_url) =="
HTTP=$(curl -sS --max-time 25 -o /tmp/po -w "%{http_code}" -X PATCH \
  "$SBURL/rest/v1/posta_config?id=eq.1" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"digest_key\":\"$MDK\",\"digest_url\":\"$DURL\"}")
echo "HTTP $HTTP   risposta: $(head -c 160 /tmp/po 2>/dev/null)"

echo "== rilettura DB per conferma allineamento =="
DBKEY=$(curl -sS --max-time 20 "$SBURL/rest/v1/posta_config?id=eq.1&select=digest_key" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" | sed -n 's/.*"digest_key":"\([^"]*\)".*/\1/p')
echo "digest_key (DB dopo PATCH): $(mask "$DBKEY")"
[ "$DBKEY" = "$MDK" ] && echo ">> ALLINEATE ✓" || echo ">> ANCORA DIVERSE ✗"

echo "== verifica end-to-end: /mail/digest con la chiave reale =="
for P in 3000 8080 80; do
  VH=$(curl -sS --max-time 40 -o /tmp/dg -w "%{http_code}" "http://127.0.0.1:$P/mail/digest?key=$MDK&filtro=oggi" 2>/dev/null)
  [ "$VH" = "000" ] && continue
  echo "porta $P -> HTTP $VH   anteprima: $(head -c 180 /tmp/dg 2>/dev/null)"; break
done
echo "FINE."
