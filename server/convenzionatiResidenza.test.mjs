// ═══════════════════════════════════════════════════════════════════════════════
//  LA RESIDENZA CHE DICE IL CLIENTE, ACCANTO ALLA NOSTRA
//
//  PERCHE' ESISTE
//    «Se il cliente aggiorna l'anagrafica, con la residenza non sovrapporla con
//     quella già in programma, ma dammele entrambe nella scheda cliente»
//     — Francesco, 02/09/2026.
//
//    La residenza non e' un campo come gli altri: decide dove finisce una
//    polizza. Un indirizzo cambiato da fuori, senza che nessuno lo guardi, e'
//    un contratto spedito altrove. Quindi non si sovrappone: si mette accanto,
//    come un dato — non come una riga di testo dentro le note, che si legge
//    solo se qualcuno la apre e che non si puo' confrontare.
//
//    MA UN INDIRIZZO INCOMPLETO NON E' UN INDIRIZZO. Se avessimo solo il
//    comune e mettessimo la sua «in attesa», quei campi resterebbero vuoti per
//    sempre: il triangolo dei dati mancanti non si spegnerebbe mai, perche' da
//    li' non si potrebbero piu' riempire.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const mod = await import('./convenzionati.js').catch(() => ({}));
const scrivi = mod.residenzaDaScrivere || (() => { throw new Error('residenzaDaScrivere non esiste ancora'); });

