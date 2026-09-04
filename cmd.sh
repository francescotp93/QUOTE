#!/usr/bin/env bash
# Il registro adesso dice DOVE? E il salvataggio di un'analisi finisce a registro?
set -u
echo "=== righe di richiesta degli ultimi 5 minuti ==="
journalctl -u withus-backend --since "5 min ago" --no-pager | grep -E ' (GET|POST|PUT|DELETE|OPTIONS) +/' | tail -20
echo
echo "=== controllo privacy su tutto il giornale di oggi ==="
journalctl -u withus-backend --since today --no-pager | grep -E ' (GET|POST|PUT|DELETE|OPTIONS) +/' | grep -E '\?|@' | head -5 || echo "nessuna riga con query o chiocciola: come deve essere"
echo
echo "=== quante analisi in archivio ==="
cd /opt/withus-backend/server || exit 1
set -a; . ./.env; set +a
node -e '
const url=(process.env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,"");
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
fetch(url+"/rest/v1/quote_analisi_previdenziali?select=id,titolo,versione_motore,creata_il&order=creata_il.desc&limit=5",
 {headers:{apikey:key,Authorization:"Bearer "+key}})
 .then(r=>r.text()).then(t=>console.log(t.slice(0,600)));
'
