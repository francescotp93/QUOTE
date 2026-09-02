// ═══════════════════════════════════════════════════════════════════════════════
//  IL CONTATORE DI CHI C'E' NELL'AREA
//
//  PERCHE' ESISTE
//    «Dammi un contatore per utenti online in quel momento e quanti utenti sono
//     entrati» — Francesco, 02/09/2026.
//
//    Due numeri, e uno solo dei due e' difficile. «Chi c'e' adesso» e' un
//    confronto fra date. «Quanti sono entrati» no: l'area manda un battito ogni
//    minuto, e contarli tutti vorrebbe dire che chi lascia la pagina aperta
//    mezz'ora e' entrato trenta volte. Un contatore che dice numeri grossi e
//    falsi e' peggio di nessun contatore, perche' ci si prendono decisioni.
//
//    Un accesso nuovo si conta solo dopo un silenzio: quando se n'era andato
//    davvero.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const mod = await import('./convenzionati.js').catch(() => ({}));
const nuovo = mod.eUnAccessoNuovo || (() => { throw new Error('eUnAccessoNuovo non esiste ancora'); });

const QUI = path.dirname(fileURLToPath(import.meta.url));
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const src = senzaCommenti(fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8'));
const rotta = src.slice(src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/sono-qui'"));

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const ORA = new Date('2026-09-02T16:00:00Z');
const fa = (min) => new Date(ORA.getTime() - min * 60000).toISOString();

prova('restare aperti mezz\'ora non sono trenta accessi', () => {
  /* E' la ragione per cui questa funzione esiste: un battito al minuto contato
     come un accesso e' un numero grosso e falso. */
  for (const min of [0, 1, 5, 15, 29]) {
    deve(nuovo(fa(min), ORA, 30) === false, 'conta un accesso nuovo dopo ' + min + ' minuti di presenza');
  }
  return 'un battito al minuto resta una visita sola';
});

prova('dopo il silenzio, e\' tornato', () => {
  for (const min of [30, 45, 120, 1440]) {
    deve(nuovo(fa(min), ORA, 30) === true, 'dopo ' + min + ' minuti di assenza non conta il ritorno');
  }
  return 'chi torna dopo mezz\'ora e\' tornato';
});

prova('la prima volta in assoluto e\' un accesso', () => {
  for (const v of [null, undefined, '']) {
    deve(nuovo(v, ORA, 30) === true, 'chi entra per la prima volta non viene contato: ' + JSON.stringify(v));
  }
  return 'nessuno entra senza essere contato';
});

prova('una data storta non fa perdere l\'accesso', () => {
  /* Meglio un accesso in piu' che una persona che non risulta mai entrata: il
     primo si vede e si spiega, la seconda non la nota nessuno. */
  for (const v of ['ieri', 'null', '2026-13-45', {}]) {
    deve(nuovo(v, ORA, 30) === true, 'con una data illeggibile smette di contare: ' + JSON.stringify(v));
  }
  return 'nel dubbio conta, invece di perdere la persona';
});

prova('il silenzio si puo\' cambiare senza toccare il codice', () => {
  deve(nuovo(fa(10), ORA, 5) === true, 'non ascolta il silenzio che gli si passa');
  deve(nuovo(fa(10), ORA, 60) === false, 'non ascolta il silenzio che gli si passa');
  deve(/process\.env\.PRESENZA_SILENZIO_MIN/.test(src), 'la mezz\'ora e\' scritta dentro il codice');
  return 'trenta minuti e\' un valore, non una legge';
});

prova('un battito perso non fa vedere un errore a nessuno', () => {
  /* Chi sta guardando le sue polizze non c'entra niente con il nostro
     contatore: un rosso a schermo per un battito perso e' un guasto inventato.
     Ma un accesso NON VALIDO resta un no: quello non e' un battito perso. */
  deve(/console\.warn\('\[convenzionati\] presenza non registrata/.test(rotta), 'un battito perso sparisce senza lasciare traccia');
  const dopoIlCatch = rotta.slice(rotta.indexOf('} catch (e) {'));
  deve(/return res\.json\(\{ ok: true \}\)/.test(dopoIlCatch), 'un guasto del contatore diventa un errore per chi guarda');
  deve(/e\.stato === 401 \|\| e\.stato === 403/.test(dopoIlCatch), 'anche un accesso non valido riceve un «va bene»');
  return 'sbaglia in silenzio, tranne quando il no e\' giusto';
});

prova('una riga per persona, non una per visita', () => {
  /* Un registro di ogni battito sarebbe migliaia di righe al giorno per dire
     due numeri, e fra un anno un archivio da svuotare. */
  deve(/resolution=merge-duplicates/.test(rotta), 'ogni battito aggiunge una riga nuova');
  deve(/quote_presenze/.test(rotta), 'non scrive da nessuna parte');
  return 'il contatore non diventa un archivio';
});

prova('l\'ultimo accesso non si scrive in due posti diversi', () => {
  /* Sulla scheda della convenzione si guarda «ultimo_accesso» dell'associato:
     se questo contatore avesse una data sua, i due numeri direbbero cose
     diverse e non si saprebbe a quale credere. */
  deve(/quote_convenzione_associati\?id=eq/.test(rotta), 'la scheda dell\'associato resta con la data vecchia');
  const i = rotta.indexOf('quote_convenzione_associati?id=eq');
  deve(/if \(nuovo\) \{/.test(rotta.slice(0, i)), 'riscrive l\'ultimo accesso a ogni battito');
  return 'un solo numero, aggiornato in un momento solo';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Chi c\'e\' adesso nell\'area ───────────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
