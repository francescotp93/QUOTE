#!/usr/bin/env bash
# Solo diagnostica: niente scritture, nessun segreto stampato.
set -u
E=/opt/withus-backend/server/.env
echo "macchina: $(hostname)   ora: $(date '+%F %T')"
echo "backend:  $(systemctl is-active withus-backend 2>/dev/null)"
echo "ramo:     $(git -C /opt/withus-backend rev-parse --abbrev-ref HEAD 2>/dev/null)"
echo "commit:   $(git -C /opt/withus-backend log -1 --format='%h %cd %s' --date=short 2>/dev/null | cut -c1-90)"
echo
echo "== cosa c'e' nel .env (solo si'/no, mai i valori) =="
for k in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY INTERNAL_API_KEY FONTI_SECRET BREVO_API_KEY; do
  if grep -q "^$k=" "$E" 2>/dev/null; then echo "  $k: c'e'"; else echo "  $k: MANCA"; fi
done
echo
echo "== l'API v1 e' gia' arrivata sulla macchina? =="
for f in server/apiComune.js server/fontiApi.js server/quoteApi.js server/prodottiApi.js; do
  if [ -f "/opt/withus-backend/$f" ]; then echo "  $f: c'e'"; else echo "  $f: MANCA"; fi
done
echo
echo "== risposta locale del backend =="
curl -s -m 6 -o /dev/null -w "  /api/v1/products senza chiave -> %{http_code}\n" http://127.0.0.1:3000/api/v1/products
curl -s -m 6 -o /dev/null -w "  /fonti senza token           -> %{http_code}\n" http://127.0.0.1:3000/fonti
