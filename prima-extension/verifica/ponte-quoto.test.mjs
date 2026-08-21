// ═══════════════════════════════════════════════════════════════════════════════
//  IL PONTE FRA QUOTO E L'ESTENSIONE, IN UN BROWSER VERO
//
//  Prima blocca l'indirizzo del nostro server: il preventivo si calcola nel
//  browser dell'operatore, dove la sessione Prima è viva. QUOTO e l'estensione
//  si parlano con `window.postMessage`, e questo è il punto in cui possono
//  smettere di capirsi senza che nessuno se ne accorga — perché in produzione
//  chi non riceve risposta mostra solo «quotazione non riuscita».
//
//  Qui QUOTO è la pagina VERA (index.html, aperta in un browser senza schermo)
//  e l'estensione è finta: un pezzetto di codice che parla lo stesso protocollo
//  e risponde a comando. Così si prova il contratto, non l'aritmetica — quella
//  ha le sue prove in prezzo.test.mjs.
//
//  Cosa deve reggere:
//    · QUOTO si accorge se l'estensione non c'è, e lo dice in modo utile;
//    · quando c'è, le manda i dati del preventivo con dentro il frazionamento;
//    · una risposta buona diventa un premio, una risposta d'errore diventa un
//      messaggio — mai un numero inventato;
//    · se l'estensione tace, QUOTO non resta appeso per sempre.
// ═══════════════════════════════════════════════════════════════════════════════
import path from 'path';
import { fileURLToPath } from 'url';
import { apriPreventivatore } from '../../server/verifica/banco-premi.mjs';

const RADICE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, m) => { if (!c) throw new Error(m); };

const q = await apriPreventivatore(RADICE);
const pagina = q.pagina;

/* L'estensione finta: annuncia sé stessa e risponde come quella vera.
   `modo` decide se risponde bene, male, o non risponde affatto. */
async function estensioneFinta(modo, risposta) {
  await pagina.evaluate(({ modo, risposta }) => {
    window.__finta = { richieste: [] };
    if (window.__fintaH) window.removeEventListener('message', window.__fintaH);
    /* La spia «estensione pronta» in QUOTO e' appiccicosa per costruzione: una
       volta accesa non si spegne piu'. Fra una prova e l'altra va rimessa a
       zero, altrimenti la prova successiva parte gia' convinta che
       l'estensione ci sia — e misurerebbe un'altra cosa. */
    try { __PRIMA_EXT_READY = false; } catch {}
    if (modo === 'assente') return;                     // nessun ascoltatore: come non averla
    window.__fintaH = (ev) => {
      const m = ev.data;
      if (!m || m.__quotoPrima !== 'request') return;
      window.__finta.richieste.push({ action: m.action, data: m.data });
      if (modo === 'muta') return;                       // non risponde: QUOTO deve arrendersi da solo
      const out = m.action === 'ping' ? { ok: true, ext: true } : risposta;
      window.postMessage({ __quotoPrima: 'response', reqId: m.reqId, result: out }, '*');
    };
    window.addEventListener('message', window.__fintaH);
    window.postMessage({ __quotoPrima: 'ready', version: 'finta' }, '*');
  }, { modo, risposta });
  await pagina.waitForTimeout(120);
}

/* I dati minimi perché QUOTO provi a quotare Prima. */
async function preparaAuto(frazionamento = 'Annuale') {
  await pagina.evaluate((fraz) => {
    /* AUTO_DATA e' dichiarata con `let`: NON finisce su window, quindi si
       tocca per nome. Scrivere window.AUTO_DATA creerebbe un secondo oggetto
       che la pagina non guarda — e la prova fallirebbe per il motivo
       sbagliato, che e' il modo piu' rapido di inseguire un guasto che non
       c'e'. */
    Object.assign(AUTO_DATA, {
      targa: 'AB123CD', tipoVeicolo: 'Autovettura',
      contraente: { dataNascita: '1980-05-10', cf: '', indirizzo: 'Via Roma', civico: '1',
                    cap: '91100', comune: 'Trapani', cittaIstat: '081021', cellulare: '3330000000',
                    patenteAnno: '2005', statoCivile: 'celibe' },
      _premioPrimaPromise: null,
    });
    window.__frazScelto = fraz;
    /* awDatiPolizza legge il modulo a schermo: qui si fissa la risposta, così
       la prova non dipende da come è disegnata la pagina. */
    window.awDatiPolizza = () => ({ tipoGuida: 'libera', massimale: '6.450.000', frazionamento: fraz });
  }, frazionamento);
}

