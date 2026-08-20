// ═══════════════════════════════════════════════════════════════════════════════
//  PARITÀ — il premio catastrofali non cambia spostandosi
//
//  Il calcolo è uscito da index.html ed è diventato un modulo che caricano sia
//  il browser sia il server. La domanda che conta è una sola: il premio è
//  rimasto identico?
//
//  Qui non ci si fida della lettura del diff. Si prende la funzione VECCHIA
//  dal file com'era prima della modifica (da git), la si fa girare accanto a
//  quella nuova su centinaia di combinazioni, e si confrontano i risultati
//  campo per campo. Una tariffa che cambia di un euro non dà nessun errore:
//  emette una polizza a un prezzo storto, e lo si scopre da un cliente.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const RADICE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const richiedi = createRequire(import.meta.url);

const esiti = [];
const prova = (n, f) => { try { const m = f(); esiti.push([true, n, m || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

/* La tariffa vera: gli stessi CAP che usa il preventivatore. */
const TARIFFA = JSON.parse(fs.readFileSync(path.join(RADICE, 'tariffe/catastrofali_cap.json'), 'utf8'));

/* Il modulo NUOVO. */
const nuovo = richiedi(path.join(RADICE, 'tariffe/motore/catastrofali.js'));
nuovo.caricaTariffa(TARIFFA);

/* La funzione VECCHIA, ritagliata dal index.html com'era all'ultimo commit.
   Si esegue in una stanza chiusa con le sue variabili, senza browser. */
/* Il riferimento e' l'ULTIMO commit in cui il calcolo stava ancora dentro la
   pagina, cercato nella storia — non «HEAD».

   Scritta con HEAD, questa prova funzionava una volta sola: appena l'estrazione
   veniva committata, HEAD non conteneva piu' la funzione e la prova moriva
   dicendo «calcCatPremio non trovata». Una prova che passa una volta e poi si
   rompe da sola non sorveglia niente, e la si disattiva al primo fastidio. */
function commitDiRiferimento() {
  const righe = execSync('git log --format=%H -- index.html', { cwd: RADICE, encoding: 'utf8' }).trim().split('\n');
  for (const c of righe) {
    const contiene = execSync(`git show ${c}:index.html | grep -c "function calcCatPremio(" || true`,
      { cwd: RADICE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
    if (Number(contiene) > 0) return c;
  }
  throw new Error('nessun commit contiene piu\' calcCatPremio: il riferimento e\' andato perso');
}

function funzioneVecchia() {
  const rif = commitDiRiferimento();
  const vecchio = execSync('git show ' + rif + ':index.html', { cwd: RADICE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const i = vecchio.indexOf('function calcCatPremio(');
  deve(i > 0, 'calcCatPremio non trovata nel file precedente');
  let liv = 0, j = vecchio.indexOf('{', i), fine = -1;
  for (; j < vecchio.length; j++) {
    if (vecchio[j] === '{') liv++;
    else if (vecchio[j] === '}') { liv--; if (liv === 0) { fine = j + 1; break; } }
  }
  const corpo = vecchio.slice(i, fine);
  const min = /const RCAB_PMIN = (\d+)/.exec(vecchio);
  deve(min, 'RCAB_PMIN non trovata nel file precedente');
  // eslint-disable-next-line no-new-func
  return new Function('CAT_CAP', 'RCAB_PMIN', corpo + '; return calcCatPremio;')(TARIFFA, Number(min[1]));
}

// ── 1. Il premio è identico ──────────────────────────────────────────────────
prova('stesso premio su ogni combinazione, vecchio e nuovo', () => {
  const vecchia = funzioneVecchia();
  const caps = Object.keys(TARIFFA).slice(0, 60);
  const valori = [50000, 120000, 250000, 400000, 1000000];
  const opzioni = [
    {}, { terrCont: true }, { alluFabb: true },
    { terrCont: true, alluFabb: true }, { terrCont: true, alluFabb: true, alluCont: true },
    { alluFabb: true, frazionamento: 'Semestrale' },
    { terrCont: true, alluFabb: true, alluCont: true, frazionamento: 'Semestrale' },
  ];
  let confronti = 0, diversi = [];
  for (const cap of caps) for (const v of valori) for (const o of opzioni) {
    const a = vecchia(cap, v, o);
    const b = nuovo.calcCatPremio(cap, v, o);
    confronti++;
    if (JSON.stringify(a) !== JSON.stringify(b)) diversi.push({ cap, v, o, a, b });
  }
  deve(confronti > 1000, 'troppi pochi confronti: ' + confronti);
  /* Il messaggio si costruisce SOLO se serve: scritto come argomento di deve()
     veniva valutato comunque, e su un elenco vuoto JSON.stringify(undefined)
     fa esplodere la prova proprio quando tutto va bene. */
  if (diversi.length) {
    throw new Error(diversi.length + ' risultati diversi su ' + confronti +
      '. Primo: ' + JSON.stringify(diversi[0]).slice(0, 240));
  }
  return confronti + ' combinazioni, tutte identiche';
});

// ── 2. I casi limite si comportano come prima ────────────────────────────────
prova('CAP sconosciuto e valore mancante rispondono come prima', () => {
  const vecchia = funzioneVecchia();
  for (const [cap, val] of [['00000', 100000], ['99999', 100000], [Object.keys(TARIFFA)[0], 0], [Object.keys(TARIFFA)[0], null]]) {
    const a = vecchia(cap, val, {});
    const b = nuovo.calcCatPremio(cap, val, {});
    deve(JSON.stringify(a) === JSON.stringify(b), 'cap ' + cap + ' valore ' + val + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
  }
});

// ── 3. Una copia sola ────────────────────────────────────────────────────────
prova('il calcolo non e\' rimasto anche dentro index.html', () => {
  /* La regola non negoziabile: le costanti di calcolo vivono in un posto solo.
     Due copie divergono al primo ritocco, e nessuna delle due urla. */
  const idx = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8');
  deve(!/function calcCatPremio\s*\(/.test(idx),
    'index.html ha ancora la sua copia di calcCatPremio');
  deve(!/const RCAB_PMIN\s*=\s*\d/.test(idx),
    'index.html ha ancora la sua copia di RCAB_PMIN');
  deve(/tariffe\/motore\/catastrofali\.js/.test(idx),
    'index.html non carica il modulo condiviso: il preventivatore resterebbe senza calcolo');
});

prova('nessun modulo condiviso sporca le variabili della pagina', () => {
  /* IL DIFETTO CHE HA GENERATO QUESTA PROVA (17/08/2026).
     La prima versione del modulo dichiarava `var CAT_CAP` al primo livello.
     Caricato con <script src>, quel `var` diventa una variabile globale della
     pagina — e il preventivatore ne ha una sua con lo stesso nome. Il browser
     ha risposto «Identifier 'CAT_CAP' has already been declared» e ha smesso
     di eseguire TUTTO lo script di index.html: non una funzione mancante, il
     quotatore intero morto. Nessuna prova statica se ne era accorta.

     Vale per ogni modulo che verra' estratto dopo questo: qui dentro tutto
     sta dentro un contenitore, e fuori esce solo cio' che si consegna. */
  const cartella = path.join(RADICE, 'tariffe/motore');
  const moduli = fs.readdirSync(cartella).filter(f => f.endsWith('.js'));
  deve(moduli.length > 0, 'nessun modulo condiviso trovato');
  for (const m of moduli) {
    /* Non si guarda l'indentazione — dentro il contenitore le righe restano a
       colonna zero e sono comunque al sicuro. Si guarda la cosa che conta: che
       il codice eseguibile sia AVVOLTO, cioe' che cominci col contenitore e si
       chiuda con lui. */
    const src = fs.readFileSync(path.join(cartella, m), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').trim();
    deve(/^\(function\s*\(/.test(src),
      m + ' non comincia con un contenitore: le sue dichiarazioni diventano globali della pagina');
    deve(/\}\)\(\);?$/.test(src),
      m + ' non si chiude col contenitore: qualcosa e\' rimasto fuori');
  }
  return moduli.length + ' moduli, nessuno sporca la pagina';
});

prova('il modulo serve sia il browser sia il server', () => {
  const src = fs.readFileSync(path.join(RADICE, 'tariffe/motore/catastrofali.js'), 'utf8');
  deve(/module\.exports/.test(src), 'non e\' importabile da Node: il server non potrebbe quotare');
  deve(/typeof window/.test(src), 'non si espone al browser: il preventivatore resterebbe senza funzione');
});

let ko = 0;
console.log('\nPARITÀ — catastrofali');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n + (m ? ' — ' + m : '') : '  X   ' + n + ' — ' + m); if (!ok) ko++; }
console.log(`\nPARITÀ CATASTROFALI: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
