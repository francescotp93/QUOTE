#!/usr/bin/env bash
# Ultima domanda: dopo aver mandato il codice utente, Allianz dice PERCHE' non
# va avanti, o rimanda in silenzio? Esce solo il testo della pagina, gia'
# ripulito dal codice (codice fiscale, targa, date, email, telefoni mascherati).
# Il nome utente sta nel valore di un input e non entra nel testo della pagina.
curl -s -m 120 http://127.0.0.1:4200/otpdump | node -e '
  let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
    let j; try{ j=JSON.parse(s);}catch{ console.log("(non JSON)"); return; }
    const d=j.dump||{};
    console.log("dopo:", (j.after||"").slice(0,200));
    console.log("ripulito:", d.ripulito===true);
    console.log("--- testo della pagina ---");
    console.log((d.text||"(vuoto)").slice(0,1200));
  });'
