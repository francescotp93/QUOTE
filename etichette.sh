#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Le due schermate hanno gli stessi campi: un solo input type=text (id=nffc) e
# un pulsante loginButton2. Manca l'informazione che decide tutto: che cosa
# CHIEDE quel campo nella seconda schermata.
#
# Qui escono SOLO i testi di label, button e titolo — cioe' le etichette
# dell'interfaccia. Nessun valore di campo, quindi nessuna credenziale: il nome
# utente sta in un input e resta dentro.
#
# Aspetta anche piu' a lungo dopo l'invio: la pagina NetIQ si ridisegna via
# JavaScript, e 1,5 secondi potrebbero non bastare (sarebbe una spiegazione
# alternativa dei campi identici, e va esclusa).
# ─────────────────────────────────────────────────────────────────────────────
cat > /tmp/etichette.mjs <<'JS'
const base = 'http://127.0.0.1:4200';
const j = async (p) => {
  const r = await fetch(base + p);
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { _grezzo: t.slice(0, 300) }; }
};

// Solo etichette: label, button, titolo. I valori degli input non si toccano.
function etichette(d) {
  const c = (d && d.ctrls) || [];
  const fuori = [];
  for (const x of c) {
    if (!['label', 'button', 'a'].includes(x.tag)) continue;
    if (!x.text || x.text === '••••') continue;
    fuori.push(`${x.tag}${x.id ? '#' + x.id : ''}: ${x.text}`);
  }
  return fuori;
}

const uno = await j('/logindump');
console.log('— SCHERMATA 1 —');
console.log('titolo:', (uno.title || '').slice(0, 120));
etichette(uno).forEach(r => console.log('   ' + r));

const due = await j('/otpdump');
console.log('\n— SCHERMATA 2 —');
console.log('da: ', (due.before || '').slice(0, 100));
console.log('a:  ', (due.after || '').slice(0, 200));
const d2 = due.dump || {};
console.log('titolo:', (d2.title || '').slice(0, 120));
etichette(d2).forEach(r => console.log('   ' + r));
JS

echo "### ETICHETTE DELLE DUE SCHERMATE ###"
node /tmp/etichette.mjs 2>&1 | head -60
rm -f /tmp/etichette.mjs

echo; echo "### IL CAMPO SI RIDISEGNA DOPO QUALCHE SECONDO? ###"
# Se dopo 8 secondi comparisse un input[type=password], la spiegazione sarebbe
# "la pagina era ancora in caricamento" e non "il campo viene riusato".
sleep 8
curl -s -m 60 http://127.0.0.1:4200/logindump | node -e '
  let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
    let j; try{ j=JSON.parse(s);}catch{ console.log("(non JSON)"); return; }
    console.log("url ora:", (j.url||"").slice(0,140));
    const p=(j.ctrls||[]).filter(x=>x.type==="password");
    console.log("campi password presenti adesso:", p.length);
  });'
