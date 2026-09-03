#!/usr/bin/env bash
# Controllo finale: la catena regge dal database fino al foglio del cliente?
set -u
cd /opt/withus-backend/server || exit 1
set -a; . ./.env; set +a
git -C /opt/withus-backend log --oneline -1
node --input-type=module -e '
const M = await import("/opt/withus-backend/server/parametriPrevidenziali.js");
const { valori, schede } = await M.leggiParametri();
const avv = M.avvisiSuiParametri(schede, M.CHIAVI_USATE);
const t = M.tabellaCoefficienti(valori, schede, avv);
console.log("  periodo dichiarato:", t.biennio);
console.log("  a 67 anni:", t.perEta[67], "| decreto:", t.perEta[67] === 0.05608 ? "combacia" : "NON COMBACIA");
console.log("  fonte:", String(t.fonte).slice(0, 70));
console.log("  avvisi che finiranno sul foglio:", avv.length);
' 
