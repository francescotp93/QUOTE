#!/usr/bin/env bash
# Il caso di prova: com'era con l'ipotesi al 5,0% e com'e' con la serie Eurostat.
set -u
cd /opt/withus-backend || exit 1
set -a; . ./server/.env; set +a
node -e '
const P = require("/opt/withus-backend/tariffe/motore/previdenza.js");
const M = null;
const url = (process.env.SUPABASE_URL || "https://ekjxrnsfqxnfxzrthdcf.supabase.co").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
fetch(url + "/rest/v1/quote_parametri_previdenziali?select=chiave,valore,derivato", {
  headers: { apikey: key, Authorization: "Bearer " + key },
}).then(r => r.json()).then(righe => {
  const v = {}; const d = {};
  for (const r of righe) { v[r.chiave] = r.valore; d[r.chiave] = r.derivato; }
  const tab = { biennio: "2025-2026", daVerificare: false, perEta: {}, avvisi: [] };
  for (const k of Object.keys(v.coefficienti_trasformazione || {})) tab.perEta[Number(k)] = Number(v.coefficienti_trasformazione[k]);
  const dati = (curva) => ({ eta: 33, etaPensionamento: 67, redditoAnnuo: 24000, anniContributiGia: 9,
    annoRiferimento: 2026, coefficienti: tab, decadimentoCoefficiente: curva,
    requisitiProiettati: v.requisiti_eta_proiettati });
  const vecchia = { obiettivo: 0.05, etaRiferimento: 67, anno: 2060 };
  const prima = P.prospettivaPensionistica(dati(vecchia));
  const dopo = P.prospettivaPensionistica(dati(v.coefficiente_decadimento));
  const e = (n) => Math.round(n).toLocaleString("it-IT") + " EUR";
  console.log("  caso: 33 anni, 24.000 lordi, 9 anni di contributi, uscita a 67 nel 2060");
  console.log("");
  console.log("                          PRIMA (ipotesi 5,0%)   DOPO (Eurostat ponderato)");
  console.log("  coefficiente            " + (prima.coefficienti.usato*100).toFixed(3) + "%".padEnd(16) + "       " + (dopo.coefficienti.usato*100).toFixed(3) + "%");
  console.log("  pensione (euro di oggi) " + e(prima.reale.pensioneMensile).padEnd(22) + " " + e(dopo.reale.pensioneMensile));
  console.log("  tasso di sostituzione   " + prima.tassoSostituzione.toFixed(1) + "%".padEnd(21) + "  " + dopo.tassoSostituzione.toFixed(1) + "%");
  console.log("  divario (euro di oggi)  " + e(prima.reale.gapMensile).padEnd(22) + " " + e(dopo.reale.gapMensile));
  console.log("");
  console.log("  metodo ora:", dopo.coefficienti.decadimento.metodo, "| ponderata:", dopo.coefficienti.decadimento.ponderata);
  console.log("  vita attesa 2025:", dopo.coefficienti.decadimento.speranzaBase.toFixed(3), "-> 2060:", dopo.coefficienti.decadimento.speranzaUscita.toFixed(3), "|", dopo.coefficienti.decadimento.come);
  console.log("  decadimento ancora da verificare:", d.coefficiente_decadimento);
  const req = dopo.avvisi.find(a => /requisito/.test(a));
  console.log("  avviso requisito:", req ? req.slice(0, 100) : "nessuno");
}).catch(e => console.log("  errore:", e.message));
'
