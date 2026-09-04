#!/usr/bin/env bash
# I due parametri nuovi arrivano alla schermata, con i loro avvisi?
set -u
cd /opt/withus-backend/server || exit 1
set -a; . ./.env; set +a
node --input-type=module -e '
const m = await import("/opt/withus-backend/server/parametriPrevidenziali.js");
const { valori, schede, daConfermare } = await m.leggiParametri();
console.log("coefficiente_rendita_fondo:", JSON.stringify(valori.coefficiente_rendita_fondo));
console.log("tipo_prodotto:", JSON.stringify(valori.tipo_prodotto));
console.log("marcati:", JSON.stringify(daConfermare));
console.log("--- avvisi ---");
for (const a of m.avvisiSuiParametri(schede, m.CHIAVI_USATE)) console.log(" · " + a);
'
