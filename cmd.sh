#!/usr/bin/env bash
# Il motore della pensione e' arrivato sulla macchina, e si ferma quando deve?
set -u
cd /opt/withus-backend || exit 1
git log --oneline -1
if [ ! -f server/pensione.js ]; then echo "  non ancora arrivato"; exit 0; fi
node --input-type=module -e '
import("/opt/withus-backend/server/pensione.js").then(P=>{
  console.log("  esporta:", Object.keys(P).length, "voci");
  console.log("  parametri da farsi dare:", P.PARAMETRI_RICHIESTI.length);
  const senzaValore = P.PARAMETRI_RICHIESTI.every(p => !("valore" in p));
  console.log("  nessuno ha un valore dentro:", senzaValore);
  try { P.pensioneAnnua({montante:300000}); console.log("  !! senza coefficiente ha risposto lo stesso"); }
  catch(e){ console.log("  senza coefficiente si ferma:", e.message.slice(0,70)); }
  try { P.pensioneAnnua({montante:300000, coefficiente:5}); console.log("  !! ha accettato 5 come coefficiente"); }
  catch(e){ console.log("  un 5 al posto di 0.05 si ferma:", e.message.slice(0,70)); }
  const v = P.pensioneAnnua({montante:300000, coefficiente:0.05});
  console.log("  con un coefficiente finto (0,05): ", v, v===15000 ? "<- il conto torna" : "<- DA GUARDARE");
}).catch(e=>console.log("  non carica:", e.message));
'
sleep 3
