// ═══════════════════════════════════════════════════════════════════════════════
//  LE PAGINE CHIESTE DALLA SCOCCA SI ACCENDONO DAVVERO
//
//  Perché questa prova esiste. Il 28/08/2026, cercando «pet» nella lente di IAM,
//  si apriva «Animali domestici» e dentro c'era un riquadro BIANCO.
//
//  Metà delle schermate del preventivatore sono un guscio vuoto in HTML — uno
//  stepper e un contenitore — e il contenuto lo scrive una funzione `open…()`
//  che prima prepara i dati e poi chiama showPage. Dai moduli si passa sempre di
//  lì. Ma la scocca chiede `?page=<nome>`, che arriva dritto a showPage: la
//  pagina si accende, i dati non esistono, il contenitore resta vuoto. Erano
//  NOVE pagine rotte allo stesso modo, e nessuno se n'era accorto perché dal
//  menu dei moduli si arriva sempre dalla parte giusta.
//
//  Cosa sorveglia. Che ogni pagina il cui contenuto è scritto dal codice abbia
//  una porta: o una riga in PAGINE_DA_AVVIARE, o un inizializzatore dentro
//  showPage. Chi aggiunge un preventivatore nuovo e si dimentica la porta lo
//  scopre qui, non da un cliente che guarda una schermata bianca.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const src = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8');

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/* Il blocco HTML di una pagina: da <div class="page" id="page-X"> fino
   all'inizio della successiva. Basta per vedere se dentro c'è un contenitore
   vuoto, che è il segno del guscio da riempire. */
function blocchiPagina() {
  const re = /<div class="page" id="page-([a-z0-9-]+)"/g;
  const punti = [];
  let m;
  while ((m = re.exec(src))) punti.push({ nome: m[1], da: m.index });
  return punti.map((p, i) => ({ nome: p.nome, html: src.slice(p.da, i + 1 < punti.length ? punti[i + 1].da : p.da + 4000) }));
}

const porte = (src.match(/^\s*([a-z0-9-]+):\s*\(\) =>/gm) || [])
  .join(' ');                                            // righe di PAGINE_DA_AVVIARE
const iniziaSuShowPage = new Set([...src.matchAll(/if \(name === '([a-z0-9-]+)'\)/g)].map(m => m[1]));
const haPorta = (n) => new RegExp('(^|\\s)' + n + ':\\s*\\(\\) =>').test(porte) || iniziaSuShowPage.has(n);

/* Pagine che la scocca NON chiede mai: si aprono solo da dentro, dalla loro
   pagina madre, che una porta ce l'ha. Elencarle qui non è un'esenzione di
   comodo — è il punto in cui, aggiungendone una nuova, ci si ferma un secondo a
   chiedersi «questa dal menu di IAM ci si arriva?». Se la risposta è sì, va in
   PAGINE_DA_AVVIARE e non qui. */
const SOLO_DA_DENTRO = {
  auto:          'aperta da openAuto, che la scocca raggiunge con ?prod= (PRODOTTI_DIRETTI)',
  tutelalegale:  'aperta da dentro Tutela legale',
  'impresa-cat': 'aperta da dentro Multirischio impresa',
  rcab:          'aperta da dentro Beni (rischi catastrofali abitazione)',
  fi:            'aperta da dentro Beni (fulmine, incendio e scoppio)',
  'cauz-prov':   'aperta da dentro Cauzioni',
};

prova('nessuna pagina si apre con il contenitore vuoto', () => {
  const senzaPorta = [];
  for (const p of blocchiPagina()) {
    /* Il segno del guscio: un contenitore che in HTML è vuoto e che qualcuno
       riempie da codice (`<div id="xx-content"></div>`, `id="xx-grid"`). */
    const vuoti = [...p.html.matchAll(/id="([a-z0-9-]+-(?:content|grid|view))"\s*>\s*<\/div>/g)].map(m => m[1]);
    if (!vuoti.length) continue;
    if (!haPorta(p.nome) && !SOLO_DA_DENTRO[p.nome]) senzaPorta.push(p.nome + ' (' + vuoti[0] + ')');
  }
  deve(senzaPorta.length === 0,
    'pagine che dalla scocca si aprirebbero bianche: ' + senzaPorta.join(', ')
    + ' — servono in PAGINE_DA_AVVIARE o un inizializzatore in showPage');
  return 'tutte le pagine a contenuto scritto dal codice hanno la loro porta';
});

prova('la porta non passa da showPage, altrimenti si gira in tondo', () => {
  const i = src.indexOf('function showPage(');
  const corpo = src.slice(i, src.indexOf('\n}', i));
  deve(!/apriPaginaChiesta/.test(corpo),
    'showPage chiama apriPaginaChiesta: le open…() chiamano showPage, si entra in ricorsione');
});

prova('gli ingressi dalla scocca passano tutti dalla porta', () => {
  /* Due: il parametro ?page= all'avvio e il messaggio del ponte. Se uno dei due
     torna a chiamare showPage diretto, il guasto torna solo da quella strada —
     ed è il tipo di regressione che nessuno riesce a riprodurre. */
  const ponte = src.slice(src.indexOf('function ponteVai('), src.indexOf('function ponteVai(') + 700);
  deve(/apriPaginaChiesta\(d\.page\)/.test(ponte), 'il ponte apre la pagina senza passare dalla porta');
  const avvio = src.slice(src.indexOf("const _pg = _par.get('page')"), src.indexOf("const _pg = _par.get('page')") + 400);
  deve(/apriPaginaChiesta\(_pg\)/.test(avvio), "l'avvio con ?page= apre la pagina senza passare dalla porta");
});

prova('le pagine composte restano a showPage', () => {
  const i = src.indexOf('function apriPaginaChiesta(');
  const corpo = src.slice(i, i + 700);
  deve(/!nome\.includes\(':'\)/.test(corpo),
    "«utility:nota» e «anagrafiche:senza-email» devono arrivare a showPage con il suffisso: è showPage a leggerlo");
});

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nPAGINE DALLA SCOCCA — nessuna schermata bianca');
for (const { nome, fn } of esiti) {
  try { const d = await fn(); console.log('  ok  ' + nome + (d ? ' — ' + d : '')); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + e.message); }
}
console.log(`\nPAGINE DALLA SCOCCA: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
