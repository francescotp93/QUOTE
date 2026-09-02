#!/usr/bin/env bash
# L'aggancio al gruppo: si ripara davvero da solo?
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
date -u '+  adesso sono le:            %a %Y-%m-%d %H:%M:%S UTC'
echo
echo "== com'e' messo l'associato di prova PRIMA =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,""); const K=env.SUPABASE_SERVICE_ROLE_KEY;
fetch(U+"/rest/v1/quote_convenzione_associati?select=email,privacy_accettata_il,anagrafica_id,marketing_accettato&limit=5",{headers:{apikey:K,Authorization:"Bearer "+K}})
 .then(r=>r.json()).then(d=>{for(const a of d)console.log("  "+a.email+" | consenso:"+(a.privacy_accettata_il?"si":"no")+" | anagrafica:"+(a.anagrafica_id?"si":"NO"));})
 .catch(e=>console.log("  errore:",e.message));
'
sleep 3
echo
echo "== apre l'area (e' li' che si ripara) =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,""); const K=env.SUPABASE_SERVICE_ROLE_KEY;
const ANON=env.SUPABASE_ANON_KEY || (fs.readFileSync("server/convenzionati.js","utf8").match(/eyJ[A-Za-z0-9._-]+/)||[])[0];
const EMAIL="withus.coop@gmail.com";
(async()=>{
  const g=await fetch(U+"/auth/v1/admin/generate_link",{method:"POST",headers:{apikey:K,Authorization:"Bearer "+K,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL})});
  const P=(await g.json().catch(()=>({}))).properties||{};
  if(!P.email_otp){console.log("  non riesco a entrare come lui");return;}
  const v=await fetch(U+"/auth/v1/verify",{method:"POST",headers:{apikey:ANON,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL,token:P.email_otp})});
  const vj=await v.json().catch(()=>({}));
  if(!vj.access_token){console.log("  ingresso rifiutato");return;}
  const r=await fetch("http://127.0.0.1:3000/convenzionati/mie-polizze",{method:"POST",headers:{Authorization:"Bearer "+vj.access_token,"Content-Type":"application/json"},body:"{}"});
  console.log("  mie-polizze ->",r.status,(await r.text()).slice(0,120));
})().catch(e=>console.log("  errore:",e.message));
'
sleep 4
echo
echo "== e DOPO? =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,""); const K=env.SUPABASE_SERVICE_ROLE_KEY;
const H={apikey:K,Authorization:"Bearer "+K};
(async()=>{
  const a=await (await fetch(U+"/rest/v1/quote_convenzione_associati?select=email,anagrafica_id&limit=5",{headers:H})).json();
  for(const x of a) console.log("  "+x.email+" | anagrafica:"+(x.anagrafica_id?"SI":"no"));
  const g=await (await fetch(U+"/rest/v1/quote_gruppi?select=nome,tipo&tipo=eq.convenzione",{headers:H})).json();
  console.log("  gruppi di convenzione:", g.length ? g.map(x=>x.nome).join(", ") : "nessuno");
  const c=await (await fetch(U+"/rest/v1/quote_convenzioni?select=nome,gruppo_id",{headers:H})).json();
  for(const x of c) console.log("  convenzione "+x.nome+" -> gruppo:"+(x.gruppo_id?"collegato":"nessuno"));
})().catch(e=>console.log("  errore:",e.message));
'
sleep 3
echo
echo "== il log =="
journalctl -u withus-backend --since '-6 min' --no-pager 2>/dev/null | grep -i 'convenzionati' | tail -6 || true
