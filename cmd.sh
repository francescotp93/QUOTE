#!/usr/bin/env bash
# «Scegli» apre una richiesta vera: la macchina l'ha presa?
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
grep -c "convenzionatiRouter_pubblicoAssociati.post('/richiesta'" server/convenzionati.js | sed 's/^/  la rotta della richiesta c\x27e\x27 (deve essere 1): /'
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
date -u '+  adesso sono le:            %a %Y-%m-%d %H:%M:%S UTC'
echo
echo "== la rotta risponde? =="
# Senza accesso deve dire 401 e non 404: 404 vorrebbe dire che non e' montata.
code=$(curl -s -o /tmp/r.txt -w '%{http_code}' -X POST http://127.0.0.1:3000/convenzionati/richiesta -H 'content-type: application/json' -d '{}')
echo "  senza accesso -> $code $(head -c 120 /tmp/r.txt)"
grep -q "Serve un accesso" /tmp/r.txt && echo "  ==> montata: risponde la NOSTRA rotta" || echo "  ==> risponde il cancello dello staff: la rotta non c'e' ancora"
echo
echo "== e con un associato vero? =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,"");
const K=env.SUPABASE_SERVICE_ROLE_KEY;
const ANON=env.SUPABASE_ANON_KEY || (fs.readFileSync("server/convenzionati.js","utf8").match(/eyJ[A-Za-z0-9._-]+/)||[])[0];
const EMAIL="withus.coop@gmail.com";
(async()=>{
  const g=await fetch(U+"/auth/v1/admin/generate_link",{method:"POST",headers:{apikey:K,Authorization:"Bearer "+K,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL})});
  const j=await g.json().catch(()=>({})); const P=j.properties||j;
  if(!P.email_otp){console.log("  non riesco a entrare come lui");return;}
  const v=await fetch(U+"/auth/v1/verify",{method:"POST",headers:{apikey:ANON,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL,token:P.email_otp})});
  const vj=await v.json().catch(()=>({}));
  if(!vj.access_token){console.log("  ingresso rifiutato");return;}
  // Un prodotto che NON e" della sua convenzione non deve passare.
  const r=await fetch("http://127.0.0.1:3000/convenzionati/richiesta",{method:"POST",headers:{Authorization:"Bearer "+vj.access_token,"Content-Type":"application/json"},body:JSON.stringify({prodotto_id:"00000000-0000-0000-0000-000000000000"})});
  const t=await r.text();
  console.log("  prodotto inventato ->",r.status,t.slice(0,120));
  const nostro = /non e\u0300 disponibile|non . disponibile/.test(t) || (()=>{try{return !!JSON.parse(t).error}catch(e){return false}})();
  console.log(r.status===404 && nostro ? "  ==> lo riconosce E rifiuta un prodotto che non e\x27 suo" : "  ==> LA ROTTA NON C\x27E\x27 ANCORA (404 di Express, non nostro)");
})().catch(e=>console.log("  errore:",e.message));
'
sleep 4
echo
echo "== quante richieste ci sono =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,"");
const K=env.SUPABASE_SERVICE_ROLE_KEY;
fetch(U+"/rest/v1/quote_convenzione_richieste?select=prodotto_nome,stato,creato_il&order=creato_il.desc&limit=5",{headers:{apikey:K,Authorization:"Bearer "+K}})
 .then(r=>r.json()).then(d=>{ if(!d.length) return console.log("  nessuna ancora (giusto: e\x27 appena uscita)"); for(const x of d) console.log("  "+x.prodotto_nome+" | "+x.stato+" | "+x.creato_il); })
 .catch(e=>console.log("  errore:",e.message));
'
sleep 3
echo
echo "== il log =="
journalctl -u withus-backend --since '-8 min' --no-pager 2>/dev/null | grep -i 'convenzionati' | tail -6 || true
