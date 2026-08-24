#!/usr/bin/env bash
# VERIFICA DI SICUREZZA (sola lettura): ogni segreto salvato nello store vivo
# e' nel formato cifrato v1: ? NON stampa MAI un valore — solo conteggi e, se
# qualcosa non e' v1:, il NOME del campo. Serve a chiudere il Punto 1.
set -u
node -e '
const fs=require("fs");
const p=process.env.FONTI_STORE || "/opt/withus-backend/server/fonti.store.json";
let d; try{ d=JSON.parse(fs.readFileSync(p,"utf8")); }catch(e){ console.log("STORE non leggibile a "+p+": "+e.message); process.exit(0); }
const SEG=["username","password","totp","totpSecret","totp_secret","otp_secret","otpSecret","secret_totp","otp","proxy","pass"];
let v1=0, vuoti=0, altro=0; const problemi=[];
(function scan(o,path){
  if(!o || typeof o!=="object") return;
  for(const k of Object.keys(o)){
    const val=o[k];
    if(SEG.includes(k)){
      if(val===""||val==null) vuoti++;
      else if(typeof val==="string" && val.startsWith("v1:")) v1++;
      else { altro++; problemi.push((path?path+".":"")+k); }
    } else if(val && typeof val==="object") scan(val,(path?path+".":"")+k);
  }
})(d,"");
console.log("segreti cifrati v1:", v1, "| campi vuoti:", vuoti, "| NON-v1:", altro);
if(problemi.length) console.log("ATTENZIONE, campi non-v1 (solo NOME, mai il valore):", problemi.join(", "));
else console.log("OK: tutti i segreti salvati sono v1: (o vuoti). Niente in chiaro.");
'
echo "(fine)"
