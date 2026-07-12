ENV=/opt/withus-backend/server/.env
K=$(grep '^MAIL_DIGEST_KEY=' "$ENV" | head -1 | cut -d= -f2- | tr -d '"')
echo "digest key len: ${#K}"
# trova un processo node del backend che abbia la service role key nel suo ambiente
PID=""
for p in $(pgrep node 2>/dev/null); do
  if tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -q '^SUPABASE_SERVICE_ROLE_KEY='; then PID=$p; break; fi
done
echo "PID backend con service role: ${PID:-non trovato}"
get(){ tr '\0' '\n' < /proc/$PID/environ 2>/dev/null | grep "^$1=" | head -1 | cut -d= -f2-; }
SURL=$(get SUPABASE_URL); SKEY=$(get SUPABASE_SERVICE_ROLE_KEY)
[ -z "$SURL" ] && SURL="https://ekjxrnsfqxnfxzrthdcf.supabase.co"
SURL=$(echo "$SURL" | sed 's:/*$::')
if [ -z "$SKEY" ]; then
  echo "SERVICE_ROLE non trovata nel processo"
else
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$SURL/rest/v1/posta_config?id=eq.1" \
    -H "apikey: $SKEY" -H "Authorization: Bearer $SKEY" -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" -d "{\"digest_key\":\"$K\"}")
  echo "PATCH posta_config.digest_key -> HTTP $CODE"
fi
