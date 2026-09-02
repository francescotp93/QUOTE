#!/usr/bin/env bash
# Quali variabili d'ambiente ha il backend?
# PRIVACY: si stampa SOLO se c'e' e quanto e' lunga. Mai il valore.
# Le uniche eccezioni sono gli indirizzi email di servizio, che non sono segreti.
set -u
cd /opt/withus-backend || exit 1

echo "== dove sta il file =="
ls -l server/.env 2>/dev/null | awk '{print "  ", $1, $3, $5" byte", $9}'
echo

echo "== cosa serve ai convenzionati =="
node -e '
const fs=require("fs");
let t=""; try{ t=fs.readFileSync("server/.env","utf8"); }catch(e){ console.log("  server/.env NON leggibile:", e.message); process.exit(0); }
const v={}; for(const r of t.split(/\n/)){ const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) v[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,""); }
// Indirizzi e URL non sono segreti: si mostrano, servono a capire dove va la posta.
const inChiaro=["STAFF_EMAIL","NOTIFY_FROM","NOTIFY_NAME","IAM_URL","SELF_URL","SUPABASE_URL","AREA_CONVENZIONATI_URL"];
const segrete=["SUPABASE_SERVICE_ROLE_KEY","BREVO_API_KEY","FONTI_SECRET"];
for(const k of segrete){
  console.log("  " + k.padEnd(28) + (v[k] ? ("c e (" + v[k].length + " caratteri)") : "ASSENTE"));
}
for(const k of inChiaro){
  console.log("  " + k.padEnd(28) + (v[k] ? v[k] : "assente -> si usa il valore di riserva"));
}
'
echo
echo "== di riserva, se assenti, il codice usa questi =="
grep -hoE "process\\.env\\.(STAFF_EMAIL|NOTIFY_FROM|IAM_URL|AREA_CONVENZIONATI_URL)[^;]*" server/convenzionati.js | sed 's/^/  /'
echo
echo "== il backend ha caricato il nuovo pezzo? =="
git log --oneline -1
ls -l server/convenzionati.js 2>/dev/null | awk '{print "  convenzionati.js:", $5" byte"}'
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
curl -s -o /dev/null -w "  /convenzionati/iscrizione risponde: %{http_code}\n" -m 10 -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:3000/convenzionati/iscrizione
