#!/usr/bin/env bash
# Diagnosi + riallineamento chiave digest (NIENTE rigenerazione: leggo la chiave
# vera del backend e allineo posta_config). Chiavi sempre mascherate (len+md5).
set -u
mask(){ local v="$1"; [ -z "$v" ] && { echo "VUOTA"; return; }; echo "len=${#v} md5=$(printf %s "$v" | md5sum | cut -c1-8)"; }

echo "== 1. Processo backend =="
PID=$(pgrep -f 'node .*server' | head -1); [ -z "$PID" ] && PID=$(pgrep -f 'node' | head -1)
echo "PID node: ${PID:-NESSUNO}"
[ -z "${PID:-}" ] && { echo "Nessun processo node: backend giu?"; exit 1; }
ENV=$(tr '\0' '\n' < /proc/$PID/environ)
MDK=$(printf '%s\n' "$ENV" | sed -n 's/^MAIL_DIGEST_KEY=//p' | head -1)
MSK=$(printf '%s\n' "$ENV" | sed -n 's/^MAIL_SELFTEST_KEY=//p' | head -1)
SRK=$(printf '%s\n' "$ENV" | sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' | head -1)
SBURL=$(printf '%s\n' "$ENV" | sed -n 's/^SUPABASE_URL=//p' | head -1)
echo "MAIL_DIGEST_KEY   (backend): $(mask "$MDK")"
echo "MAIL_SELFTEST_KEY (backend): $(mask "$MSK")"
echo "SERVICE_ROLE_KEY presente:   $([ -n "$SRK" ] && echo si || echo NO)"
echo "SUPABASE_URL:                ${SBURL:-none}"

echo; echo "== 2. Il codice vivo auto-registra la chiave? =="
grep -rl "registraDigestKey" /opt/withus-backend/server 2>/dev/null | head -3 || echo "registraDigestKey NON trovata nei sorgenti serviti"
echo "-- righe posta_config nel codice (quale chiave usa per il PATCH):"
grep -rn "posta_config" /opt/withus-backend/server/*.js 2>/dev/null | grep -iE "patch|update|digest|SERVICE|ANON" | head -6

echo; echo "== 3. Chiave nel DB (posta_config) =="
KEYFORAPI="$SRK"; [ -z "$KEYFORAPI" ] && KEYFORAPI=$(printf '%s\n' "$ENV" | sed -n 's/^SUPABASE_ANON_KEY=//p' | head -1)
DBKEY=$(curl -sS --max-time 20 "$SBURL/rest/v1/posta_config?id=eq.1&select=digest_key" \
  -H "apikey: $KEYFORAPI" -H "Authorization: Bearer $KEYFORAPI" | sed -n 's/.*"digest_key":"\([^"]*\)".*/\1/p')
echo "digest_key (DB): $(mask "$DBKEY")"
if [ "$DBKEY" = "$MDK" ]; then echo ">> GIA ALLINEATE"; else echo ">> DISALLINEATE (DB != backend)"; fi

echo; echo "== 4. Riallineamento posta_config.digest_key = MAIL_DIGEST_KEY del backend =="
if [ -z "$SRK" ]; then
  echo "SALTATO: manca SERVICE_ROLE_KEY, non posso PATCHare bypassando la RLS."
elif [ "$DBKEY" = "$MDK" ]; then
  echo "Niente da fare, gia allineate."
else
  HTTP=$(curl -sS --max-time 20 -o /tmp/patchout -w "%{http_code}" -X PATCH \
    "$SBURL/rest/v1/posta_config?id=eq.1" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d "{\"digest_key\":\"$MDK\"}")
  echo "PATCH posta_config -> HTTP $HTTP"; echo "risposta: $(head -c 200 /tmp/patchout 2>/dev/null)"
fi

echo; echo "== 5. Verifica finale: chiave del backend contro /mail/digest in locale =="
VHTTP=$(curl -sS --max-time 60 -o /tmp/digout -w "%{http_code}" "http://127.0.0.1:3000/mail/digest?key=$MDK&filtro=oggi")
echo "GET /mail/digest (chiave backend) -> HTTP $VHTTP"
echo "anteprima: $(head -c 240 /tmp/digout 2>/dev/null)"
echo; echo "FINE."
