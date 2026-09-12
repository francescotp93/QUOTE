// ═══════════════════════════════════════════════════════════════════════════════
//  PENSIONE — le prove del foglio in PDF  (12/09/2026)
//
//  Il PDF è l'unica cosa di questo modulo che esce di casa. Il consulente lo
//  manda su WhatsApp e poi non lo riguarda: se è impaginato male, il cliente
//  vede un titolo in fondo a una pagina col suo contenuto in quella dopo, o due
//  colonne una sopra l'altra, e il documento sembra rotto — anche quando i
//  numeri sono giusti.
//
//  COME SI PROVA UN'IMPAGINAZIONE SENZA APRIRE UN PDF. Qui `jsPDF` è finto: un
//  oggetto che non disegna niente e si limita a SEGNARE, per ogni stringa, su
//  quale pagina e a quale altezza è finita. Non serve a controllare che il file
//  sia valido — a quello ci pensa l'ultima prova, con la libreria vera quando
//  è installata — serve a controllare le REGOLE di impaginazione, che sono
//  quelle che si rompono per davvero quando si cambia una frase.
//
//  Le regole che devono restare vere:
//
//    1. UN TITOLO NON RESTA SOLO. Il titolo di sezione sta sulla stessa pagina
//       del suo primo blocco. È il guasto che si vede a colpo d'occhio.
//    2. I DUE ELENCHI AFFIANCATI NON SI SPEZZANO. Si disegnano colonna per
//       colonna ripartendo dalla stessa altezza: se il salto pagina cade in
//       mezzo, la seconda colonna finisce SOPRA la prima.
//    3. NIENTE ESCE DAL FOGLIO. Nessuna riga sotto il margine basso.
//    4. QUELLO CHE NON È CONFERMATO ARRIVA FINO AL PDF. Un segnaposto che
//       perde la bandiera per strada diventa un numero vero.
//    5. SENZA LIBRERIA SI DICE, NON SI ROMPE. Il consulente è davanti al
//       cliente: deve leggere una frase, non uno stack.
// ═══════════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, m) => { if (!c) throw new Error(m); };

const P = require('../../tariffe/motore/pensione.js');

/* ── IL jsPDF FINTO ────────────────────────────────────────────────────────
   Riproduce solo quello che `foglioPdf` usa davvero. La larghezza del testo
   è una stima (helvetica ≈ mezzo em per carattere, 1pt = 0,3528 mm): non
   serve che combaci col millimetro della libreria vera, serve che il testo
   lungo vada a capo e faccia crescere la pagina come nella realtà.

   PERCHE' LA LARGHEZZA SI SPAZZA (`scala`). Un guasto di impaginazione si
   vede solo quando un blocco capita esattamente a cavallo del salto pagina:
   una finestra di pochi millimetri. Con UNA sola geometria la prova diventa
   verde per fortuna — e infatti, provata con una geometria sola, questa
   suite restava verde col guasto rimesso dentro. Spazzando la larghezza del
   carattere si sposta tutto il documento su e giù di continuo, e ogni titolo
   passa prima o poi sotto il salto pagina. La regola che si prova non e'
   «con questo font viene bene»: e' «viene bene con QUALUNQUE font». */
