#!/usr/bin/env bash
# La correzione e' su main (PR #67). Due domande: la macchina l'ha presa?
# E adesso un associato VERO viene riconosciuto?
set -u
cd /opt/withus-backend || exit 1
echo "== la macchina ha preso la correzione? =="
git log --oneline -1
grep -c 'rest/v1/quote_convenzione_associati' server/convenzionati.js | sed 's/^/  legge la tabella col token della persona (occorrenze): /'
grep -c 'auth/v1/user' server/convenzionati.js | sed "s/^/  chiede ancora a la porta che rispondeva 403 (deve essere 0): /"
systemctl show withus-backend -p ActiveEnterTimestamp --value | sed 's/^/  backend acceso dalle: /'
date -u '+  adesso sono le:            %a %Y-%m-%d %H:%M:%S UTC'
echo
echo "== un associato vero viene riconosciuto? =="
# Si entra come l'associato di prova (withus.coop@gmail.com, il nostro),
# si chiede al backend di cambiare la password con una CHE NON VA BENE.
# Cosi' non si cambia niente: se risponde «troppo corta» vuol dire che
# l'ha riconosciuto; se risponde «rientra» siamo di nuovo al punto di prima.
node -e '
const fs=require("fs");
const env={}; for(const r of fs.readFileSync("server/.env","utf8").split(/\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(r); if(m) env[m[1]]=m[2].trim().replace(/^["\x27]|["\x27]$/g,"");}
const U=(env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,"");
const K=env.SUPABASE_SERVICE_ROLE_KEY;
const ANON=env.SUPABASE_ANON_KEY || (fs.readFileSync("server/convenzionati.js","utf8").match(/eyJ[A-Za-z0-9._-]+/)||[])[0];
const EMAIL="withus.coop@gmail.com";
(async()=>{
  const g=await fetch(U+"/auth/v1/admin/generate_link",{method:"POST",headers:{apikey:K,Authorization:"Bearer "+K,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL})});
  if(!g.ok){console.log("  non riesco a entrare come lui:",g.status,(await g.text()).slice(0,140));return;}
  const j=await g.json();
  const th=j.hashed_token||(j.properties&&j.properties.hashed_token);
  if(!th){console.log("  nessun codice di ingresso nella risposta");return;}
  const v=await fetch(U+"/auth/v1/verify",{method:"POST",headers:{apikey:ANON,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",token:th})});
  const vj=await v.json().catch(()=>({}));
  if(!vj.access_token){console.log("  ingresso rifiutato:",v.status,JSON.stringify(vj).slice(0,140));return;}
  console.log("  sono entrato come l\x27associato di prova: si\x27");
  const r=await fetch("http://127.0.0.1:3000/convenzionati/mia-password",{method:"POST",headers:{Authorization:"Bearer "+vj.access_token,"Content-Type":"application/json"},body:JSON.stringify({password:"abc"})});
  const t=await r.text();
  console.log("  il backend risponde:",r.status,t.slice(0,160));
  console.log(r.status===400 ? "  ==> RICONOSCIUTO (rifiuta la password, non la persona)" : "  ==> ANCORA NO");
})().catch(e=>console.log("  errore:",e.message));
'
sleep 3
echo
echo "== il log dice ancora «accesso non riconosciuto»? =="
journalctl -u withus-backend --since '-10 min' --no-pager 2>/dev/null | grep -i 'convenzionati' | tail -8 || echo "  (niente: nessun rifiuto negli ultimi 10 minuti)"
