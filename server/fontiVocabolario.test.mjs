// ═══════════════════════════════════════════════════════════════════════════════
//  IL PANNELLO DEVE SAPER DISEGNARE OGNI STATO CHE IL BACKEND SA DIRE
//
//  Backend e pannello si scambiano lo stato di una fonte come una stringa. Sono
//  due file lontanissimi — server/confineScraper.js e index.html — e nessuno dei
//  due sa che cosa scriva l'altro. Il vocabolario e' quindi andato alla deriva
//  da tutte e due le parti:
//
//    · il backend ha imparato a dire `da_verificare`, `errore` e `bloccata`, e
//      il pannello li stampava GREZZI, come pastiglia col testo `da_verificare`;
//    · il pannello sapeva ancora disegnare `pronta`, che il backend non dice
//      piu' da nessuna parte — e la disegnava VERDE, cioe' col colore che
//      significa «si puo' usare». Una parola morta che, se qualcuno la
//      resuscitasse per sbaglio, mentirebbe nel modo peggiore.
//
//  Queste prove non guardano la grafica: guardano che le due parti parlino la
//  stessa lingua, e che il verde resti riservato agli stati in cui la fonte e'
//  davvero utilizzabile. Nessun browser, nessuna rete: si legge index.html come
//  testo e si confronta con l'elenco degli stati esportato dal backend.
//
//      node server/fontiVocabolario.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STATO, eOperativo, statoFonte, frasePerDiagnosi } from './confineScraper.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(__dir, '..', 'index.html');

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

const html = fs.readFileSync(INDEX, 'utf8');

/* Il verde di «si puo' usare». E' lo stesso identico valore in fontiBadge e in
   fontiDot: se un giorno cambiasse, questa prova va aggiornata insieme — ed e'
   giusto cosi', perche' il punto e' proprio che il verde sia UNO solo. */
const VERDE = '#1c8a52';

/** Il corpo di una funzione dichiarata in index.html, presa come testo. */
function corpoFunzione(nome) {
  const i = html.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('in index.html non c\'e\' piu\' la funzione ' + nome + '()');
  // Basta fermarsi alla prima riga che chiude la funzione a inizio riga: lo
  // stile del file e' quello, e non serve un parser vero per due funzioni.
  const fine = html.indexOf('\n}', i);
  return html.slice(i, fine > 0 ? fine + 2 : i + 4000);
}

/** Le voci della mappa stato → [colore, sfondo, etichetta] dentro fontiBadge. */
function vociBadge() {
  const corpo = corpoFunzione('fontiBadge');
  const voci = new Map();
  const re = /(\w+)\s*:\s*\[\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\]/g;
  let m;
  while ((m = re.exec(corpo))) voci.set(m[1], { colore: m[2], sfondo: m[3], etichetta: m[4] });
  return voci;
}

// ── 1. Nessuno stato del backend deve uscire come testo grezzo ───────────────
prova('il pannello sa disegnare tutti gli stati che il backend puo\' dire', () => {
  const voci = vociBadge();
  deve(voci.size > 0, 'non sono riuscito a leggere la mappa di fontiBadge: e\' cambiata la forma?');
  const mancanti = Object.values(STATO).filter(s => !voci.has(s));
  deve(mancanti.length === 0,
    'il backend puo\' dire ' + mancanti.join(', ') + ' e il pannello lo stamperebbe grezzo, '
    + 'cioe\' con la parola tecnica al posto di una frase');
  return Object.values(STATO).length + ' stati, tutti disegnabili';
});

// ── 2. Il verde e' riservato a chi si puo' davvero usare ─────────────────────
prova('nessuno stato non operativo e\' colorato di verde', () => {
  /* E' la difesa contro il difetto originale: «pronta» voleva dire «non lo so»
     ed era dipinta con lo stesso verde di «attiva». Chi guardava il pannello
     vedeva una fonte pronta mentre lo scraper era spento. */
  const voci = vociBadge();
  const bugie = [];
  for (const [stato, v] of voci) {
    const verde = v.colore.toLowerCase() === VERDE || v.sfondo.toLowerCase() === '#e7f7ee';
    if (verde && !eOperativo(stato)) bugie.push(stato + ' («' + v.etichetta + '»)');
  }
  deve(bugie.length === 0,
    'questi stati sono dipinti di verde ma la fonte NON e\' utilizzabile: ' + bugie.join(', '));
  return voci.size + ' voci controllate';
});

