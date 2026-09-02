#!/usr/bin/env bash
# Le polizze e il rinnovo: la macchina l'ha presa, e la regola tiene?
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
date -u '+  adesso sono le:            %a %Y-%m-%d %H:%M:%S UTC'
echo
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
  const r=await fetch("http://127.0.0.1:3000/convenzionati/mie-polizze",{method:"POST",headers:{Authorization:"Bearer "+vj.access_token,"Content-Type":"application/json"},body:"{}"});
  const t=await r.text();
  console.log("  mie-polizze ->",r.status,t.slice(0,200));
  let ok=false; try{ ok = Array.isArray(JSON.parse(t).polizze); }catch(e){}
  console.log(r.status===200 && ok ? "  ==> la rotta e\x27 viva e risponde con un elenco" : "  ==> da guardare");
  // Se ci fosse un rinnovo, nessuno di quelli spenti deve comparire.
  try{ const d=JSON.parse(t); const brutti=(d.polizze||[]).filter(p=>p.rinnovo && p.rinnovo.attivo!==undefined);
    console.log(brutti.length ? "  !! arriva anche il campo attivo: non dovrebbe" : "  ==> nessun campo che non deve uscire"); }catch(e){}
})().catch(e=>console.log("  errore:",e.message));
'
sleep 4
echo
echo "== il vincolo del database tiene? =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,"");
const K=env.SUPABASE_SERVICE_ROLE_KEY;
(async()=>{
  const p=await (await fetch(U+"/rest/v1/quote_polizze?select=id&limit=1",{headers:{apikey:K,Authorization:"Bearer "+K}})).json();
  if(!p.length){console.log("  nessuna polizza su cui provare");return;}
  // Acceso ma senza importo ne modo di pagare: il database deve dire di no.
  const r=await fetch(U+"/rest/v1/quote_rinnovi",{method:"POST",headers:{apikey:K,Authorization:"Bearer "+K,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({polizza_id:p[0].id,attivo:true})});
  const t=await r.text();
  console.log("  rinnovo acceso e vuoto ->",r.status,t.slice(0,140));
  console.log(r.status>=400 ? "  ==> il database lo rifiuta, come deve" : "  !! LO HA ACCETTATO: il vincolo non tiene");
  if(r.ok){ const id=JSON.parse(t)[0].id; await fetch(U+"/rest/v1/quote_rinnovi?id=eq."+id,{method:"DELETE",headers:{apikey:K,Authorization:"Bearer "+K}}); console.log("  (tolto)"); }
})().catch(e=>console.log("  errore:",e.message));
'
sleep 3
echo
echo "== il log =="
journalctl -u withus-backend --since '-8 min' --no-pager 2>/dev/null | grep -i 'convenzionati' | tail -6 || true
