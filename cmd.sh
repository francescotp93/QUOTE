#!/usr/bin/env bash
# L'imposta sostitutiva sul TFR entra in tabella con la sua norma.
set -u
cd /opt/withus-backend/server || exit 1
set -a; . ./.env; set +a
node -e '
const url=(process.env.SUPABASE_URL||"https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/,"");
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const riga={
  chiave:"imposta_sostitutiva_tfr",
  etichetta:"Imposta sostitutiva sulla rivalutazione del TFR",
  valore:0.17, unita:"frazione",
  fonte:"Art. 11 c. 3 D.Lgs. 47/2000, come modificato dalla L. 190/2014 art. 1 c. 623, in vigore dal 1 gennaio 2015",
  nota:"Si applica ogni anno alla rivalutazione del TFR lasciato in azienda. Fino al 2014 era l 11 per cento: la nota storica sta nel commento del motore, non nella fonte che legge il cliente.",
  derivato:false, aggiornato_il:"2026-09-04", ricontrolla_il:"2027-02-15"
};
fetch(url+"/rest/v1/quote_parametri_previdenziali",{
  method:"POST",
  headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},
  body:JSON.stringify(riga)
}).then(r=>r.text().then(t=>console.log("  scrittura:",r.status,r.ok?"riuscita":"FALLITA",t.slice(0,120))))
 .catch(e=>console.log("  errore:",e.message));
'
