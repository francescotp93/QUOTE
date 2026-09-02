#!/usr/bin/env bash
# Un associato VERO viene riconosciuto adesso? (il tentativo di prima ha
# sbagliato il modo di entrare, non ha risposto alla domanda)
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
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
  const j=await g.json(); const P=j.properties||j;
  // Due strade: il codice a cifre (con la email) oppure il gettone gia\x27 cifrato (da solo, in GET).
  let at=null, come="";
  if(P.email_otp){
    const v=await fetch(U+"/auth/v1/verify",{method:"POST",headers:{apikey:ANON,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:EMAIL,token:P.email_otp})});
    const vj=await v.json().catch(()=>({})); if(vj.access_token){at=vj.access_token;come="col codice";}
    else console.log("  col codice:",v.status,JSON.stringify(vj).slice(0,120));
  }
  if(!at && P.hashed_token){
    const v=await fetch(U+"/auth/v1/verify?type=magiclink&token="+encodeURIComponent(P.hashed_token)+"&redirect_to=http://127.0.0.1/x",{redirect:"manual",headers:{apikey:ANON}});
    const loc=v.headers.get("location")||"";
    const m=/access_token=([^&]+)/.exec(loc); if(m){at=decodeURIComponent(m[1]);come="col gettone";}
    else console.log("  col gettone:",v.status,loc.slice(0,120));
  }
  if(!at){console.log("  ==> non sono riuscito a entrare come lui: la prova non dice niente");return;}
  console.log("  sono entrato come l\x27associato di prova ("+come+")");
  const r=await fetch("http://127.0.0.1:3000/convenzionati/mia-password",{method:"POST",headers:{Authorization:"Bearer "+at,"Content-Type":"application/json"},body:JSON.stringify({password:"abc"})});
  const t=await r.text();
  console.log("  il backend risponde:",r.status,t.slice(0,160));
  console.log(r.status===400 ? "  ==> RICONOSCIUTO (rifiuta la password, non la persona)" : "  ==> ANCORA NO");
})().catch(e=>console.log("  errore:",e.message));
'
sleep 4
echo
echo "== il log =="
journalctl -u withus-backend --since '-6 min' --no-pager 2>/dev/null | grep -i 'convenzionati' | tail -6 || true
