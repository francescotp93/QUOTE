// ═══════════════════════════════════════════════════════════════════════════════
//  L'ANAGRAFICA CHE L'ASSOCIATO COMPILA DA SOLO
//
//  PERCHE' ESISTE
//    «L'associato deve vedere le sue richieste, le sue polizze e la sua
//     anagrafica per poterla completare» — Francesco, 02/09/2026.
//
//    Compilarla lui significa scrivere su una riga che non e' tutta sua: li'
//    dentro ci sono anche se e' un lead, chi e' l'intermediario, chi l'ha
//    creata. Aprirla in scrittura dal browser vorrebbe dire aprirla tutta.
//    Quindi si elencano i campi che puo' toccare e si costruisce la scrittura
//    DA QUELL'ELENCO — non da quello che arriva: cosi' un campo in piu' nella
//    richiesta non ha nessuna strada per entrare.
//
//    E «completa» non vuol dire «tutti i campi pieni»: vuol dire che ci si puo'
//    fare un preventivo ed emettere. Un allarme che si accende per un campo che
//    non serve e' un allarme che si impara a ignorare.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const mod = await import('./convenzionati.js').catch(() => ({}));
const manca = mod.cosaMancaAllAnagrafica || (() => { throw new Error('cosaMancaAllAnagrafica non esiste ancora'); });
const storta = mod.anagraficaStorta || (() => { throw new Error('anagraficaStorta non esiste ancora'); });
const CAMPI = mod.CAMPI_ANAGRAFICA || null;

const QUI = path.dirname(fileURLToPath(import.meta.url));
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const src = senzaCommenti(fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8'));
const salva = src.slice(src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/salva-anagrafica'"));

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const PIENA = {
  cognome: 'Rossi', nome: 'Mario', codice_fiscale: 'RSSMRA80A01H501U', data_nascita: '1980-01-01',
  indirizzo: 'Via Roma', civico: '1', cap: '91100', comune: 'Trapani', provincia: 'TP',
  cellulare: '3331234567', email: 'mario@esempio.it',
};

prova('quello che manca si dice come lo ha letto lui', () => {
  const m = manca({ ...PIENA, codice_fiscale: '', cap: '  ' });
  deve(m.includes('Codice fiscale'), 'non segnala il codice fiscale mancante: ' + JSON.stringify(m));
  deve(m.includes('CAP'), 'una riga di spazi conta come compilata');
  deve(!m.includes('codice_fiscale'), 'lo chiama col nome della colonna');
  return 'etichette, non nomi di colonne';
});

prova('un\'anagrafica completa non accende nessun allarme', () => {
  deve(manca(PIENA).length === 0, 'segnala come mancante: ' + manca(PIENA).join(', '));
  return 'chi ha finito non vede triangoli';
});

prova('i campi che non servono a quotare non fanno lampeggiare niente', () => {
  /* Un allarme che si accende per la PEC di un privato e' un allarme che si
     impara a ignorare — e poi non si vede quello vero. */
  const m = manca({ ...PIENA, pec: '', partita_iva: '', professione: '' });
  deve(m.length === 0, 'pretende campi che non servono: ' + m.join(', '));
  return 'lampeggia solo per quello che serve davvero';
});

prova('senza niente, dice tutto quello che manca', () => {
  const m = manca({});
  deve(m.length === 11, 'ne conta ' + m.length + ' invece di 11');
  deve(m[0] === 'Cognome', 'non li elenca nell\'ordine del modulo');
  return 'undici cose, nell\'ordine in cui le vede';
});

prova('non si scrive quello che non e\' nell\'elenco', () => {
  /* E' la regola per cui esiste questa rotta. «lead», «intermediario_id»,
     «creato_da» stanno sulla stessa riga e non sono suoi. */
  deve(/for \(const c of CAMPI_ANAGRAFICA\)/.test(salva), 'costruisce la scrittura da quello che arriva dal browser');
  const chiavi = (CAMPI || []).map(c => c.k);
  for (const proibito of ['lead', 'intermediario_id', 'creato_da', 'lead_origine', 'note']) {
    deve(!chiavi.includes(proibito), 'l\'elenco dei campi suoi comprende «' + proibito + '»');
  }
  return 'quattordici campi suoi, e nient\'altro';
});

prova('sbagliato e incompleto sono due cose diverse', () => {
  /* Un campo vuoto non e' un errore: e' un campo vuoto. Se il controllo
     scattasse anche li', chi comincia a compilare verrebbe fermato subito. */
  deve(storta({}) === null, 'un modulo appena aperto viene gia\' rifiutato');
  deve(storta({ codice_fiscale: '' }) === null, 'un campo vuoto viene trattato come sbagliato');
  deve(storta({ codice_fiscale: 'ABC' }) !== null, 'accetta un codice fiscale che non lo e\'');
  deve(storta({ cap: '911' }) !== null, 'accetta un CAP di tre cifre');
  deve(storta({ email: 'mario' }) !== null, 'accetta un indirizzo che non e\' un indirizzo');
  deve(storta(PIENA) === null, 'rifiuta un\'anagrafica giusta: ' + storta(PIENA));
  return 'si contesta quello che c\'e\', non quello che manca';
});

prova('ogni rifiuto dice cosa c\'e\' che non va', () => {
  deve(/16 caratteri/.test(storta({ codice_fiscale: 'ABC' })), 'per il codice fiscale non dice quanto dev\'essere lungo');
  deve(/cinque cifre/.test(storta({ cap: '911' })), 'per il CAP non dice quante cifre');
  return 'due rifiuti, due indicazioni';
});

prova('il nominativo non resta indietro', () => {
  /* E' quello che si legge in tutte le altre schermate: se cambia il cognome e
     lui no, l'anagrafica sembra di un'altra persona. */
  deve(/dati\.nominativo =/.test(salva), 'cambiando cognome, il nome mostrato altrove resta quello vecchio');
  return 'cambia il cognome, cambia dappertutto';
});

prova('la riga non esce cosi\' com\'e\'', () => {
  // Contiene note interne dell'agenzia: non sono roba sua.
  deve(/function anagraficaPulita/.test(src), 'consegna la riga intera del database');
  const f = src.slice(src.indexOf('function anagraficaPulita'), src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/mia-anagrafica'"));
  deve(/for \(const c of CAMPI_ANAGRAFICA\)/.test(f), 'sceglie a mano cosa togliere invece di scegliere cosa dare');
  return 'si da\' quello che e\' suo, non si toglie quello che non lo e\'';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── L\'anagrafica dell\'associato ─────────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