function jsPdfFinto(scala) {
  const K = 0.1764 * (scala == null ? 1 : scala);
  const f = function (opz) {
    if (!(this instanceof f)) return new f(opz);
    this.pagina = 1;
    this.dim = 10;
    this.grassetto = false;
    this.scritte = [];   // { pagina, y, testo, dim, grassetto }
    this.disegni = [];   // { pagina, tipo, y, h }
  };
  const larghezza = (t, dim) => String(t).length * dim * K;
  Object.assign(f.prototype, {
    setFont(_n, stile) { this.grassetto = stile === 'bold'; },
    setFontSize(d) { this.dim = d; },
    setTextColor() {}, setDrawColor() {}, setFillColor() {}, setLineWidth() {},
    getTextWidth(t) { return larghezza(t, this.dim); },
    splitTextToSize(t, larg) {
      const parole = String(t == null ? '' : t).split(/\s+/).filter(Boolean);
      if (!parole.length) return [''];
      const righe = []; let r = '';
      for (const w of parole) {
        const cand = r ? r + ' ' + w : w;
        if (r && larghezza(cand, this.dim) > larg) { righe.push(r); r = w; } else r = cand;
      }
      righe.push(r);
      return righe;
    },
    text(t, x, y) {
      const righe = Array.isArray(t) ? t : [t];
      righe.forEach((r, i) => {
        this.scritte.push({ pagina: this.pagina, y: y + i * this.dim * 0.4, x: x,
                            testo: String(r), dim: this.dim, grassetto: this.grassetto });
      });
    },
    line(_x1, y1) { this.disegni.push({ pagina: this.pagina, tipo: 'linea', y: y1 }); },
    rect(_x, y, _w, h) { this.disegni.push({ pagina: this.pagina, tipo: 'rett', y, h }); },
    roundedRect(_x, y, _w, h) { this.disegni.push({ pagina: this.pagina, tipo: 'rett', y, h }); },
    addPage() { this.pagina++; },
    getNumberOfPages() { return this.pagina; },
    output(tipo) { return tipo === 'blob' ? { finto: true } : new ArrayBuffer(0); },
  });
  return f;
}

const CONS = { nome: 'Francesco Oddo', ruolo: 'Agente generale', rui: 'B000123456',
               email: 'francesco@withusassicurazioni.it' };
const datiDi = (ing, nome) => ({
  esito: P.calcola(ing),
  cliente: { nome: nome || 'Mario Rossi', telefono: '3331234567' },
  consulente: CONS,
  dataRiferimento: '12/09/2026',
});

/* I profili su cui si prova. Servono TANTI e DIVERSI apposta: una regola di
   impaginazione si rompe solo quando un blocco capita a cavallo del salto
   pagina, e dove cade il salto dipende da quanto testo c'è sopra. Con un
   profilo solo, la prova sarebbe verde per fortuna. */
const PROFILI = [];
for (const lavoro of ['dipendente', 'autonomo', 'professionista']) {
  for (const reddito of [900, 1400, 1800, 2500, 4000]) {
    for (const versamento of [0, 100, 300]) {
      PROFILI.push({ eta: 38, lavoro, redditoMensile: reddito, versamentoMensile: versamento, etaInizioLavoro: 25 });
    }
  }
}
/* e i casi che cambiano la LUNGHEZZA del foglio, non solo i numeri */
PROFILI.push({ eta: 45, lavoro: 'autonomo', redditoMensile: 2500, versamentoMensile: 0 });          // prudenziale
PROFILI.push({ eta: 60, lavoro: 'dipendente', redditoMensile: 1200, versamentoMensile: 50, etaInizioLavoro: 20 });
PROFILI.push({ eta: 25, lavoro: 'dipendente', redditoMensile: 1000, versamentoMensile: 0, etaInizioLavoro: 24 });

const FONDO = 297 - 16;
/* Le geometrie da spazzare: dal carattere stretto al carattere largo. */
const SCALE = [];
for (let k = 0.80; k <= 1.30001; k += 0.01) SCALE.push(Math.round(k * 100) / 100);
const rendi = (ing, scala) => {
  const d = datiDi(ing);
  const r = P.foglioPdf(d, jsPdfFinto(scala));
  deve(r.ok, 'il PDF non è uscito: ' + (r.problemi || []).join('; '));
  return { r, p: r.pdf, doc: P.contenutoFoglio(d).doc };
};