// ── 1. Quando l'estensione non c'è ──────────────────────────────────────────
prova('senza estensione QUOTO non inventa un premio, e spiega cosa fare', async () => {
  await estensioneFinta('assente');
  await preparaAuto();
  const r = await pagina.evaluate(() => window.awPremioPrima());
  deve(r && r.ok === false, 'ha risposto ok con l\'estensione assente: ' + JSON.stringify(r).slice(0, 120));
  deve(/estensione/i.test(r.msg || ''), 'il messaggio non nomina l\'estensione: ' + r.msg);
  deve(/ricarica|f5/i.test(r.msg || ''), 'non dice cosa fare: ' + r.msg);
}, 40000);

// ── 2. Quando c'è, il contratto regge ───────────────────────────────────────
prova('QUOTO manda i dati del preventivo, col frazionamento scelto', async () => {
  await estensioneFinta('ok', { ok: true, premio_annuale_num: 612.5, rate: 1 });
  await preparaAuto('Semestrale');
  await pagina.evaluate(() => window.awPremioPrima());
  const chieste = await pagina.evaluate(() => window.__finta.richieste);
  const quote = chieste.find(x => x.action === 'quote');
  deve(quote, 'non ha mai chiesto un preventivo: ' + JSON.stringify(chieste.map(c => c.action)));
  deve(quote.data.targa === 'AB123CD', 'la targa non arriva: ' + quote.data.targa);
  deve(quote.data.nascita === '1980-05-10', 'la data di nascita non arriva: ' + quote.data.nascita);
  deve(quote.data.frazionamento === 'Semestrale',
    'il frazionamento scelto non arriva all\'estensione («' + quote.data.frazionamento + '»): l\'operatore sceglie e non cambia niente');
  deve(quote.data.vehicleType === 'CAR', 'il tipo veicolo non e\' tradotto: ' + quote.data.vehicleType);
}, 40000);

prova('una risposta buona diventa un premio', async () => {
  await estensioneFinta('ok', { ok: true, premio_annuale_num: 612.5, premio_annuale: '612,50 €', rate: 1, frazionamento: 'Annuale' });
  await preparaAuto();
  const r = await pagina.evaluate(() => window.awPremioPrima());
  deve(r && r.ok === true, 'non ha accettato una risposta buona: ' + JSON.stringify(r).slice(0, 140));
  deve(r.ris && r.ris.premio_annuale_num === 612.5, 'il premio non arriva: ' + JSON.stringify(r.ris).slice(0, 120));
}, 40000);

prova('una risposta d\'errore diventa un messaggio, non un numero', async () => {
  /* È il caso in cui Prima non offre il frazionamento chiesto: deve arrivare
     la spiegazione, non un premio preso da un'altra opzione. */
  await estensioneFinta('ok', { ok: false, error: 'Prima non offre il frazionamento richiesto (1 rate). Disponibili: 12 rate.' });
  await preparaAuto();
  const r = await pagina.evaluate(() => window.awPremioPrima());
  deve(r && r.ok === false, 'ha consegnato un premio da una risposta d\'errore');
  deve(/frazionamento/i.test(r.msg || ''), 'il motivo vero non arriva a schermo: ' + r.msg);
}, 40000);

// ── 3. Quando l'estensione tace ─────────────────────────────────────────────
prova('senza estensione ci si arrende in fretta, non dopo un minuto e mezzo', async () => {
  /* Questo e' il caso frequente: l'estensione non c'e' o non e' attiva.
     Il ping ha scadenze corte apposta (1,2s + 2s + 2s): l'operatore deve
     saperlo subito, non dopo i 90 secondi che servono a una quotazione vera. */
  await estensioneFinta('assente');
  await preparaAuto();
  const esito = await pagina.evaluate(async () => {
    const t0 = Date.now();
    const r = await window.awPremioPrima();
    return { ms: Date.now() - t0, ok: r && r.ok, msg: r && r.msg };
  });
  deve(esito.ok === false, 'ha risposto ok senza estensione');
  deve(esito.ms < 15000, 'ci ha messo ' + esito.ms + 'ms per dire «non c\'e\'»');
}, 60000);

prova('se l\'estensione c\'e\' ma tace, il motivo detto e\' quello giusto', async () => {
  /* Qui NON si pretende che si arrenda in fretta: una quotazione Prima vera
     puo' metterci un minuto, e accorciare l'attesa vorrebbe dire buttare via
     preventivi buoni. Si pretende che, quando rinuncia, dica che il problema
     e' l'estensione e non «Prima non ha voluto quotare» — sono due cose che
     si risolvono in modi diversi. */
  await estensioneFinta('muta');
  await preparaAuto();
  const r = await pagina.evaluate(() => window.awPremioPrima());
  deve(r && r.ok === false, 'ha risposto ok con l\'estensione muta');
  deve(/estensione/i.test(r.msg || ''), 'non spiega che il problema e\' l\'estensione: ' + r.msg);
}, 180000);

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nPONTE QUOTO ↔ ESTENSIONE PRIMA');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + String(e.message).slice(0, 300)); }
}
await q.chiudi();
console.log(`\nPONTE PRIMA: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
