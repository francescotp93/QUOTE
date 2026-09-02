#!/usr/bin/env bash
# Perche' il backend risponde «Accesso non valido o scaduto» a un associato
# che e' dentro? Il motivo vero lo scrive nel log.
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
grep -c 'SUPABASE_ANON' server/convenzionati.js | sed 's/^/  chiave pubblica nel file: /'
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
echo
echo "== il motivo vero, dal log =="
journalctl -u withus-backend --since '-25 min' --no-pager 2>/dev/null | grep -i 'convenzionati' | tail -12
echo
echo "== gli associati e il loro stato =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,"");
const K=env.SUPABASE_SERVICE_ROLE_KEY;
fetch(U+"/rest/v1/quote_convenzione_associati?select=email,stato,auth_user_id,deve_cambiare_password&order=creato_il.desc&limit=6",{headers:{apikey:K,Authorization:"Bearer "+K}})
 .then(r=>r.json()).then(d=>{ for(const a of d) console.log("  "+a.email+" | stato:"+a.stato+" | ha accesso:"+(!!a.auth_user_id)+" | deve cambiare pw:"+a.deve_cambiare_password); })
 .catch(e=>console.log("  errore:",e.message));
'
sleep 2
echo
echo "== la chiave pubblica del backend funziona? =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,"");
const anonInFile = (fs.readFileSync("server/convenzionati.js","utf8").match(/eyJ[A-Za-z0-9._-]+/)||[])[0];
console.log("  chiave pubblica presa dal codice:", anonInFile ? (anonInFile.length+" caratteri") : "NON TROVATA");
console.log("  SUPABASE_ANON_KEY nel .env:", env.SUPABASE_ANON_KEY ? "presente" : "assente (si usa quella nel codice)");
// Una chiamata SENZA token: deve rispondere 401, non 403/invalid key.
fetch(U+"/auth/v1/user",{headers:{apikey: env.SUPABASE_ANON_KEY || anonInFile}})
 .then(async r=>console.log("  /auth/v1/user senza token ->", r.status, (await r.text()).slice(0,120)))
 .catch(e=>console.log("  errore:", e.message));
'
sleep 2
