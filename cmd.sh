ENV=/opt/withus-backend/server/.env
# 1) genera o riusa MAIL_DIGEST_KEY (non lo stampiamo mai)
if grep -q '^MAIL_DIGEST_KEY=' "$ENV"; then
  K=$(grep '^MAIL_DIGEST_KEY=' "$ENV" | head -1 | cut -d= -f2- | tr -d '"')
  echo "MAIL_DIGEST_KEY: gia presente (len ${#K})"
else
  K=$(openssl rand -hex 24)
  printf '\nMAIL_DIGEST_KEY=%s\n' "$K" >> "$ENV"
  echo "MAIL_DIGEST_KEY: generato e aggiunto (len ${#K})"
fi
# 2) trasferisci la chiave a Supabase (posta_config.digest_key) col service role del VPS
SURL=$(grep '^SUPABASE_URL=' "$ENV" | head -1 | cut -d= -f2- | tr -d '"' | sed 's:/*$::')
SKEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$SURL" ] || [ -z "$SKEY" ]; then
  echo "PATCH: MANCA SUPABASE_URL o SERVICE_ROLE_KEY nel .env"
else
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$SURL/rest/v1/posta_config?id=eq.1" \
    -H "apikey: $SKEY" -H "Authorization: Bearer $SKEY" -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" -d "{\"digest_key\":\"$K\"}")
  echo "PATCH posta_config.digest_key -> HTTP $CODE"
fi
# 3) riavvia il backend per caricare la nuova variabile
systemctl restart withus-backend >/dev/null 2>&1 || sudo systemctl restart withus-backend >/dev/null 2>&1
sleep 5
echo "BACKEND $(systemctl is-active withus-backend 2>/dev/null)"
# 4) collaudo endpoint con la chiave vera (stampa solo lo stato, non la chiave)
echo "DIGEST http: $(curl -s -o /dev/null -w '%{http_code}' "https://api.withusassicurazioni.it/mail/digest?key=$K&filtro=oggi" --max-time 90)"
# 5) mostra quante email di oggi per casella (senza contenuti sensibili estesi)
curl -s "https://api.withusassicurazioni.it/mail/digest?key=$K&filtro=oggi" --max-time 90 \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const r=j.risultati||{};for(const k of Object.keys(r)){const v=r[k];console.log('  '+k+': '+(v.errore?('ERRORE '+v.errore):((v.messaggi||[]).length+' msg oggi')))}}catch(e){console.log('parse err:',e.message)}})"
