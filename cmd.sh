#!/usr/bin/env bash
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
if ! grep -q "mio-allegato-link" server/convenzionati.js; then
  echo "  LA MACCHINA NON HA ANCORA IL CODICE NUOVO: non provo niente."
  exit 0
fi
echo "  il codice nuovo c'e'"
echo
for r in mia-richiesta mio-messaggio mio-allegato mio-allegato-link; do
  code=$(curl -s -o /tmp/r.txt -w '%{http_code}' -X POST http://127.0.0.1:3000/convenzionati/$r -H 'content-type: application/json' -d '{}')
  ok=$(grep -c "Serve un accesso" /tmp/r.txt || true)
  echo "  /$r -> $code $([ "$code" = "401" ] && [ "$ok" = "1" ] && echo '(montata e protetta)' || echo '(DA GUARDARE)')"
done
echo
echo "== con un associato vero: vede solo il suo, e non le note interne =="
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,""); const K=env.SUPABASE_SERVICE_ROLE_KEY;
const ANON=env.SUPABASE_ANON_KEY || (fs.readFileSync("server/convenzionati.js","utf8").match(/eyJ[A-Za-z0-9._-]+/)||[])[0];
const H={apikey:K,Authorization:"Bearer "+K,"Content-Type":"application/json"};
const EMAIL="withus.coop@gmail.com";
(async()=>{
  const rr=await (await fetch(U+"/rest/v1/quote_convenzione_richieste?select=id,prodotto_nome&limit=1",{headers:H})).json();
  if(!rr.length){console.log("  nessuna richiesta su cui provare");return;}
  const RID=rr[0].id;
  // Una nota INTERNA e una VISIBILE sulla stessa richiesta: solo la seconda deve arrivargli.
  await fetch(U+"/rest/v1/quote_richiesta_messaggi",{method:"POST",headers:{...H,Prefer:"return=minimal"},body:JSON.stringify([
    {fonte:"convenzione",riferimento:RID,testo:"PROVA-INTERNA-non-deve-uscire",interno:true,autore_nome:"prova"},
    {fonte:"convenzione",riferimento:RID,testo:"PROVA-VISIBILE-deve-uscire",interno:false,autore_nome:"prova"}])});
  const g=await fetch(U+"/auth/v1/admin/generate_link",{method:"POST",headers:H,body:JSON.stringify({type:"magiclink",email:EMAIL})});
  const J=await g.json().catch(()=>({})); const P=J.properties||J||{};
  if(!P.email_otp){console.log("  non riesco a entrare come lui");return;}
  const v=await fetch(U+"/auth/v1/verify",{method:"POST",headers:{apikey:ANON,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL,token:P.email_otp})});
  const vj=await v.json().catch(()=>({}));
  if(!vj.access_token){console.log("  ingresso rifiutato");return;}
  const HH={Authorization:"Bearer "+vj.access_token,"Content-Type":"application/json"};
  const r=await fetch("http://127.0.0.1:3000/convenzionati/mia-richiesta",{method:"POST",headers:HH,body:JSON.stringify({id:RID})});
  const t=await r.text();
  console.log("  mia-richiesta ->",r.status);
  console.log("  contiene la VISIBILE:", t.includes("PROVA-VISIBILE-deve-uscire"));
  console.log("  contiene la INTERNA :", t.includes("PROVA-INTERNA-non-deve-uscire"), t.includes("PROVA-INTERNA-non-deve-uscire") ? "  !! ESCE E NON DEVE" : "  <- giusto");
  // Una richiesta che non e' sua.
  const x=await fetch("http://127.0.0.1:3000/convenzionati/mia-richiesta",{method:"POST",headers:HH,body:JSON.stringify({id:"00000000-0000-0000-0000-000000000000"})});
  console.log("  una richiesta non sua ->",x.status,(await x.text()).slice(0,60));
  // Pulizia: le due righe di prova non restano.
  await fetch(U+"/rest/v1/quote_richiesta_messaggi?autore_nome=eq.prova&riferimento=eq."+RID,{method:"DELETE",headers:H});
  console.log("  (righe di prova rimosse)");
})().catch(e=>console.log("  errore:",e.message));
'
sleep 5
echo
echo "== il log =="
journalctl -u withus-backend --since '-6 min' --no-pager 2>/dev/null | grep -i 'convenzionati' | tail -5 || true