const QUI = path.dirname(fileURLToPath(import.meta.url));
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const src = senzaCommenti(fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8'));
const salva = src.slice(src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/salva-anagrafica'"));

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const NOSTRA = { indirizzo: 'Via Giovanbattista Fardella', civico: '3', cap: '91100', comune: 'Trapani', provincia: 'TP' };
const SUA    = { indirizzo: 'vico giunone', civico: '3', cap: '91027', comune: 'paceco', provincia: 'tp' };
const QUANDO = new Date('2026-09-02T17:00:00Z');

prova('la nostra residenza non si tocca', () => {
  /* E' la regola per cui esiste tutto il resto: su quella riga ci sono
     contratti, e una polizza spedita a un indirizzo cambiato da fuori non
     arriva a nessuno. */
  const { campi } = scrivi(NOSTRA, SUA, QUANDO);
  for (const k of ['indirizzo', 'civico', 'cap', 'comune', 'provincia']) {
    deve(!(k in campi), 'sovrascrive «' + k + '»: la nostra residenza cambia da sola');
  }
  return 'quella che abbiamo resta dov\'e\'';
});

prova('la sua si mette accanto, con la data', () => {
  const { campi, dichiarata } = scrivi(NOSTRA, SUA, QUANDO);
  deve(dichiarata === true, 'non risulta esserci niente da verificare');
  deve(campi.res_dich_indirizzo === 'vico giunone', 'non tiene l\'indirizzo che ha detto lui');
  deve(campi.res_dich_comune === 'paceco', 'non tiene il comune che ha detto lui');
  deve(campi.res_dich_il === QUANDO.toISOString(), 'non segna quando l\'ha detto');
  deve(campi.res_dich_origine === 'area riservata', 'non segna da dove arriva');
  return 'tutte e due, e si sa quando l\'ha detta';
});

prova('si tiene INTERA, non a pezzi', () => {
  /* Metterne solo i campi diversi darebbe un indirizzo meta' nostro e meta'
     suo: non e' l'indirizzo di nessuno dei due, ed e' il modo migliore per
     spedire una polizza in un posto che non esiste. */
  const { campi } = scrivi(NOSTRA, { ...SUA, civico: '3' }, QUANDO);
  deve(campi.res_dich_civico === '3', 'butta via il civico perche\' era uguale: l\'indirizzo resta monco');
  deve(campi.res_dich_provincia === 'tp', 'butta via la provincia perche\' era uguale');
  return 'un indirizzo intero, non un mosaico';
});

prova('se dice la stessa cosa non succede niente', () => {
  const { campi, dichiarata } = scrivi(NOSTRA, { ...NOSTRA, comune: '  TRAPANI ' }, QUANDO);
  deve(dichiarata === false, 'segna da verificare una residenza identica alla nostra');
  deve(Object.keys(campi).length === 0, 'scrive qualcosa che non serve: ' + Object.keys(campi).join(', '));
  return 'una maiuscola non e\' un trasloco';
});

prova('se non ne abbiamo una, si scrive la sua', () => {
  /* Tenerla «in sospeso» lascerebbe l'anagrafica incompleta per prudenza verso
     qualcosa che non c'era. */
  const { campi, dichiarata } = scrivi({}, SUA, QUANDO);
  deve(dichiarata === false, 'la mette in attesa anche se non c\'era niente da confrontare');
  deve(campi.indirizzo === 'vico giunone' && campi.cap === '91027', 'non scrive la residenza che ha dato');
  deve(!('res_dich_indirizzo' in campi), 'la mette da parte invece che al suo posto');
  return 'niente da proteggere, niente da mettere in attesa';
});

prova('un indirizzo incompleto non e\' un indirizzo', () => {
  /* IL CASO CHE ROMPEVA TUTTO. Con solo il comune, mettendo la sua da parte,
     via e CAP restavano vuoti per sempre: il triangolo dei dati mancanti non si
     sarebbe piu' spento, e da li' non si potevano piu' riempire. */
  const { campi, dichiarata } = scrivi({ comune: 'Trapani' }, SUA, QUANDO);
  deve(dichiarata === false, 'protegge un indirizzo a cui non arriverebbe una lettera');
  deve(campi.indirizzo === 'vico giunone', 'lascia l\'indirizzo vuoto per sempre');
  deve(campi.cap === '91027', 'lascia il CAP vuoto per sempre');
  return 'si riempie, e il triangolo si puo\' spegnere';
});

prova('quello che si sostituisce resta scritto', () => {
  // Era un pezzo di informazione: non deve sparire in silenzio.
  const { sostituite } = scrivi({ comune: 'Trapani' }, SUA, QUANDO);
  deve(sostituite.length === 1, 'ne segna ' + sostituite.length + ' invece di 1');
  deve(/Trapani/.test(sostituite[0]), 'non dice cosa c\'era prima: ' + sostituite[0]);
  deve(/comune/.test(sostituite[0]), 'non dice quale campo: ' + sostituite[0]);
  return 'si sapra\' cosa c\'era';
});

prova('se non scrive nessuna residenza, non si inventa niente', () => {
  const { campi, dichiarata } = scrivi(NOSTRA, { cellulare: '3331234567' }, QUANDO);
  deve(dichiarata === false && Object.keys(campi).length === 0, 'tocca la residenza senza che nessuno gliel\'abbia data');
  return 'chi non parla di residenza non la cambia';
});

prova('la residenza non passa anche dalla strada degli altri campi', () => {
  /* Se passasse da tutte e due finirebbe due volte: una accanto alla nostra e
     una in mezzo alle note. */
  const { colma, diverse } = mod.campiDaColmare(NOSTRA, SUA, []);
  deve(Object.keys(colma).length === 0, 'la riempie anche di la\': ' + Object.keys(colma).join(', '));
  deve(diverse.length === 0, 'la segnala anche nelle note: ' + diverse.join(' | '));
  return 'una strada sola';
});

prova('chi compila viene avvisato che e\' in verifica', () => {
  /* Senza, rivede subito la residenza com'era prima e pensa che non sia stata
     salvata — e riprova, e riprova. */
  deve(/residenzaDaVerificare: res_\.dichiarata/.test(salva), 'la pagina non ha modo di sapere che e\' in attesa');
  return 'lo sa, e non riprova a vuoto';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── La residenza, la nostra e la sua ────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
