#!/usr/bin/env bash
# SIGILLO: aggiunge SUPABASE_URL al .env del backend cosi l'auto-guarigione
# (registraDigestKey) funziona per sempre. Backup PRIMA (regola #1). Idempotente.
# NON riavvia il servizio (effetto al prossimo riavvio). Nessun segreto stampato.
set -u
ENVF=/opt/withus-backend/server/.env
URL="https://ekjxrnsfqxnfxzrthdcf.supabase.co"

[ -f "$ENVF" ] || { echo "STOP: .env assente."; exit 1; }

echo "== 1. Backup .env =="
BK="${ENVF}.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$ENVF" "$BK" && echo "backup creato: $BK" || { echo "STOP: backup fallito, non tocco nulla."; exit 1; }

echo; echo "== 2. SUPABASE_URL gia presente? =="
if grep -qE '^SUPABASE_URL=' "$ENVF"; then
  echo "GIA presente: $(grep -E '^SUPABASE_URL=' "$ENVF" | head -1)"
  echo "Niente da aggiungere (idempotente)."
else
  printf '\nSUPABASE_URL=%s\n' "$URL" >> "$ENVF"
  echo "AGGIUNTA riga: SUPABASE_URL=$URL"
fi

echo; echo "== 3. Verifica riga nel file =="
grep -E '^SUPABASE_URL=' "$ENVF" | head -1

echo; echo "== 4. Controllo integrita (nessun segreto stampato) =="
echo "righe totali .env: $(wc -l < "$ENVF")"
echo "chiavi attese presenti: MAIL_DIGEST_KEY=$(grep -qE '^MAIL_DIGEST_KEY=' "$ENVF" && echo si || echo NO)  SERVICE_ROLE=$(grep -qE '^SUPABASE_SERVICE_ROLE_KEY=' "$ENVF" && echo si || echo NO)  SUPABASE_URL=$(grep -qE '^SUPABASE_URL=' "$ENVF" && echo si || echo NO)"
echo "backend attivo: $(systemctl is-active withus-backend 2>/dev/null)"
echo "(nessun riavvio eseguito: l'auto-guarigione parte al prossimo riavvio)"
echo "FINE."
