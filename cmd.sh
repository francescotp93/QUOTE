#!/usr/bin/env bash
# Mette in tabella la serie di speranza di vita e i pesi, con le edizioni.
set -u
cd /opt/withus-backend || exit 1
set -a; . ./server/.env; set +a
if [ ! -f decadimento.json ]; then echo "  il file non e' ancora arrivato"; exit 0; fi
node -e '
const fs = require("fs");
const par = JSON.parse(fs.readFileSync("/opt/withus-backend/decadimento.json", "utf8"));
const url = (process.env.SUPABASE_URL || "https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const riga = {
  valore: par,
  fonte: "Serie: Eurostat EUROPOP2025 (proj_25nalexp), speranza di vita a 67 anni per sesso, scenario baseline, Italia, aggiornato 11/06/2026. Pesi: Istat, Previsioni della popolazione base 1/1/2025 (DCIS_PREVDEM1), popolazione a 67 anni per sesso, scenario mediano, pubblicazione 02/09/2026. Estrazione del 04/09/2026.",
  nota: "METODO: coefficiente(anno) = coefficiente(annoBase) x e67(annoBase) / e67(anno). La serie per sesso viene ponderata con la popolazione proiettata alla stessa eta, anno per anno e non con un peso fisso: la composizione fra uomini e donne a 67 anni cambia nel tempo e verso il 2060 si inverte. AVVERTENZA DOVUTA, e stampata sul foglio: i coefficienti ufficiali incorporano anche un tasso di sconto e la reversibilita, quindi la proporzionalita alla sola speranza di vita e una approssimazione dichiarata, non il metodo di legge. CONTROLLO: la e67 ponderata del 2025 vale 19,716 contro 19,729 delle tavole di mortalita Istat osservate. Le previsioni si rivedono ogni anno: qui sono salvate edizione e data di estrazione perche un foglio vecchio resti ricostruibile.",
  derivato: false,
  aggiornato_il: "2026-09-04",
  ricontrolla_il: "2027-09-01",
};
fetch(url + "/rest/v1/quote_parametri_previdenziali?chiave=eq.coefficiente_decadimento", {
  method: "PATCH",
  headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" },
  body: JSON.stringify(riga),
}).then(r => r.text()).then(t => {
  console.log("  risposta:", t.slice(0, 90));
  console.log("  anni nella serie:", Object.keys(par.speranzaDiVita).length, "| pesi:", Object.keys(par.pesi).length);
}).catch(e => console.log("  errore:", e.message));
'
