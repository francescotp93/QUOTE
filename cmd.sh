#!/usr/bin/env bash
# Per ogni portale: ha username? ha password? ha il segreto TOTP (2FA)?
# NON stampa nessun valore — solo si'/no. Serve a distinguere "manca il segreto"
# da "login rotto". Legge lo store cifrato in sola lettura.
set -u
node -e '
const fs=require("fs");
const p=process.env.FONTI_STORE || "/opt/withus-backend/server/fonti.store.json";
let d; try{ d=JSON.parse(fs.readFileSync(p,"utf8")); }catch(e){ console.log("store illeggibile: "+e.message); process.exit(0); }
const TOTP=["totp","totpSecret","totp_secret","otp_secret","otpSecret","secret_totp","otp"];
const si=v=>!!(v && String(v).length);
function riga(id, s){
  s=s||{};
  const u=si(s.username), pw=si(s.password);
  const t=TOTP.some(k=>si(s[k]));
  console.log("  "+id.padEnd(14)+" utente:"+(u?"si":"NO ")+"  password:"+(pw?"si":"NO ")+"  2FA:"+(t?"si":"NO "));
}
// built-in (chiavi diverse) + custom
const noti=["allianz","axa","hdi","groupama","kube","quotiamo","assieasy","24h","italiana","prima"];
for(const id of noti){ if(d[id]) riga(id, d[id]); }
const cs=d.__custom||{};
for(const id of Object.keys(cs)){ riga("c:"+id, cs[id]); }
// segnalo anche eventuali id presenti che non ho elencato
for(const k of Object.keys(d)){ if(k.startsWith("__")||noti.includes(k)) continue; if(typeof d[k]==="object") riga(k, d[k]); }
'
echo "(fine)"