/* ── 1. un titolo non resta solo ───────────────────────────────────────── */
prova('nessun titolo di sezione resta solo in fondo alla pagina', () => {
  let controllati = 0, alBordo = 0;
  for (const ing of PROFILI) {
    for (const scala of SCALE) {
      const { p, doc } = rendi(ing, scala);
      for (const s of doc.sezioni) {
        const cerca = String(s.titolo).toUpperCase();
        const t = p.scritte.find(x => x.testo === cerca);
        deve(t, 'titolo mai scritto nel PDF: ' + s.titolo);
        const dopo = p.scritte.filter(x => x.pagina === t.pagina && x.y > t.y + 0.1);
        deve(dopo.length > 0,
          'titolo «' + s.titolo + '» solo in fondo a pagina ' + t.pagina +
          ' (a ' + t.y.toFixed(0) + ' mm, profilo ' + ing.lavoro + ' ' + ing.redditoMensile +
          '€ versa ' + ing.versamentoMensile + '€, geometria ' + scala + ')');
        /* Quante volte il titolo e' stato SPOSTATO su una pagina nuova, cioe'
           quante volte si e' passati dal caso che conta. Se questo resta
           zero la spazzata non sta esplorando niente e la prova non dimostra
           piu' nulla: sarebbe verde perche' non e' mai successo, non perche'
           funziona. (Non si puo' contare «titoli in fondo alla pagina»: col
           codice giusto sono zero per definizione.) */
        if (t.pagina > 1 && t.y < 16 + 6) alBordo++;
        controllati++;
      }
    }
  }
  deve(alBordo > 0, 'nessun titolo e\' mai stato spostato a pagina nuova: la spazzata non prova niente');
  return controllati + ' titoli (' + PROFILI.length + ' profili × ' + SCALE.length +
         ' geometrie), di cui ' + alBordo + ' spostati a pagina nuova col loro contenuto';
});

/* ── 2. i due elenchi affiancati non si spezzano ───────────────────────── */
prova('gli elenchi affiancati stanno tutti su una pagina sola', () => {
  let provati = 0;
  for (const ing of PROFILI) {
   for (const scala of SCALE) {
    const { p, doc } = rendi(ing, scala);
    const sez = doc.sezioni.find(s => s.confronto && s.confronto.elenchi);
    if (!sez) continue;
    /* Le voci dell'elenco sono testo: si cercano le PRIME parole di ciascuna,
       perché nel PDF la voce lunga è già andata a capo. */
    const pagine = new Set();
    for (const el of sez.confronto.elenchi) {
      for (const voce of el) {
        const inizio = String(voce).split(/\s+/).slice(0, 3).join(' ');
        const t = p.scritte.find(x => x.testo.indexOf(inizio) === 0);
        deve(t, 'voce mai scritta nel PDF: ' + inizio);
        pagine.add(t.pagina);
      }
    }
    deve(pagine.size === 1,
      'le due colonne del riscatto sono finite su ' + pagine.size + ' pagine (' +
      [...pagine].join(',') + '): la seconda ripartirebbe dall\'alto SOPRA la prima — profilo ' +
      ing.lavoro + ' ' + ing.redditoMensile + '€, geometria ' + scala);
    provati++;
   }
  }
  deve(provati > 0, 'nessun profilo aveva il blocco a due elenchi: la prova non prova niente');
  return provati + ' rese, colonne sempre intere';
});

/* ── 3. niente esce dal foglio ─────────────────────────────────────────── */
prova('nessuna riga finisce sotto il margine basso', () => {
  let righe = 0;
  for (const ing of PROFILI) {
   for (const scala of SCALE) {
    const { p } = rendi(ing, scala);
    for (const s of p.scritte) {
      deve(s.y <= FONDO + 6,
        'riga a ' + s.y.toFixed(1) + ' mm (il foglio finisce a ' + FONDO + '): «' +
        s.testo.slice(0, 40) + '» (geometria ' + scala + ')');
      righe++;
    }
   }
  }
  return righe + ' righe, tutte dentro il foglio';
});

/* ── 4. quello che non è confermato arriva fino al PDF ─────────────────── */
prova('ogni segnaposto da confermare è scritto anche nel PDF', () => {
  const { p, doc } = rendi(PROFILI[0]);
  deve(doc.daConfermare.length > 0, 'nessun segnaposto: la prova non prova niente');
  const tutto = p.scritte.map(s => s.testo).join(' ');
  for (const m of doc.daConfermare) {
    const chiave = String(m.etichetta).split(/\s+/).slice(0, 3).join(' ');
    deve(tutto.indexOf(chiave) >= 0, 'segnaposto perso per strada nel PDF: ' + m.etichetta);
  }
  deve(tutto.indexOf('Valori ancora da confermare') >= 0, 'manca il cartiglio dei valori da confermare');
  return doc.daConfermare.length + ' segnaposti, tutti nel PDF';
});

