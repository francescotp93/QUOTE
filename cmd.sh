#!/usr/bin/env bash
# L'unione dell'anagrafica: funziona davvero, sui dati veri?
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
date -u '+  adesso sono le:            %a %Y-%m-%d %H:%M:%S UTC'
echo
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,""); const K=env.SUPABASE_SERVICE_ROLE_KEY;
const ANON=env.SUPABASE_ANON_KEY || (fs.readFileSync("server/convenzionati.js","utf8").match(/eyJ[A-Za-z0-9._-]+/)||[])[0];
const H={apikey:K,Authorization:"Bearer "+K};
const EMAIL="withus.coop@gmail.com";
const mostra=async(q)=>{ const r=await fetch(U+q,{headers:H}); return r.json(); };
(async()=>{
  const prima=await mostra("/rest/v1/quote_convenzione_associati?email=eq."+EMAIL+"&select=anagrafica_id");
  console.log("== PRIMA ==");
  console.log("  la sua scheda e\x27:", prima[0] && prima[0].anagrafica_id);
  const vere=await mostra("/rest/v1/quote_anagrafiche?codice_fiscale=eq.NGZNTN87T11D423V&select=id,nominativo,email,note");
  for(const a of vere) console.log("  in archivio:", a.id, "|", a.nominativo, "|", a.email);

  const g=await fetch(U+"/auth/v1/admin/generate_link",{method:"POST",headers:{...H,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL})});
  const J=await g.json().catch(()=>({})); const P=J.properties||J||{};
  if(!P.email_otp){console.log("  non riesco a entrare come lui");return;}
  const v=await fetch(U+"/auth/v1/verify",{method:"POST",headers:{apikey:ANON,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL,token:P.email_otp})});
  const vj=await v.json().catch(()=>({}));
  if(!vj.access_token){console.log("  ingresso rifiutato");return;}
  const HH={Authorization:"Bearer "+vj.access_token,"Content-Type":"application/json"};

  console.log("\n== SALVA I SUOI DATI, come ha fatto lui ==");
  const body={cognome:"Anguzza",nome:"Antonio",codice_fiscale:"NGZNTN87T11D423V",data_nascita:"1987-12-11",
              indirizzo:"vico giunone",civico:"3",cap:"91027",comune:"paceco",provincia:"tp",
              cellulare:"3924649820",email:"withus.coop@gmail.com"};
  const r=await fetch("http://127.0.0.1:3000/convenzionati/salva-anagrafica",{method:"POST",headers:HH,body:JSON.stringify(body)});
  const t=await r.text();
  console.log("  ->",r.status,t.slice(0,220));

  console.log("\n== DOPO ==");
  const dopo=await mostra("/rest/v1/quote_convenzione_associati?email=eq."+EMAIL+"&select=anagrafica_id");
  console.log("  la sua scheda adesso e\x27:", dopo[0] && dopo[0].anagrafica_id);
  console.log("  ==>", (prima[0]||{}).anagrafica_id !== (dopo[0]||{}).anagrafica_id ? "UNITA a quella in archivio" : "non e\x27 cambiata");
  const a2=await mostra("/rest/v1/quote_anagrafiche?codice_fiscale=eq.NGZNTN87T11D423V&select=id,nominativo,indirizzo,comune,cap,note");
  for(const a of a2){ console.log("  scheda:", a.nominativo, "|", a.indirizzo, a.cap, a.comune);
    if(a.note) console.log("  note:", String(a.note).replace(/\n/g," ").slice(0,200)); }
  const pol=await mostra("/rest/v1/quote_polizze?cliente_id=eq."+((dopo[0]||{}).anagrafica_id)+"&select=id");
  const prev=await mostra("/rest/v1/quote_preventivi?cliente_id=eq."+((dopo[0]||{}).anagrafica_id)+"&select=id");
  console.log("  adesso vede:", (pol.length||0)+" polizze,", (prev.length||0)+" preventivi");
  const dop=await mostra("/rest/v1/quote_anagrafiche?id=eq.52e74723-2321-4a96-b65c-281aefd950fb&select=id");
  console.log("  la scheda doppia:", dop.length ? "c\x27e\x27 ancora" : "rimossa");
  const gm=await mostra("/rest/v1/quote_gruppi_membri?anagrafica_id=eq."+((dopo[0]||{}).anagrafica_id)+"&select=gruppo_id");
  console.log("  nel gruppo:", gm.length ? "si\x27" : "NO");
})().catch(e=>console.log("  errore:",e.message));
'
sleep 6
echo
echo "== il log =="
journalctl -u withus-backend --since '-6 min' --no-pager 2>/dev/null | grep -i 'convenzionati' | tail -6 || true
