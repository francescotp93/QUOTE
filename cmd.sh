#!/usr/bin/env bash
set -u
ENVF='/opt/withus-backend/server/.env'
val(){ grep -m1 "^$1=" "$ENVF" 2>/dev/null | sed "s/^$1=//; s/^\"//; s/\"$//"; }
SRK="$(val SUPABASE_SERVICE_ROLE_KEY)"
SBURL="$(val SUPABASE_URL)"; [ -z "$SBURL" ] && SBURL="https://ekjxrnsfqxnfxzrthdcf.supabase.co"
ROW="$(curl -s "$SBURL/rest/v1/posta_config?id=eq.1&select=telegram_token,telegram_chat_id" -H "apikey: $SRK" -H "Authorization: Bearer $SRK")"
TOKEN="$(echo "$ROW" | sed -n 's/.*"telegram_token":"\([^"]*\)".*/\1/p')"
CHAT="$(echo "$ROW"  | sed -n 's/.*"telegram_chat_id":"\([^"]*\)".*/\1/p')"
echo "=== getMe (chi e' il bot) ==="; curl -s "https://api.telegram.org/bot$TOKEN/getMe"; echo
echo "=== getWebhookInfo (webhook che intercetta?) ==="; curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo"; echo
echo "=== getUpdates (chat recenti) ==="; curl -s "https://api.telegram.org/bot$TOKEN/getUpdates" | head -c 1400; echo
echo "=== chat_id nel DB: $CHAT ==="
echo "FINE."
