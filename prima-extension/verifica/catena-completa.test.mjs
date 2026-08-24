// ═══════════════════════════════════════════════════════════════════════════════
//  LA CATENA INTERA, IN UN CHROME VERO, CON L'ESTENSIONE DAVVERO INSTALLATA
//
//  Le altre prove guardano i pezzi: prezzo.test.mjs l'aritmetica, montaggio la
//  forma dei file, ponte-quoto il protocollo con un'estensione finta. Nessuna
//  dice la cosa che conta davvero all'operatore:
//
//      «premo Quota su QUOTO e mi esce il premio giusto di Prima?»
//
//  Qui la catena c'è tutta e per intero, senza finte:
//    QUOTO (pagina vera) → quoto-bridge.js → background.js (service worker) →
//    scheda Prima → bridge.js → page-hook.js → prezzo.js → e ritorno.
//  L'estensione è quella vera, caricata in Chromium da cartella come farebbe
//  Francesco da chrome://extensions.
//
//  L'unica cosa finta è PRIMA: il suo server non si può chiamare (Cloudflare
//  blocca il nostro indirizzo, ed è il motivo per cui esiste l'estensione), e
//  comunque una prova non deve creare preventivi veri. Le tre chiamate GraphQL
//  vengono intercettate e risposte con dati della forma vera.
//
//  LA TRAPPOLA È APPARECCHIATA APPOSTA: Prima restituisce la MENSILE PER PRIMA.
//  Il codice vecchio prendeva `installments[0]` e la chiamava «premio annuale»,
//  quindi avrebbe consegnato 50 € invece di 588 €. Se un giorno quel difetto
//  torna, questa prova diventa rossa qui, non in agenzia davanti al cliente.
// ═══════════════════════════════════════════════════════════════════════════════
import { chromiumPlaywright as chromium } from '../../server/verifica/banco-premi.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const EXT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RADICE = path.dirname(EXT);
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, m) => { if (!c) throw new Error(m); };

/* ── il finto Prima ────────────────────────────────────────────────────────
   Risponde come la covers-api vera, ma con la MENSILE per prima: è la
   disposizione che faceva sbagliare il codice vecchio. */
const RATA_MENSILE = 50;      //  ×12 = 600 in un anno
const PREMIO_ANNUALE = 588;   //  chi paga in una volta spende meno

const opzione = (count, nome, prezzo) => ({
  installmentConfiguration: { count, slug: nome.toLowerCase(), size: null, labels: { name: nome } },
  guarantees: [
    { slug: 'rca', label: 'RC Auto', selected: true, priceBlocks: [{ coveragePrice: { legal: String(prezzo) } }] },
    { slug: 'cristalli', label: 'Cristalli', selected: false, priceBlocks: [{ coveragePrice: { legal: '30' } }] },
  ],
});

const RISPOSTA_PREZZI = {
  data: { quote: { __typename: 'Quote', installmentPrices: [{ installments: [
    opzione(12, 'Mensile', RATA_MENSILE),
    opzione(1, 'Annuale', PREMIO_ANNUALE),
  ] }] } },
};

