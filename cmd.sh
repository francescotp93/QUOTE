#!/usr/bin/env bash
# Telegram: ricava chat_id (getUpdates), invia messaggio di prova, salva chat_id nel DB.
# Token letto dal DB (posta_config) col service role: NON finisce in git.
set -u
ENVF=/opt/withus-backend/server/.env
SRK=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
SBURL=$(grep -E '^SUPABASE_URL=' "$ENVF" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'); [ -z "$SBURL" ] && SBURL=https://ekjxrnsfqxnfxzrthdcf.supabase.co

TG=$(curl -sS --max-time 20 "$SBURL/rest/v1/posta_config?id=eq.1&select=telegram_token" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" | sed -n 's/.*"telegram_token":"\([^"]*\)".*/\1/p')
echo "token telegram dal DB: $([ -n "$TG" ] && echo presente || echo ASSENTE)"
[ -z "$TG" ] && { echo "STOP: token assente"; exit 1; }

echo "=== getUpdates ==="
UP=$(curl -sS --max-time 20 "https://api.telegram.org/bot$TG/getUpdates")
echo "raw (primi 400): $(printf '%s' "$UP" | head -c 400)"
CHAT=$(printf '%s' "$UP" | grep -oE '"chat":\{"id":-?[0-9]+' | head -1 | grep -oE '\-?[0-9]+$')
echo "chat_id: ${CHAT:-NON TROVATO}"

if [ -z "$CHAT" ]; then
  echo ">> Nessun messaggio ricevuto dal bot: Francesco deve aprire @GiuliaWithus_bot e premere Avvia/Start (o scrivere 'ciao')."
  exit 0
fi

echo "=== invio messaggio di prova ==="
SEND=$(curl -sS --max-time 20 "https://api.telegram.org/bot$TG/sendMessage" \
  --data-urlencode "chat_id=$CHAT" \
  --data-urlencode "text=✅ Ciao Francesco! Sono Giulia 📬 Da ora ti avviso QUI su Telegram quando arriva posta nuova. (messaggio di prova) — Withus AI")
echo "esito invio: $(printf '%s' "$SEND" | grep -oE '"ok":(true|false)' | head -1)"

echo "=== salvo chat_id nel DB ==="
PH=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -X PATCH "$SBURL/rest/v1/posta_config?id=eq.1" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"telegram_chat_id\":\"$CHAT\"}")
echo "PATCH telegram_chat_id -> HTTP $PH"
echo FINE.
