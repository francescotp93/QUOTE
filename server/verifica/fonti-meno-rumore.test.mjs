// ═══════════════════════════════════════════════════════════════════════════════
//  FONTI — meno rumore, piu' segnale
//
//  Tre correzioni nate guardando insieme a Francesco la diagnosi vera del
//  9 settembre 2026, su tredici fonti.
//
//  1. IL BADGE RESTAVA INDIETRO. La sonda tiene in cache la risposta di ogni
//     scraper per dieci secondi. Dopo un accesso riuscito il pannello ricarica
//     subito e si riprendeva quella di prima: sullo schermo compariva
//     «Configurata» accanto al messaggio «sei dentro». Due frasi che si
//     contraddicono a due centimetri insegnano a non fidarsi del pannello.
//
//  2. PRIMA NON E' UN GUASTO QUANDO E' SPENTA. Si quota dall'estensione del
//     browser, non dal server — sta scritto nella sua stessa scheda che il
//     login da qui «non serve e non puo' funzionare». La diagnosi la metteva
//     fra gli allarmi gravi e mandava ad aspettare per tre o quattro minuti un
//     servizio che e' giusto che sia spento. Un allarme che grida al lupo e'
//     un allarme che si smette di leggere.
//
//  3. «RIFAI L'ACCESSO» NON RIFACEVA NIENTE. Con la sessione viva lo scraper
//     risponde «gia' attiva» senza toccare il portale. Giusto tutti i giorni;
//     inutile il giorno in cui hai cambiato la password sul portale — l'unico
//     in cui uno preme un pulsante che si chiama cosi'.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(RADICE, 'fonti.js'), 'utf8');

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const fetta = (da, a) => { const i = src.indexOf(da); return i < 0 ? '' : src.slice(i, src.indexOf(a, i)); };

prova('l\'elenco delle fonti puo\' saltare la cache della sonda', () => {
  const r = fetta("fontiRouter.get('/', async", "// ── Portali compagnia dinamici");
  deve(r.length > 0, 'non trovo la rotta che costruisce l\'elenco');
  deve(/sondaTutte\(voci, \{ forza:/.test(r), 'l\'elenco usa sempre la cache: dopo un accesso riuscito il badge resta indietro');
  deve(/req\.query\.forza === '1'/.test(r), 'non e\' chi chiede a decidere se saltare la cache');
  return 'chi ha appena fatto qualcosa puo\' chiedere il dato fresco';
});

prova('chi si quota dal browser non finisce fra gli allarmi gravi', () => {
  const d = fetta('function diagnosi(', 'function statoInterruttori');
  deve(/function diagnosi\(cfg, r, viaIlBrowser\)/.test(d), 'la diagnosi non riceve l\'informazione che il sistema ha gia\'');
  deve(/viaIlBrowser/.test(d) && /via_browser/.test(d), 'non distingue lo scraper spento per guasto da quello spento per come e\' fatto');
  /* La distinzione conta solo se cambia la gravita': un allarme «alto» su una
     cosa normale resta un allarme che si impara a saltare. */
  const i = d.indexOf('if (viaIlBrowser)');
  deve(i > 0, 'non c\'e\' nessun ramo dedicato a chi si quota dal browser');
  deve(/gravita: 'bassa'/.test(d.slice(i, i + 900)), 'lo dice ma lo lascia fra i problemi gravi');
  return 'spenta per come e\' fatta ≠ spenta per un guasto';
});

prova('la diagnosi riceve davvero quel dato, non lo indovina', () => {
  const s = fetta("fontiRouter.get('/salute'", 'const problemi =');
  deve(/diagnosi\(m\.cfg, r, viaBrowser\(/.test(s), 'la funzione lo accetta ma nessuno glielo passa');
  deve(/!m\.cfg\.proxy/.test(s), 'ignora il proxy: con un proxy residenziale il server puo\' entrare, e allora spento e\' un guasto vero');
  return 'passato da chi lo sa gia\'';
});

prova('«Rifai l\'accesso» arriva fino allo scraper', () => {
  const a = fetta("fontiRouter.post('/:id/accedi'", "// POST /fonti/:id/conferma-codice");
  deve(/req\.query\.forza === '1'/.test(a), 'il backend non legge la richiesta di rientrare da capo');
  deve(/'\/accedi\?forza=1'/.test(a), 'la legge e non la gira allo scraper');
  /* Chi non conosce il parametro deve continuare a funzionare come prima: le
     compagnie sono dieci e si sistemano una per volta. */
  deve(/'\/accedi'/.test(a), 'senza forzatura non chiama piu\' la rotta semplice');
  return 'e chi non lo conosce fa come prima';
});

console.log('FONTI — meno rumore, piu\' segnale');
for (const [ok, n, d] of esiti) console.log(`  ${ok ? 'ok ' : 'X  '} ${n}${d ? ' — ' + d : ''}`);
const ko = esiti.filter(e => !e[0]).length;
console.log('');
console.log(`FONTI — meno rumore: ${esiti.length - ko} superate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
