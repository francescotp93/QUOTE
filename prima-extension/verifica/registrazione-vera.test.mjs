// ═══════════════════════════════════════════════════════════════════════════════
//  LA REGISTRAZIONE INTERA, IN UN CHROME VERO, CON L'ESTENSIONE INSTALLATA
//
//  «Continuano a non arrivare le chiamate, puoi sistemarlo in maniera
//  semplice? Fai le giuste prove» (Francesco, 10/09/2026). Fino a qui la
//  registrazione era provata a pezzi: il registratore senza browser, il
//  manifest, il server. Nessuna prova faceva la cosa che conta:
//
//      «premo Registra, faccio il preventivo, premo Ferma: la cattura arriva?»
//
//  Qui la catena c'e' tutta: popup vero → service worker → ponte → gancio nella
//  pagina del portale → di nuovo il service worker → consegna al server.
//  L'estensione e' quella vera, caricata da cartella come da chrome://extensions.
//  Le uniche cose finte sono il portale (Groupama, all'indirizzo vero, perche'
//  e' l'indirizzo che decide se Chrome inietta il gancio), IAM e il server.
//
//  LA TRAPPOLA E' QUELLA DI FRANCESCO: la scheda del portale e' APERTA PRIMA di
//  premere Registra. E' cosi' che si usa davvero, ed e' il caso in cui la
//  cattura tornava vuota.
// ═══════════════════════════════════════════════════════════════════════════════
import { chromiumPlaywright as chromium } from '../../server/verifica/banco-premi.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const EXT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHIAVE = 'wuc_' + 'k'.repeat(43);

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, m) => { if (!c) throw new Error(m); };
const attendi = async (cond, ms, cosa) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 150)); } throw new Error('scaduto: ' + cosa); };

/* Il portale finto: una pagina che, a comando, fa una fetch e una XHR come
   farebbe un portale vero — con un Bearer e una password dentro. */
const PORTALE = `<!doctype html><title>Groupama (finto)</title><h1>banco</h1>
<script>
  window.faiChiamate = async () => {
    await fetch('/pda/api/preventivo', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer segretissimo' }, body: JSON.stringify({ targa: 'GY263BY', password: 'nonDeveUscire' }) });
    await new Promise((ok) => { const x = new XMLHttpRequest(); x.open('GET', '/pda/api/tariffe?targa=GY263BY'); x.setRequestHeader('X-Api-Key', 'k-segreta'); x.onloadend = ok; x.send(); });
    await fetch('https://www.google-analytics.com/collect?v=1').catch(() => {});
    return 'fatte';
  };
</script>`;

const IAM = `<!doctype html><title>IAM (finto)</title>
<script>
  window.chiedi = (action, data) => new Promise((ok, no) => {
    const reqId = 'p' + Math.random().toString(36).slice(2);
    const h = (ev) => { if (ev.source !== window || !ev.data || ev.data.__withusConnettore !== 'response' || ev.data.reqId !== reqId) return; window.removeEventListener('message', h); ok(ev.data.result); };
    window.addEventListener('message', h);
    window.postMessage({ __withusConnettore: 'request', reqId, action, data }, '*');
    setTimeout(() => { window.removeEventListener('message', h); no(new Error('estensione muta')); }, 3000);
  });
</script>`;

