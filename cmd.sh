ENV=/opt/withus-backend/server/.env
echo "righe MAIL_DIGEST_KEY prima: $(grep -c '^MAIL_DIGEST_KEY=' "$ENV")"
# dedup: rimuovi tutte le righe e rimetti UNA sola chiave nuova
grep -v '^MAIL_DIGEST_KEY=' "$ENV" > "$ENV.tmp" && cp "$ENV.tmp" "$ENV" && rm -f "$ENV.tmp"
K=$(openssl rand -hex 24)
printf 'MAIL_DIGEST_KEY=%s\n' "$K" >> "$ENV"
echo "righe MAIL_DIGEST_KEY dopo: $(grep -c '^MAIL_DIGEST_KEY=' "$ENV")"
echo "nuova key md5: $(printf '%s' "$K" | md5sum | cut -d' ' -f1)"
# riavvia e attendi
systemctl restart withus-backend >/dev/null 2>&1 || sudo systemctl restart withus-backend >/dev/null 2>&1
sleep 6
echo "BACKEND $(systemctl is-active withus-backend 2>/dev/null)"
# credenziali supabase dal processo node
PID=""; for p in $(pgrep node 2>/dev/null); do tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -q '^SUPABASE_SERVICE_ROLE_KEY=' && { PID=$p; break; }; done
get(){ tr '\0' '\n' < /proc/$PID/environ 2>/dev/null | grep "^$1=" | head -1 | cut -d= -f2-; }
SURL=$(get SUPABASE_URL); [ -z "$SURL" ] && SURL="https://ekjxrnsfqxnfxzrthdcf.supabase.co"; SURL=$(echo "$SURL"|sed 's:/*$::')
SKEY=$(get SUPABASE_SERVICE_ROLE_KEY)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$SURL/rest/v1/posta_config?id=eq.1" -H "apikey: $SKEY" -H "Authorization: Bearer $SKEY" -H "Content-Type: application/json" -H "Prefer: return=minimal" -d "{\"digest_key\":\"$K\"}")
echo "PATCH digest_key -> HTTP $CODE"
# collaudo endpoint con la chiave nuova
echo "DIGEST http: $(curl -s -o /dev/null -w '%{http_code}' "https://api.withusassicurazioni.it/mail/digest?key=$K&filtro=oggi" --max-time 90)"