const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function apriBanco() {
  const profilo = fs.mkdtempSync('/tmp/quoto-prima-');
  const ctx = await chromium.launchPersistentContext(profilo, {
    executablePath: CHROMIUM,
    headless: false,
    args: ['--headless=new', '--no-sandbox',
           '--disable-extensions-except=' + EXT, '--load-extension=' + EXT],
  });

  const chiamate = [];   // che cosa ha chiesto l'estensione a Prima

  /* QUOTO: servito dai file veri del repo, ma all'indirizzo vero — perché è
     l'indirizzo a decidere se Chrome inietta quoto-bridge.js. */
  await ctx.route('https://quoto.withusassicurazioni.it/**', async (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '') || 'index.html';
    const f = path.join(RADICE, rel);
    if (!f.startsWith(RADICE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'no' });
    return route.fulfill({ status: 200, contentType: TIPI[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });

  /* Prima: le tre chiamate GraphQL del preventivo. */
  await ctx.route('https://intermediari.prima.it/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const corpo = req.method() === 'POST' ? (req.postData() || '') : '';
    const rispondi = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });

    if (url.pathname === '/api/graphql') {
      if (/cities/.test(corpo))     { chiamate.push('cities');     return rispondi({ data: { cities: [{ name: 'Trapani', istat: '081021', province: 'TP', zipCodes: [{ zip: '91100' }] }] } }); }
      if (/fastQuote/.test(corpo))  { chiamate.push('fastQuote');  return rispondi({ data: { fastQuote: { valid: true, errors: [], uniqueIdentifier: '11111111-2222-3333-4444-555555555555' } } }); }
      if (/authorizeSalesFlow/.test(corpo)) { chiamate.push('authorizeSalesFlow'); return rispondi({ data: { authorizeSalesFlow: { token: 'token-di-prova' } } }); }
      return rispondi({ errors: [{ message: 'query non prevista dal banco' }] });
    }
    if (url.pathname === '/mfe/covers-api/graphql') {
      chiamate.push('covers-api' + (/Bearer token-di-prova/.test(JSON.stringify(req.headers())) ? ' (col token)' : ' (SENZA token)'));
      return rispondi(RISPOSTA_PREZZI);
    }
    /* La pagina del portale: qui basta che esista, perché è il posto dove
       Chrome inietta prezzo.js e page-hook.js. */
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Prima (finto)</title><h1>banco di prova</h1>' });
  });

  /* La scheda Prima va aperta PER PRIMA: background.js cerca una scheda su
     prima.it, e senza quella si ferma prima di cominciare. */
  const prima = await ctx.newPage();
  await prima.goto('https://intermediari.prima.it/preventivi', { waitUntil: 'domcontentloaded' });

  const quoto = await ctx.newPage();
  const erroriPagina = [];
  quoto.on('pageerror', e => erroriPagina.push(String(e).slice(0, 200)));
  await quoto.goto('https://quoto.withusassicurazioni.it/index.html', { waitUntil: 'domcontentloaded' });
  await quoto.waitForTimeout(1500);

  return { ctx, prima, quoto, chiamate, erroriPagina, chiudi: () => ctx.close() };
}

const banco = await apriBanco();
const { quoto, prima } = banco;

/* I dati minimi perché QUOTO provi a quotare Prima, col frazionamento scelto. */
async function preparaAuto(frazionamento) {
  await quoto.evaluate((fraz) => {
    Object.assign(AUTO_DATA, {
      targa: 'AB123CD', tipoVeicolo: 'Autovettura',
      contraente: { dataNascita: '1980-05-10', cf: '', indirizzo: 'Via Roma', civico: '1',
                    cap: '91100', comune: 'Trapani', cittaIstat: '', cellulare: '3330000000',
                    patenteAnno: '2005', statoCivile: 'celibe' },
      _premioPrimaPromise: null,
    });
    window.awDatiPolizza = () => ({ tipoGuida: 'libera', massimale: '6.450.000', frazionamento: fraz });
  }, frazionamento);
}

// ── 1. l'estensione è viva e si è fatta riconoscere ─────────────────────────
prova('l\'estensione si installa davvero e si annuncia a QUOTO', async () => {
  /* Se il manifest ha un errore Chrome la scarta in silenzio: si vedrebbe solo
     «estensione non trovata» in agenzia. Il service worker vivo e' la prova
     che Chrome l'ha accettata. */
  const sw = banco.ctx.serviceWorkers()[0] || await banco.ctx.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null);
  deve(sw && /background\.js$/.test(sw.url()), 'Chrome non ha caricato l\'estensione: nessun service worker');
  const vista = await quoto.evaluate(() => { try { return __PRIMA_EXT_READY === true; } catch { return false; } });
  deve(vista, 'QUOTO non si e\' accorto dell\'estensione: il ponte su withusassicurazioni.it non parte');
});

prova('prezzo.js è caricato nella pagina di Prima, e funziona lì dentro', async () => {
  /* Il montaggio si controlla nel manifest, ma solo qui si vede se Chrome lo
     esegue davvero nel mondo della pagina, e PRIMA di chi lo usa. */
  const r = await prima.evaluate(() => {
    if (!window.__QP_PREZZO) return { c: false };
    const q = { installmentPrices: [{ installments: [
      { installmentConfiguration: { count: 12 }, guarantees: [{ slug: 'rca', selected: true, priceBlocks: [{ coveragePrice: { legal: '50' } }] }] },
      { installmentConfiguration: { count: 1 },  guarantees: [{ slug: 'rca', selected: true, priceBlocks: [{ coveragePrice: { legal: '588' } }] }] },
    ] }] };
    const p = window.__QP_PREZZO.leggiPremio(q, 'Annuale');
    return { c: true, ok: p.ok, annuo: p.premio_annuo };
  });
  deve(r.c, 'window.__QP_PREZZO non esiste nella pagina Prima: prezzo.js non viene eseguito');
  deve(r.ok && r.annuo === 588, 'la lettura del premio non funziona dentro Chrome: ' + JSON.stringify(r));
});

