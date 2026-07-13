#!/usr/bin/env bash
# Test LIVE Telegram: manda subito un messaggio firmato Giulia a Francesco.
# Legge token+chat_id da Supabase posta_config e chiama direttamente Telegram.
set -u
ENVF='/opt/withus-backend/server/.env'
val(){ grep -m1 "^$1=" "$ENVF" 2>/dev/null | sed "s/^$1=//; s/^\"//; s/\"$//"; }
SRK="$(val SUPABASE_SERVICE_ROLE_KEY)"
SBURL="$(val SUPABASE_URL)"; [ -z "$SBURL" ] && SBURL="https://ekjxrnsfqxnfxzrthdcf.supabase.co"

echo "=== leggo token/chat_id da Supabase ==="
ROW="$(curl -s "$SBURL/rest/v1/posta_config?id=eq.1&select=telegram_token,telegram_chat_id" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK")"
TOKEN="$(echo "$ROW" | sed -n 's/.*"telegram_token":"\([^"]*\)".*/\1/p')"
CHAT="$(echo "$ROW"  | sed -n 's/.*"telegram_chat_id":"\([^"]*\)".*/\1/p')"
echo "token: $([ -n "$TOKEN" ] && echo presente || echo VUOTO)  chat_id: ${CHAT:-VUOTO}"

MSG="🔔 Ciao Francesco, sono Giulia. Questo è un test dal vivo: il canale Telegram è attivo e ti avviserò appena arriva posta nuova nelle caselle dell'agenzia. — $(date '+%H:%M %d/%m')"

echo "=== invio a Telegram ==="
RES="$(curl -s -X POST "https://api.telegram.org/bot$TOKEN/sendMessage" \
  --data-urlencode "chat_id=$CHAT" \
  --data-urlencode "text=$MSG")"
echo "risposta Telegram (primi 300): ${RES:0:300}"
echo "$RES" | grep -q '"ok":true' && echo ">> INVIATO ✓" || echo ">> ERRORE invio ✗"
echo "FINE."
