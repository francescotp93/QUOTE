#!/usr/bin/env bash
# I numeri di legge arrivano davvero dalla tabella, e nella forma giusta?
set -u
cd /opt/withus-backend/server || exit 1
set -a; . ./.env; set +a
node --input-type=module -e '
const M = await import("/opt/withus-backend/server/parametriPrevidenziali.js");
const { valori, schede } = await M.leggiParametri();
console.log("  righe lette dalla tabella:", Object.keys(valori).length);
const avv = M.avvisiSuiParametri(schede, M.CHIAVI_USATE);
console.log("  avvisi oggi:", avv.length ? avv.join(" | ").slice(0,240) : "nessuno");
const t = M.tabellaCoefficienti(valori, schede, avv);
if (!t) { console.log("  !! nessuna tabella: la schermata userebbe la copia di riserva"); }
else {
  const eta = Object.keys(t.perEta).map(Number).sort((a,b)=>a-b);
  console.log("  eta coperte:", eta[0], "-", eta[eta.length-1]);
  console.log("  chiavi numeriche (non stringhe):", eta.every(Number.isFinite));
  console.log("  a 67 anni:", t.perEta[67], "| combacia col decreto:", t.perEta[67] === 0.05608);
  console.log("  daVerificare:", t.daVerificare, "| biennio:", t.biennio);
  console.log("  fonte:", String(t.fonte).slice(0,70));
}
console.log("  tetto deducibilita:", valori.tetto_deducibilita);
console.log("  aliquota dipendenti:", (valori.aliquote_computo||{}).dipendenti_privati);
console.log("  tassazione base:", (valori.tassazione_prestazione||{}).aliquotaBase);
'
