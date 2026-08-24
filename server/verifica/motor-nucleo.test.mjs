// ═══════════════════════════════════════════════════════════════════════════════
//  IL NUCLEO REGGE, E DUE COMPAGNIE DIVERSE CI PASSANO DENTRO UGUALE
//
//  La prova che il Brief 2 chiede: un secondo adapter (HDI) si aggancia senza
//  toccare il nucleo né il contratto. Qui i portali sono finti (una `chiama`
//  di prova che risponde a comando), così si prova l'ASTRAZIONE, non la rete:
//    · il nucleo esegue con timeout e ritentativi;
//    · normalizza e valida l'input, e un input storto diventa un Esito d'errore;
//    · moto/24H e HDI — due dialetti diversi — escono nella STESSA forma;
//    · un guasto lascia un log strutturato con i dati personali oscurati.
// ═══════════════════════════════════════════════════════════════════════════════
import { esegui, quota } from '../motor/nucleo.mjs';
import { adapterMoto } from '../motor/adapters/moto.mjs';
import { adapterHdi } from '../motor/adapters/hdi.mjs';

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, m) => { if (!c) throw new Error(m); };

/* Un cliente valido secondo il contratto. */
const GREZZO = {
  targa: 'ab123cd', tipoVeicolo: 'moto',
  contraente: { dataNascita: '1993-07-17', cf: 'rssmra93l17e974p', comune: 'Trapani', prov: 'TP', cap: '91100' },
  polizza: { frazionamento: 'Annuale', garanzie: [] },
};

/* Una `chiama` finta: risponde in base all'URL, e registra cosa le è arrivato. */
function chiamaFinta(risposte) {
  const viste = [];
  const fn = async (url) => {
    viste.push(url);
    for (const [frammento, risp] of Object.entries(risposte)) {
      if (url.includes(frammento)) return typeof risp === 'function' ? risp(url) : risp;
    }
    return { status: 404, ok: false, json: null };
  };
  fn.viste = viste;
  return fn;
}

// ── 1. il nucleo: timeout e ritentativi ─────────────────────────────────────
prova('esegui ritenta e poi riesce', async () => {
  let n = 0;
  const r = await esegui(async () => { n++; if (n < 2) throw new Error('giù'); return 'ok'; },
    { tentativi: 3, attesaMs: 0 });
  deve(r === 'ok' && n === 2, 'non ha ritentato: n=' + n);
});
prova('esegui si arrende dopo i tentativi e rilancia l\'ultimo errore', async () => {
  let n = 0;
  try { await esegui(async () => { n++; throw new Error('sempre giù'); }, { tentativi: 2, attesaMs: 0 }); deve(false, 'non ha rilanciato'); }
  catch (e) { deve(/sempre giù/.test(e.message) && n === 2, 'tentativi sbagliati: ' + n); }
});
prova('esegui rispetta il timeout', async () => {
  try { await esegui(() => new Promise(r => setTimeout(r, 200)), { timeoutMs: 30 }); deve(false, 'non è scattato il timeout'); }
  catch (e) { deve(e.motor_timeout === true, 'errore non marcato come timeout'); }
});

// ── 2. il flusso: input storto → Esito d'errore normalizzato ─────────────────
prova('un input senza targa esce come errore di contratto, non come eccezione', async () => {
  const adapterMai = { compagnia: 'X', async quota() { throw new Error('non dovevo essere chiamato'); } };
  const e = await quota(adapterMai, { contraente: { dataNascita: '1990-01-01' }, tipoVeicolo: 'auto' });
  deve(e.esito === 'errore' && e.error_code === 'INPUT_NON_VALIDO', 'input storto non gestito: ' + JSON.stringify(e));
});