async function apriBanco() {
  const profilo = fs.mkdtempSync('/tmp/withus-connettore-');
  const ctx = await chromium.launchPersistentContext(profilo, {
    executablePath: CHROMIUM, headless: false,
    args: ['--headless=new', '--no-sandbox', '--disable-extensions-except=' + EXT, '--load-extension=' + EXT],
  });
  const consegne = [];           // cosa e' arrivato al server finto
  let serverRisponde = 200;      // si puo' far finta che il server sia giu'
  await ctx.route('https://accedi.groupama.it/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/pda/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, token: 'tok-risposta', premio: 412.5, via: u.pathname }) });
    return route.fulfill({ status: 200, contentType: 'text/html', body: PORTALE });
  });
  await ctx.route('https://www.google-analytics.com/**', (route) => route.fulfill({ status: 200, body: '' }));
  await ctx.route('https://iam.withusassicurazioni.it/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: IAM }));
  await ctx.route('https://api.withusassicurazioni.it/**', async (route) => {
    const req = route.request();
    consegne.push({ url: req.url(), chiave: req.headers()['x-connettore-chiave'] || '', corpo: JSON.parse(req.postData() || 'null'), stato: serverRisponde });
    if (serverRisponde !== 200) return route.fulfill({ status: serverRisponde, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'giu\' per finta' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'cprova' }) });
  });
  /* L'id dell'estensione lo dice il suo service worker. */
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const ID = new URL(sw.url()).host;
  const popup = async () => { const p = await ctx.newPage(); await p.goto('chrome-extension://' + ID + '/popup.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600); return p; };
  return { ctx, sw, ID, popup, consegne, setServer: (s) => { serverRisponde = s; }, chiudi: () => ctx.close() };
}

const banco = await apriBanco();
const erroriPortale = [];

/* 1. IAM collega l'estensione. */
const iam = await banco.ctx.newPage();
await iam.goto('https://iam.withusassicurazioni.it/', { waitUntil: 'domcontentloaded' });
await iam.waitForTimeout(800);

prova('IAM vede l\'estensione e la collega con la chiave', async () => {
  const st = await iam.evaluate(() => window.chiedi('stato'));
  deve(st && st.ext === true && st.versione, 'IAM non vede l\'estensione: ' + JSON.stringify(st));
  deve(st.collegato === false, 'risulta collegata prima di ricevere una chiave');
  const c = await iam.evaluate((k) => window.chiedi('collega', { chiave: k, api: 'https://api.withusassicurazioni.it' }), CHIAVE);
  deve(c && c.ok, 'il collegamento non riesce: ' + JSON.stringify(c));
  const st2 = await iam.evaluate(() => window.chiedi('stato'));
  deve(st2.collegato === true, 'dopo «collega» risulta ancora scollegata');
  return 'v' + st.versione + ', collegata';
});

/* 2. La scheda del portale e' aperta PRIMA di premere Registra. */
const portale = await banco.ctx.newPage();
portale.on('pageerror', e => erroriPortale.push(String(e).slice(0, 200)));
await portale.goto('https://accedi.groupama.it/pda/PortaleGA/index.xhtml', { waitUntil: 'domcontentloaded' });
await portale.waitForTimeout(800);

prova('senza Registra non si registra niente', async () => {
  await portale.evaluate(() => window.faiChiamate());
  await portale.waitForTimeout(600);
  const rec = await banco.sw.evaluate(() => chrome.storage.local.get('rec').then(o => o.rec || {}));
  deve(!rec.on && !(rec.n > 0), 'ha registrato senza che nessuno abbia premuto Registra: ' + JSON.stringify(rec));
  return 'zero, com\'e\' giusto';
});

let pop;
prova('dal popup si preme Registra, col portale gia\' scelto dalla scheda attiva', async () => {
  await portale.bringToFront();
  pop = await banco.popup();
  /* Il popup vero apre come pagina: la scheda attiva per lui e' se stesso, non
     il portale. Quindi il portale si sceglie a mano, come farebbe chi non e'
     sulla scheda giusta. */
  await pop.selectOption('#portale', 'groupama');
  await pop.fill('#caso', 'RC auto, Panda 2019, targa GY263BY');
  await pop.click('#avvia');
  await attendi(() => pop.evaluate(() => document.getElementById('rec-ferma').style.display !== 'none'), 4000, 'il popup non passa a «Ferma»');
  const rec = await banco.sw.evaluate(() => chrome.storage.local.get('rec').then(o => o.rec || {}));
  deve(rec.on === true && rec.portale === 'groupama', 'la registrazione non e\' partita: ' + JSON.stringify(rec));
  /* «Registra» va a cercare le schede del portale gia' aperte e ci mette il
     gancio: e' il caso di chi ha la scheda aperta da prima dell'estensione. */
  const msg = await pop.evaluate(() => document.getElementById('rec-msg').textContent);
  deve(/1 scheda di Groupama agganciata/.test(msg), 'il popup non dice di aver agganciato la scheda aperta: ' + msg);
  return 'registra Groupama, scheda agganciata';
});

prova('l\'aggancio a mano non raddoppia niente: ogni chiamata si conta una volta', async () => {
  /* La scheda aveva gia' il gancio dal manifest; «Registra» ce l'ha iniettato
     di nuovo. Se le guardie non tenessero, ogni chiamata arriverebbe due volte. */
  const r = await banco.sw.evaluate(() => armaSchede('groupama'));
  deve(r.schede >= 1 && r.agganciate === r.schede, 'l\'aggancio a mano fallisce: ' + JSON.stringify(r));
  return 'iniettato tre volte in tutto, e si contera\' una volta sola';
});

prova('la scheda aperta PRIMA di Registra registra lo stesso, senza F5', async () => {
  await portale.evaluate(() => window.faiChiamate());
  await attendi(async () => (await banco.sw.evaluate(() => chrome.storage.local.get('rec').then(o => (o.rec || {}).n || 0))) >= 2, 6000, 'le chiamate non arrivano al service worker');
  const n = await banco.sw.evaluate(() => chrome.storage.local.get('rec').then(o => (o.rec || {}).n || 0));
  deve(n === 2, 'attese 2 chiamate (fetch + xhr), contate ' + n + ': o manca una, o e\' entrato il tracciatore');
  return '2 chiamate, tracciatore escluso';
});

prova('dopo una ricarica della scheda si continua a registrare', async () => {
  await portale.reload({ waitUntil: 'domcontentloaded' });
  await portale.waitForTimeout(800);
  await portale.evaluate(() => window.faiChiamate());
  await attendi(async () => (await banco.sw.evaluate(() => chrome.storage.local.get('rec').then(o => (o.rec || {}).n || 0))) >= 4, 6000, 'dopo F5 non registra piu\'');
  return 'la ricarica non spegne niente';
});

prova('«Ferma e manda» consegna al server, con i segreti mascherati', async () => {
  await pop.bringToFront();
  await pop.click('#ferma');
  await attendi(() => Promise.resolve(banco.consegne.length > 0), 6000, 'niente e\' partito verso il server');
  const c = banco.consegne[0];
  deve(/\/fonti\/connettore\/catture$/.test(c.url), 'indirizzo sbagliato: ' + c.url);
  deve(c.chiave === CHIAVE, 'la chiave data da IAM non viaggia con la cattura');
  const b = c.corpo;
  deve(b && b.portale === 'groupama' && /GY263BY/.test(b.caso), 'portale o caso non arrivano: ' + JSON.stringify(b).slice(0, 200));
  const chiamate = b.chiamate || [];
  deve(chiamate.length >= 4, 'arrivate ' + chiamate.length + ' chiamate, attese almeno 4');
  const post = chiamate.find(k => k.metodo === 'POST' && /preventivo/.test(k.url));
  deve(post, 'manca la POST del preventivo');
  deve(post.richiesta.intestazioni.Authorization === '«mascherato»' || post.richiesta.intestazioni.authorization === '«mascherato»', 'il Bearer e\' partito in chiaro: ' + JSON.stringify(post.richiesta.intestazioni));
  deve(/«mascherato»/.test(post.richiesta.corpo) && !/nonDeveUscire/.test(post.richiesta.corpo), 'la password e\' partita in chiaro');
  deve(/GY263BY/.test(post.richiesta.corpo), 'ha mascherato anche la targa');
  deve(post.stato === 200 && /"premio":412\.5/.test(post.risposta), 'la risposta del portale non c\'e\': ' + JSON.stringify(post).slice(0, 200));
  deve(/"token":"«mascherato»"/.test(post.risposta), 'il token nella risposta e\' passato in chiaro');
  const xhr = chiamate.find(k => k.via === 'xhr');
  deve(xhr && xhr.richiesta.intestazioni['X-Api-Key'] === '«mascherato»', 'la XHR manca o la chiave API e\' in chiaro');
  const msg = await pop.evaluate(() => document.getElementById('rec-msg').textContent);
  deve(/arrivata a IAM/.test(msg), 'il popup non conferma la consegna: ' + msg);
  return chiamate.length + ' chiamate consegnate, segreti mascherati';
});

prova('se il server e\' giu\' la cattura resta in attesa, e «Rimanda» la consegna', async () => {
  banco.setServer(500);
  await pop.selectOption('#portale', 'groupama');
  await pop.fill('#caso', 'seconda prova');
  await pop.click('#avvia');
  await attendi(() => pop.evaluate(() => document.getElementById('rec-ferma').style.display !== 'none'), 4000, 'seconda registrazione non parte');
  await portale.evaluate(() => window.faiChiamate());
  await attendi(async () => (await banco.sw.evaluate(() => chrome.storage.local.get('rec').then(o => (o.rec || {}).n || 0))) >= 2, 6000, 'seconda registrazione vuota');
  const prima = banco.consegne.length;
  await pop.click('#ferma');
  await attendi(() => Promise.resolve(banco.consegne.length > prima), 6000, 'non ha nemmeno provato a consegnare');
  await pop.waitForTimeout(500);
  const attesa = await banco.sw.evaluate(() => chrome.storage.local.get('in_attesa').then(o => o.in_attesa || []));
  deve(attesa.length === 1 && /500/.test(attesa[0].motivo), 'la cattura non e\' in attesa col motivo: ' + JSON.stringify(attesa.map(a => a.motivo)));
  deve(await pop.evaluate(() => document.getElementById('c-attesa').style.display !== 'none'), 'il popup non mostra il riquadro «In attesa»');
  banco.setServer(200);
  await pop.click('#rimanda');
  await attendi(async () => (await banco.sw.evaluate(() => chrome.storage.local.get('in_attesa').then(o => (o.in_attesa || []).length))) === 0, 6000, 'dopo «Rimanda» resta in attesa');
  deve(banco.consegne[banco.consegne.length - 1].stato === 200, 'l\'ultima consegna non e\' andata a buon fine');
  return 'in attesa col motivo, poi consegnata';
});

prova('nessun errore JavaScript nella pagina del portale', async () => {
  deve(erroriPortale.length === 0, erroriPortale.join(' | '));
});

let ko = 0;
console.log('\nREGISTRAZIONE VERA — Chrome con l\'estensione installata');
for (const { nome, fn } of esiti) {
  try { const d = await fn(); console.log('  ok  ' + nome + (d ? ' — ' + d : '')); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + (e && e.message || e)); }
}
await banco.chiudi();
console.log(`\nREGISTRAZIONE VERA: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
