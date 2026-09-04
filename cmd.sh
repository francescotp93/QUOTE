#!/usr/bin/env bash
# Con la tabella dei requisiti popolata, l'avviso scatta davvero?
set -u
cd /opt/withus-backend/server || exit 1
set -a; . ./.env; set +a
git -C /opt/withus-backend log --oneline -1
node --input-type=module -e '
const M = await import("/opt/withus-backend/server/parametriPrevidenziali.js");
const { valori, schede } = await M.leggiParametri();
const req = valori.requisiti_eta_proiettati || {};
console.log("  requisiti in tabella:", Object.keys(req).length, "anni | 2060 ->", req["2060"]);
console.log("  marcato da verificare:", schede.requisiti_eta_proiettati.derivato);
const avv = M.avvisiSuiParametri(schede, M.CHIAVI_USATE);
console.log("  avvisi sul foglio ora:", avv.length);
for (const a of avv) console.log("    -", a.slice(0,95));
'
