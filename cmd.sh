#!/usr/bin/env bash
# Anagrafica, battito e offerte: la macchina ha preso tutto?
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
date -u '+  adesso sono le:            %a %Y-%m-%d %H:%M:%S UTC'
echo
for r in mia-anagrafica salva-anagrafica sono-qui mie-polizze richiesta; do
  code=$(curl -s -o /tmp/r.txt -w '%{http_code}' -X POST http://127.0.0.1:3000/convenzionati/$r -H 'content-type: application/json' -d '{}')
  nostro=$(grep -c "Serve un accesso" /tmp/r.txt || true)
  echo "  /$r -> $code $([ "$code" = "401" ] && [ "$nostro" = "1" ] && echo '(montata)' || echo '(DA GUARDARE)')"
done
echo
echo "== con un associato vero =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,""); const K=env.SUPABASE_SERVICE_ROLE_KEY;
const ANON=env.SUPABASE_ANON_KEY || (fs.readFileSync("server/convenzionati.js","utf8").match(/eyJ[A-Za-z0-9._-]+/)||[])[0];
const EMAIL="withus.coop@gmail.com";
(async()=>{
  const g=await fetch(U+"/auth/v1/admin/generate_link",{method:"POST",headers:{apikey:K,Authorization:"Bearer "+K,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL})});
  const J=await g.json().catch(()=>({})); const P=J.properties||J||{};
  if(!P.email_otp){console.log("  non riesco a entrare come lui:",g.status,JSON.stringify(P).slice(0,160));return;}
  const v=await fetch(U+"/auth/v1/verify",{method:"POST",headers:{apikey:ANON,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL,token:P.email_otp})});
  const vj=await v.json().catch(()=>({}));
  if(!vj.access_token){console.log("  ingresso rifiutato");return;}
  const H={Authorization:"Bearer "+vj.access_token,"Content-Type":"application/json"};
  const a=await fetch("http://127.0.0.1:3000/convenzionati/mia-anagrafica",{method:"POST",headers:H,body:"{}"});
  const at=await a.text();
  console.log("  mia-anagrafica ->",a.status,at.slice(0,200));
  try{ const j=JSON.parse(at); console.log("  gli mancano:", (j.manca||[]).length ? j.manca.join(", ") : "niente"); }catch(e){}
  const b=await fetch("http://127.0.0.1:3000/convenzionati/sono-qui",{method:"POST",headers:H,body:"{}"});
  console.log("  sono-qui ->",b.status,(await b.text()).slice(0,80));
})().catch(e=>console.log("  errore:",e.message));
'
sleep 4
echo
echo "== il contatore ha registrato? =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,""); const K=env.SUPABASE_SERVICE_ROLE_KEY;
const H={apikey:K,Authorization:"Bearer "+K};
(async()=>{
  const p=await (await fetch(U+"/rest/v1/quote_presenze?select=*",{headers:H})).json();
  if(!p.length) return console.log("  nessuna presenza registrata");
  for(const x of p) console.log("  accessi:"+x.accessi+" | ultimo ping: "+x.ultimo_ping);
  const q=await (await fetch(U+"/rest/v1/quote_offerte?select=titolo,posto,attiva",{headers:H})).json();
  console.log("  offerte in tabella:", q.length ? q.map(o=>o.titolo+" ("+o.posto+")").join(", ") : "nessuna");
})().catch(e=>console.log("  errore:",e.message));
'
sleep 3
echo
echo "== il log =="
journalctl -u withus-backend --since '-6 min' --no-pager 2>/dev/null | grep -i 'convenzionati' | tail -6 || true