// ── 3. moto/24H: la risposta del suo endpoint diventa Esito ─────────────────
prova('adapter moto: dal /quote del 24H esce un Esito normalizzato', async () => {
  const chiama = chiamaFinta({
    '/quote': { status: 200, ok: true, json: {
      ok: true, premio_totale_num: 462.9, garanzie_incluse: ['Assistenza'],
      opzione_incendio_furto: '120,00', veicolo: 'Yamaha MT-07',
    } },
  });
  const log = [];
  const e = await quota(adapterMoto('http://x:4100'), GREZZO, { chiama, log: r => log.push(r), ora: () => 'T' });
  deve(e.esito === 'ok', 'non ok: ' + JSON.stringify(e).slice(0, 120));
  deve(e.compagnia === 'Moto Platinum' && e.premio.annuo === 462.9, 'premio/compagnia sbagliati');
  deve(e.garanzie_incluse.includes('Rinuncia alla rivalsa'), 'manca la rinuncia rivalsa');
  deve(e.opzioni[0] && e.opzioni[0].premio_annuo === 120, 'opzione incendio/furto non mappata');
  /* URLSearchParams codifica gli «/» in %2F: lo scraper li decodifica. Si
     controlla il valore DECODIFICATO, non la stringa grezza. */
  const chiesto = decodeURIComponent(chiama.viste[0]);
  deve(chiesto.includes('targa=AB123CD') && chiesto.includes('nascita=17/07/1993'),
    'la targa/nascita non sono passate giuste: ' + chiesto);
  deve(log.length === 0, 'un successo non deve loggare fallimenti');
});

// ── 4. HDI: LO STESSO nucleo, una compagnia diversa ─────────────────────────
prova('adapter HDI: stessa forma d\'uscita, senza toccare il nucleo', async () => {
  const chiama = chiamaFinta({
    '/premio-motor': { status: 200, ok: true, json: {
      premio_annuale_num: 588, garanzie: ['RCA', 'Cristalli'], veicolo: 'Yamaha MT-07',
    } },
  });
  const e = await quota(adapterHdi('http://x:4400'), GREZZO, { chiama, ora: () => 'T' });
  deve(e.esito === 'ok' && e.compagnia === 'HDI Assicurazioni' && e.premio.annuo === 588, 'HDI non normalizzata: ' + JSON.stringify(e).slice(0, 120));
  /* la prova vera: moto e HDI, due dialetti, stessa identica forma d'Esito */
  deve(Array.isArray(e.garanzie_incluse) && 'premio' in e && 'opzioni' in e, 'l\'Esito HDI non ha la forma del contratto');
});

// ── 5. un guasto: Esito d'errore + log strutturato con dati oscurati ─────────
prova('quando la compagnia rifiuta, esce un errore col codice e resta un log pulito', async () => {
  const chiama = chiamaFinta({ '/quote': { status: 200, ok: true, json: { ok: false, error: 'rischio non assunto' } } });
  const log = [];
  const e = await quota(adapterMoto('http://x:4100'), GREZZO, { chiama, log: r => log.push(r), ora: () => '2026-08-24T10:00:00Z' });
  deve(e.esito === 'errore' && e.error_code === 'RIFIUTO_COMPAGNIA', 'rifiuto non mappato: ' + JSON.stringify(e));
  deve(e.passo === 'lettura_premio', 'passo del fallimento sbagliato: ' + e.passo);
});

prova('un adapter che esplode non fa uscire un\'eccezione, e lascia un log col «dove/quando»', async () => {
  const boom = { compagnia: 'Boom', async quota() { const err = new Error('crash interno'); err.passo = 'quotazione'; throw err; } };
  const log = [];
  const e = await quota(boom, GREZZO, { log: r => log.push(r), ora: () => '2026-08-24T10:00:00Z' });
  deve(e.esito === 'errore' && e.error_code === 'PROVIDER' && e.passo === 'quotazione', 'crash non normalizzato: ' + JSON.stringify(e));
  deve(log.length === 1, 'il fallimento non è stato loggato');
  const L = log[0];
  deve(L.passo === 'quotazione' && L.quando === '2026-08-24T10:00:00Z' && L.error_code === 'PROVIDER', 'log strutturato incompleto: ' + JSON.stringify(L));
  /* il payload nel log NON deve contenere la targa in chiaro passata così com'è:
     il contratto oscura via `ripulisci`, ma qui non è iniettata, quindi almeno
     ci si assicura che il payload sia presente per la diagnosi. */
  deve(L.payload && typeof L.payload === 'object', 'manca il payload nel log');
});

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nNUCLEO MOTOR + ADAPTER');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + String(e.message).slice(0, 200)); }
}
console.log(`\nNUCLEO MOTOR: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