prova('il pannello Fonti dice che l\'estensione c\'e\', invece di far tirare a indovinare', async () => {
  /* La card Prima nel pannello Fonti chiede al browser se l'estensione e'
     installata. Il pannello vero vuole il login da amministratore, che una
     prova non deve fare: qui si mette solo la casella dove scrive e si chiama
     la funzione — e' quella il pezzo che puo' sbagliare. */
  const testo = await quoto.evaluate(async () => {
    const d = document.createElement('div'); d.id = 'prima-ext-stato'; document.body.appendChild(d);
    await window.primaControllaEstensione();
    return d.textContent || '';
  });
  deve(/attiva/i.test(testo), 'con l\'estensione installata il pannello dice: «' + testo.trim().slice(0, 120) + '»');
  deve(!/non rilevata/i.test(testo), 'manda a reinstallare un\'estensione che c\'e\' gia\': ' + testo.trim().slice(0, 120));
}, 30000);

// ── 2. la catena intera ─────────────────────────────────────────────────────
prova('QUOTO chiede un preventivo annuale e riceve il premio ANNUALE, non la rata', async () => {
  await preparaAuto('Annuale');
  const r = await quoto.evaluate(() => window.awPremioPrima());
  deve(r && r.ok === true, 'la catena non ha consegnato un premio: ' + JSON.stringify(r).slice(0, 300));
  deve(r.ris.premio_annuale_num === PREMIO_ANNUALE,
    'premio ' + r.ris.premio_annuale_num + ' invece di ' + PREMIO_ANNUALE +
    (r.ris.premio_annuale_num === 50 ? ' — ha preso la prima opzione (la mensile) e l\'ha chiamata annuale: e\' TORNATO IL DIFETTO' : ''));
  deve(r.ris.compagnia === 'Prima', 'non si presenta come Prima: ' + r.ris.compagnia);
}, 120000);

prova('le tre chiamate a Prima sono state fatte, e la terza col token del preventivo', async () => {
  /* Il token della covers-api si conia per QUEL preventivo: senza, Prima
     risponde 401 e in agenzia si vedrebbe solo «quotazione non riuscita». */
  const c = banco.chiamate;
  deve(c.includes('fastQuote'), 'non ha mai creato il preventivo: ' + c.join(', '));
  deve(c.includes('authorizeSalesFlow'), 'non ha coniato il token: ' + c.join(', '));
  deve(c.some(x => x === 'covers-api (col token)'), 'la covers-api e\' stata chiamata senza il token: ' + c.join(', '));
});

prova('se l\'operatore sceglie la mensile, vede la rata E quanto spende in un anno', async () => {
  await preparaAuto('Mensile');
  const r = await quoto.evaluate(() => window.awPremioPrima());
  deve(r && r.ok === true, 'la mensile non passa: ' + JSON.stringify(r).slice(0, 250));
  deve(r.ris.rata === 50, 'la rata mensile e\' ' + r.ris.rata + ' invece di 50');
  deve(r.ris.premio_annuale_num === 600, 'in un anno spende ' + r.ris.premio_annuale_num + ' invece di 600 (12 x 50)');
  deve(r.ris.rate === 12, 'rate ' + r.ris.rate);
}, 120000);

prova('un frazionamento che Prima non offre diventa una spiegazione, non un numero', async () => {
  await preparaAuto('Trimestrale');       // il finto Prima offre solo mensile e annuale
  const r = await quoto.evaluate(() => window.awPremioPrima());
  deve(r && r.ok === false, 'ha consegnato ' + String(JSON.stringify(r && r.ris)).slice(0, 120) + ' per un frazionamento che Prima non offre');
  deve(/frazionamento/i.test(r.msg || ''), 'il motivo vero non arriva a schermo: ' + r.msg);
}, 120000);

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nCATENA COMPLETA — QUOTO → estensione → Prima (finto) → premio');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + String(e.message).slice(0, 400)); }
}
if (banco.erroriPagina.length) console.log('\n  (errori nella pagina QUOTO: ' + banco.erroriPagina.slice(0, 2).join(' | ') + ')');
await banco.chiudi();
console.log(`\nCATENA COMPLETA: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
