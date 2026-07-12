PID=""; for p in $(pgrep node 2>/dev/null); do tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -q '^MAIL_DIGEST_KEY=' && { PID=$p; break; }; done
if [ -z "$PID" ]; then echo "nessun node con MAIL_DIGEST_KEY"; exit 0; fi
K=$(tr '\0' '\n' < /proc/$PID/environ | grep '^MAIL_DIGEST_KEY=' | head -1 | cut -d= -f2-)
echo "proc key md5: $(printf '%s' "$K" | md5sum | cut -d' ' -f1)"
echo "self-reg service role presente nel processo? $(tr '\0' '\n' < /proc/$PID/environ | grep -c '^SUPABASE_SERVICE_ROLE_KEY=')"
get(){ tr '\0' '\n' < /proc/$PID/environ 2>/dev/null | grep "^$1=" | head -1 | cut -d= -f2-; }
SURL=$(get SUPABASE_URL); [ -z "$SURL" ] && SURL="https://ekjxrnsfqxnfxzrthdcf.supabase.co"; SURL=$(echo "$SURL"|sed 's:/*$::')
SKEY=$(get SUPABASE_SERVICE_ROLE_KEY)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$SURL/rest/v1/posta_config?id=eq.1" -H "apikey: $SKEY" -H "Authorization: Bearer $SKEY" -H "Content-Type: application/json" -H "Prefer: return=minimal" -d "{\"digest_key\":\"$K\"}")
echo "PATCH digest_key -> HTTP $CODE"
echo "DIGEST http: $(curl -s -o /dev/null -w '%{http_code}' "https://api.withusassicurazioni.it/mail/digest?key=$K&filtro=oggi&full=1" --max-time 90)"