// ── 3. Il pannello non deve conoscere parole che il backend non dice piu' ────
prova('il pannello non conserva stati che il backend ha smesso di dire', () => {
  /* Non e' pignoleria: una voce morta nella mappa e' una voce che nessuno
     rilegge piu', e che al primo riuso torna a mentire col colore di prima.
     Se un giorno serve davvero uno stato nuovo, va aggiunto PRIMA al backend. */
  const noti = new Set(Object.values(STATO));
  const orfani = [...vociBadge().keys()].filter(s => !noti.has(s));
  deve(orfani.length === 0,
    'il pannello sa disegnare ' + orfani.join(', ') + ', che nessuna parte del backend produce piu\'');
  return 'nessuna parola orfana';
});

// ── 4. Il pallino segue la stessa regola del backend ─────────────────────────
prova('il pallino verde si accende solo sugli stati operativi', () => {
  /* fontiDot decide il verde da solo, con un confronto scritto a mano. Se un
     giorno il backend avesse due stati operativi e questa riga ne conoscesse
     uno, il pallino e la pastiglia direbbero cose diverse sulla stessa fonte. */
  const corpo = corpoFunzione('fontiDot');
  const operativi = Object.values(STATO).filter(eOperativo);
  deve(operativi.length === 1, 'gli stati operativi non sono piu\' uno solo: ' + operativi.join(', ')
    + ' — va aggiornata a mano la riga del verde in fontiDot');
  const atteso = new RegExp('stato\\s*===\\s*[\'"]' + operativi[0] + '[\'"]');
  deve(atteso.test(corpo), 'fontiDot non accende il verde su «' + operativi[0] + '»: la regola del pallino '
    + 'e\' diversa da eOperativo() del backend');
  return 'pallino e backend d\'accordo su «' + operativi[0] + '»';
});

// ── 5. Lo stato che chiede un gesto deve restare scritto per esteso ──────────
prova('«bloccata» spiega che cosa fare, non mostra solo un pallino rosso', () => {
  /* E' l'unico stato che non passa da solo: il freno ha smesso di riprovare e
     riparte solo con un codice nuovo messo a mano. Se il pannello lo mostrasse
     come un guasto qualsiasi, si aspetterebbe che passi — e non passa. */
  deve(html.includes("f.stato==='bloccata'") || html.includes('f.stato === \'bloccata\''),
    'il pannello non ha piu\' il riquadro dedicato a «bloccata»');
  const i = html.indexOf("f.stato==='bloccata'");
  const riquadro = html.slice(i, i + 900);
  deve(/codice/i.test(riquadro), 'il riquadro di «bloccata» non dice piu\' che serve un codice nuovo');
  deve(/f\.motivo/.test(riquadro), 'il riquadro non mostra piu\' il motivo scritto dallo scraper');
});

// ── 6. La diagnosi calcolata dal backend deve arrivare a schermo ─────────────
prova('il pannello mostra la diagnosi che il backend gli manda', () => {
  /* `mappaScraper` (server/fonti.js) calcola `diagnosi` e `motivo_stato` per
     ogni fonte. Erano nella risposta HTTP e nessuno li disegnava: la frase piu'
     utile del sistema — quella che dice di NON reinserire la password — non
     usciva da nessuna parte. */
  deve(/f\.motivo_stato/.test(html), 'il pannello non legge `motivo_stato`: la diagnosi resta invisibile');
  const i = html.indexOf('f.motivo_stato');
  const zona = html.slice(i, i + 700);
  deve(/esc\(f\.motivo_stato\)/.test(zona), 'la diagnosi viene stampata senza passare da esc()');
});

prova('la frase sulla chiave disallineata puo\' davvero arrivare a schermo', () => {
  /* Prova di percorso completo, senza rete: la diagnosi che nasce in
     confineScraper.js ha una frase, e il pannello ha il ramo che la disegna.
     Se un giorno saltasse uno dei due anelli, il caso peggiore (mandare a
     cambiare una password giusta) tornerebbe in silenzio. */
  const s = statoFonte({
    risposta: { ok: true, da: 'rete', dati: { url: 'https://x.invalid', loggato: false, ha_credenziali: false } },
    configurato: true, credenzialiNelloStore: true,
  });
  deve(s.diagnosi === 'credenziali-non-leggibili-dallo-scraper', 'la diagnosi non nasce piu\': ' + s.diagnosi);
  deve(frasePerDiagnosi(s.diagnosi).length > 0, 'la diagnosi esiste ma non ha una frase da mostrare');
  deve(/f\.motivo_stato/.test(html), 'la frase esiste ma il pannello non ha il ramo che la disegna');
});

let ko = 0;
console.log('\nVOCABOLARIO DEGLI STATI — backend e pannello devono dire le stesse parole');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nVOCABOLARIO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
