#!/usr/bin/env bash
# La residenza: la sua accanto alla nostra, e la nostra non si muove.
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
date -u '+  adesso sono le:            %a %Y-%m-%d %H:%M:%S UTC'
echo
if ! grep -q "residenzaDaScrivere" server/convenzionati.js; then
  echo "  LA MACCHINA NON HA ANCORA IL CODICE NUOVO: non provo niente."
  echo "  (girare adesso vorrebbe dire sovrascrivere di nuovo l\'indirizzo)"
  exit 0
fi
echo "  il codice nuovo c\'e\': si puo\' provare"
echo
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,""); const K=env.SUPABASE_SERVICE_ROLE_KEY;
const ANON=env.SUPABASE_ANON_KEY || (fs.readFileSync("server/convenzionati.js","utf8").match(/eyJ[A-Za-z0-9._-]+/)||[])[0];
const H={apikey:K,Authorization:"Bearer "+K};
const EMAIL="withus.coop@gmail.com";
const ID="ab25a761-bc0a-482a-bf56-941c39be6fd7";
const leggi=async()=> (await (await fetch(U+"/rest/v1/quote_anagrafiche?id=eq."+ID+"&select=indirizzo,civico,cap,comune,res_dich_indirizzo,res_dich_cap,res_dich_comune,res_dich_il,note",{headers:H})).json())[0];
const riga=a=>"  nostra: "+[a.indirizzo,a.civico,a.cap,a.comune].filter(Boolean).join(" ")+"\n  sua:    "+[a.res_dich_indirizzo,a.res_dich_cap,a.res_dich_comune].filter(Boolean).join(" ")+(a.res_dich_il?" (detta il "+new Date(a.res_dich_il).toLocaleDateString("it-IT")+")":" —");
(async()=>{
  console.log("== PRIMA =="); console.log(riga(await leggi()));
  const g=await fetch(U+"/auth/v1/admin/generate_link",{method:"POST",headers:{...H,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL})});
  const J=await g.json().catch(()=>({})); const P=J.properties||J||{};
  if(!P.email_otp){console.log("  non riesco a entrare come lui");return;}
  const v=await fetch(U+"/auth/v1/verify",{method:"POST",headers:{apikey:ANON,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL,token:P.email_otp})});
  const vj=await v.json().catch(()=>({}));
  if(!vj.access_token){console.log("  ingresso rifiutato");return;}
  const HH={Authorization:"Bearer "+vj.access_token,"Content-Type":"application/json"};

  console.log("\n== SCRIVE UNA RESIDENZA ANCORA DIVERSA ==");
  const r=await fetch("http://127.0.0.1:3000/convenzionati/salva-anagrafica",{method:"POST",headers:HH,body:JSON.stringify({
    indirizzo:"via Marsala", civico:"12", cap:"91100", comune:"Trapani", provincia:"TP", cellulare:"3924649820"})});
  const t=await r.text();
  let j={}; try{ j=JSON.parse(t); }catch(e){}
  console.log("  ->",r.status,"| residenza da verificare:", j.residenzaDaVerificare);
  const a=await leggi();
  console.log("\n== DOPO =="); console.log(riga(a));
  console.log("  ==>", (a.indirizzo==="Via Giovanbattista Fardella" ? "la NOSTRA non si e\x27 mossa" : "!! la nostra e\x27 cambiata"));
  console.log("  ==>", (a.res_dich_indirizzo==="via Marsala" ? "la SUA e\x27 quella nuova, intera" : "!! da guardare"));
})().catch(e=>console.log("  errore:",e.message));
'
sleep 5
echo
echo "== il log =="
journalctl -u withus-backend --since '-6 min' --no-pager 2>/dev/null | grep -i 'convenzionati' | tail -5 || true
