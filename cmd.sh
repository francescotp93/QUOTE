#!/usr/bin/env bash
# Diagnosi SOLA LETTURA: legge le chiavi dal file .env (fonte vera, dotenv non le
# esporta in /proc/environ). Chiavi sempre mascherate. NON modifica nulla.
set -u
ENVF=/opt/withus-backend/server/.env
mask(){ local v="$1"; [ -z "$v" ] && { echo "ASSENTE/VUOTA"; return; }; echo "PRESENTE len=${#v} md5=$(printf %s "$v" | md5sum | cut -c1-8)"; }
val(){ grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

echo "== .env: $ENVF =="
[ -f "$ENVF" ] && echo "file presente" || { echo "FILE .env ASSENTE"; exit 1; }
MDK=$(val MAIL_DIGEST_KEY); MSK=$(val MAIL_SELFTEST_KEY)
SRK=$(val SUPABASE_SERVICE_ROLE_KEY); SBURL=$(val SUPABASE_URL); DURL=$(val MAIL_DIGEST_URL)
echo "MAIL_DIGEST_KEY:            $(mask "$MDK")"
echo "MAIL_SELFTEST_KEY:         $(mask "$MSK")"
echo "SUPABASE_SERVICE_ROLE_KEY: $(mask "$SRK")"
echo "SUPABASE_URL:              ${SBURL:-ASSENTE}"
echo "MAIL_DIGEST_URL:           ${DURL:-non impostata (usa default)}"

echo; echo "== posta_config.digest_key nel DB =="
APIK="$SRK"; [ -z "$APIK" ] && APIK=$(val SUPABASE_ANON_KEY)
if [ -n "$SBURL" ] && [ -n "$APIK" ]; then
  DBKEY=$(curl -sS --max-time 20 "$SBURL/rest/v1/posta_config?id=eq.1&select=digest_key" \
    -H "apikey: $APIK" -H "Authorization: Bearer $APIK" | sed -n 's/.*"digest_key":"\([^"]*\)".*/\1/p')
  echo "digest_key (DB): $(mask "$DBKEY")"
  EFF="$MDK"; [ -z "$EFF" ] && EFF="$MSK"
  if [ -z "$EFF" ]; then echo ">> DIAGNOSI: il backend NON ha ne MAIL_DIGEST_KEY ne MAIL_SELFTEST_KEY -> /mail/digest respinge TUTTO (403) e l auto-registrazione non scrive mai."
  elif [ "$DBKEY" = "$EFF" ]; then echo ">> DB e backend ALLINEATI (il 403 avrebbe altra causa)."
  else echo ">> DB e backend DISALLINEATI."; fi
else
  echo "Non riesco a leggere il DB da .env (SUPABASE_URL/KEY mancanti)."
fi

echo; echo "== servizio backend =="
systemctl is-active withus-backend 2>/dev/null
echo "FINE (sola lettura)."
