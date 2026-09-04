#!/usr/bin/env bash
# I cinque parametri nuovi arrivano davvero alla schermata?
set -u
cd /opt/withus-backend/server || exit 1
set -a; . ./.env; set +a
git -C /opt/withus-backend log --oneline -1
node --input-type=module -e '
const M = await import("/opt/withus-backend/server/parametriPrevidenziali.js");
const { valori, schede } = await M.leggiParametri();
const avv = M.avvisiSuiParametri(schede, M.CHIAVI_USATE);
for (const k of ["inflazione_attesa","crescita_reale_reddito","crescita_reale_pil","coefficiente_decadimento","requisiti_eta_proiettati"]) {
  const v = valori[k];
  console.log(" ", k.padEnd(28), JSON.stringify(v), schede[k] && schede[k].derivato ? "(da verificare)" : "");
}
console.log("  avvisi che finiranno sul foglio:", avv.length);
for (const a of avv) console.log("    -", a.slice(0,110));
'
