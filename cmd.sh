#!/usr/bin/env bash
# Chi ha aperto l'analisi previdenziale nella finestra 11:15-11:25 del 4/9?
set -u
echo "-- righe del log che citano parametri-previdenziali (ultime 3 ore) --"
journalctl -u withus-backend --since "3 hours ago" --no-pager 2>/dev/null | grep -c "parametri-previdenziali" || echo "  0 (o log non accessibile)"
echo "-- tutte le righe fra le 11:10 e le 11:30 --"
journalctl -u withus-backend --since "2026-09-04 11:10:00" --until "2026-09-04 11:30:00" --no-pager 2>/dev/null | tail -30
echo "-- il log registra qualcosa in generale? ultime 5 righe --"
journalctl -u withus-backend -n 5 --no-pager 2>/dev/null
echo "-- analisi salvate in tabella? --"
cd /opt/withus-backend/server && set -a && . ./.env && set +a
node -e '
const url=(process.env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,"");
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
fetch(url+"/rest/v1/quote_analisi_previdenziali?select=id,creata_il,titolo&order=creata_il.desc&limit=5",{headers:{apikey:key,Authorization:"Bearer "+key}})
 .then(r=>r.text()).then(t=>console.log("  ",t.slice(0,200))).catch(e=>console.log("  errore:",e.message));
'