prova('lo scenario prudenziale è marcato anche nel PDF', () => {
  const { p } = rendi({ eta: 45, lavoro: 'autonomo', redditoMensile: 2500, versamentoMensile: 0 });
  const tutto = p.scritte.map(s => s.testo).join(' ');
  deve(/prudenziale/i.test(tutto), 'il PDF non dice che la stima è prudenziale');
  return 'avviso presente';
});

prova('il disclaimer è sempre in fondo al PDF', () => {
  for (const ing of PROFILI.slice(0, 6)) {
    const { p, doc } = rendi(ing);
    const chiave = String(doc.disclaimer).split(/\s+/).slice(0, 4).join(' ');
    const tutto = p.scritte.map(s => s.testo).join(' ');
    deve(tutto.indexOf(chiave) >= 0, 'disclaimer assente dal PDF');
  }
  return 'presente su tutti i profili provati';
});

/* ── 5. senza libreria si dice, non si rompe ───────────────────────────── */
prova('senza jsPDF il motore risponde a parole, non con un errore', () => {
  const r = P.foglioPdf(datiDi(PROFILI[0]), undefined);
  deve(r.ok === false, 'senza libreria dice di avercela fatta');
  deve(r.problemi && r.problemi.length, 'non spiega perché');
  deve(/PDF/i.test(r.problemi[0]), 'il messaggio non nomina il PDF: ' + r.problemi[0]);
  return r.problemi[0];
});

prova('con dati insufficienti il PDF si rifiuta come si rifiuta il foglio', () => {
  const vuoto = { esito: null, cliente: {}, consulente: {} };
  const html = P.foglioHtml(vuoto);
  const pdf = P.foglioPdf(vuoto, jsPdfFinto());
  deve(html.ok === false && pdf.ok === false, 'uno dei due passa e l\'altro no');
  deve(JSON.stringify(html.problemi) === JSON.stringify(pdf.problemi),
    'HTML e PDF si rifiutano per motivi diversi:\n  html: ' + JSON.stringify(html.problemi) +
    '\n  pdf:  ' + JSON.stringify(pdf.problemi));
  return 'stessi motivi: ' + pdf.problemi.join('; ');
});

prova('il nome del file non contiene caratteri che un telefono rifiuta', () => {
  const d = datiDi(PROFILI[0], 'D\'Amico/Rossi: "Mario" <test>');
  const r = P.foglioPdf(d, jsPdfFinto());
  deve(r.ok, 'PDF non prodotto');
  deve(!/[\/\\:*?"<>|]/.test(r.nomeFile), 'nome file pericoloso: ' + r.nomeFile);
  deve(/\.pdf$/.test(r.nomeFile), 'il nome non finisce in .pdf: ' + r.nomeFile);
  return r.nomeFile;
});

/* ── la libreria vera, se c'è ──────────────────────────────────────────── */
prova('con jsPDF vero esce un file leggero e a più pagine', () => {
  let jsPDF;
  try { jsPDF = require('jspdf').jsPDF; }
  catch (_) { return 'SALTATA: jspdf non installato (npm i --no-save jspdf@2.5.2)'; }
  const r = P.foglioPdf(datiDi(PROFILI[0]), jsPDF);
  deve(r.ok, 'PDF non prodotto: ' + (r.problemi || []).join('; '));
  const kb = Buffer.from(r.pdf.output('arraybuffer')).length / 1024;
  deve(r.pagine >= 1, 'zero pagine');
  /* Va su WhatsApp, spesso in 3G: sopra i 300 KB non è più un allegato, è un
     problema. Una foto della pagina ci arriverebbe subito. */
  deve(kb < 300, 'PDF troppo pesante per WhatsApp: ' + kb.toFixed(0) + ' KB');
  deve(r.blob, 'manca il blob da allegare');
  return r.pagine + ' pagine, ' + kb.toFixed(0) + ' KB';
});

/* ── esecuzione ──────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Pensione PDF: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
