// ─────────────────────────────────────────────────────────────────────────────
//  WITH US · CONNETTORE — SERVICE WORKER
//
//  Due mestieri, uno vecchio e uno nuovo:
//  1. PRIMA (dal 2026-07): instrada le richieste di preventivo verso la scheda
//     Prima aperta, dove il preventivo viene eseguito col login dell'agente.
//  2. REGISTRAZIONE (dal 2026-09-10): mentre l'agente fa un preventivo su uno
//     degli otto portali, mette da parte le chiamate catturate dal gancio; a
//     «Ferma» le impacchetta e le MANDA DA SOLA a IAM («porta automaticamente
//     tutti i dati che ci servono» — Francesco). Se IAM non risponde, la
//     cattura resta qui, in attesa, e si rimanda con un tasto.
//
//  Il service worker di Chrome puo' essere spento in qualunque momento: lo
//  stato vive in chrome.storage.local, mai solo in memoria.
// ─────────────────────────────────────────────────────────────────────────────
importScripts('registratore.js');   // gli otto portali e i loro domini: un elenco solo, anche qui
const VERSIONE = '2.0.1';
const API_DEFAULT = 'https://api.withusassicurazioni.it';
const MAX_CHIAMATE = 2000;          // oltre, la registrazione si ferma da sola
const MAX_BYTE = 7 * 1024 * 1024;   // il server accetta 8 MB: si sta sotto

// ═══ PRIMA (invariato) ════════════════════════════════════════════════════════
let LATEST = { token: false, at: 0 };
function markToken() {
  LATEST = { token: true, at: Date.now() };
  badge();
}
async function findPrimaTab() {
  const tabs = await chrome.tabs.query({ url: ['https://intermediari.prima.it/*', 'https://*.prima.it/*'] });
  return (tabs || []).sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0))[0];
}
async function runQuote(data) {
  const tab = await findPrimaTab();
  if (!tab) return { ok: false, error: 'Nessuna scheda Prima aperta. Apri intermediari.prima.it, fai login, poi riprova.' };
  try { return await chrome.tabs.sendMessage(tab.id, { type: 'RUN', data }); }
  catch (e) { return { ok: false, error: 'La scheda Prima non risponde: ricaricala (F5) e riprova. (' + String(e && e.message || e) + ')' }; }
}
async function primaStatus() {
  const tab = await findPrimaTab();
  if (!tab) return { tab: false, token: LATEST.token };
  let st = { tab: true, tabUrl: tab.url, token: LATEST.token };
  try { st = Object.assign(st, await chrome.tabs.sendMessage(tab.id, { type: 'STATUS' })); } catch (e) { st.err = String(e && e.message || e); }
  return st;
}

// ═══ REGISTRAZIONE ═══════════════════════════════════════════════════════════
/* chrome.storage.local:
     connettore  { chiave, api, collegato_il }        — dato da IAM con «Collega»
     rec         { on, portale, caso, avvio, n, byte } — la registrazione in corso
     rec_buf     [chiamate]                            — le chiamate messe da parte
     in_attesa   [catture]                             — non ancora arrivate a IAM */
const leggi = (k) => chrome.storage.local.get(k).then(o => o[k]);
const scrivi = (o) => chrome.storage.local.set(o);

let BUF = null;              // copia in memoria di rec_buf, per non riscrivere tutto a ogni chiamata
let salvaTimer = null;
async function bufCarica() { if (!BUF) BUF = (await leggi('rec_buf')) || []; return BUF; }
function bufSalvaPresto() {
  if (salvaTimer) return;
  salvaTimer = setTimeout(async () => { salvaTimer = null; try { await scrivi({ rec_buf: BUF || [] }); } catch (e) {} }, 800);
}

async function statoRec() {
  const rec = (await leggi('rec')) || { on: false };
  return { on: !!rec.on, portale: rec.portale || null, caso: rec.caso || '', avvio: rec.avvio || 0, n: rec.n || 0, byte: rec.byte || 0, fermata: rec.fermata || '' };
}

async function recAvvia({ portale, caso }) {
  if (!portale) return { ok: false, error: 'Scegli il portale da registrare.' };
  const c = String(caso || '').trim();
  if (!c) return { ok: false, error: 'Scrivi il caso che stai per fare (es. «RC auto, Fiat Panda 2019, targa GY263BY»): senza, la cattura e\' muta.' };
  BUF = [];
  await scrivi({ rec: { on: true, portale, caso: c, avvio: Date.now(), n: 0, byte: 0 }, rec_buf: [] });
  badge();
  const schede = await armaSchede(portale);
  return Object.assign({ ok: true }, schede);
}

/* LE SCHEDE GIA' APERTE. Chrome inietta i content script del manifest solo
   nelle pagine caricate DOPO che l'estensione e' stata installata o
   ricaricata: la scheda del portale aperta da stamattina non ha il gancio, e
   la cattura torna vuota — «continuano a non arrivare le chiamate»
   (Francesco, 10/09/2026). Quindi a «Registra» si va a cercare ogni scheda del
   portale scelto e ci si inietta il gancio a mano. Nelle schede che ce l'hanno
   gia' non succede niente: gancio e ponte hanno una guardia contro il doppione. */
function schemiDi(portale) {
  const P = (self.__WU_REG && self.__WU_REG.PORTALI || []).find(p => p.id === portale);
  return P ? P.domini.map(d => 'https://*.' + d + '/*').concat(P.domini.map(d => 'https://' + d + '/*')) : [];
}
async function armaSchede(portale) {
  const schemi = schemiDi(portale);
  if (!schemi.length) return { schede: 0, agganciate: 0 };
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: schemi }); } catch (e) { return { schede: 0, agganciate: 0, errore: String(e && e.message || e) }; }
  let agganciate = 0; const errori = [];
  for (const t of tabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['registratore.js', 'cattura-hook.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['cattura-bridge.js'] });
      agganciate++;
    } catch (e) { errori.push(String(e && e.message || e).slice(0, 120)); }
  }
  return { schede: tabs.length, agganciate, errori };
}

async function recChiamata(call) {
  const rec = await statoRec();
  if (!rec.on || !call) return;
  const buf = await bufCarica();
  const peso = JSON.stringify(call).length;
  if (buf.length >= MAX_CHIAMATE || rec.byte + peso > MAX_BYTE) {
    /* Ci si ferma da soli, e lo si dice: una cattura troncata in silenzio
       farebbe credere che il portale abbia smesso di chiamare. */
    await scrivi({ rec: Object.assign(rec, { on: false, fermata: buf.length >= MAX_CHIAMATE ? 'troppe chiamate (' + MAX_CHIAMATE + ')' : 'cattura troppo grande (7 MB)' }) });
    badge();
    return;
  }
  buf.push(call);
  await scrivi({ rec: Object.assign(rec, { n: buf.length, byte: rec.byte + peso }) });
  bufSalvaPresto();
  badge();
}

async function recFerma() {
  const rec = await statoRec();
  const buf = await bufCarica();
  if (salvaTimer) { clearTimeout(salvaTimer); salvaTimer = null; }
  const cattura = {
    id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    versione: VERSIONE,
    portale: rec.portale, caso: rec.caso, avvio: rec.avvio, fine: Date.now(),
    fermata: rec.fermata || '',
    chiamate: buf,
  };
  BUF = [];
  await scrivi({ rec: { on: false }, rec_buf: [] });
  if (!buf.length) { badge(); return { ok: true, vuota: true, msg: 'Nessuna chiamata registrata: la scheda del portale era aperta prima di premere «Registra»? Ricaricala (F5) e riprova.' }; }
  const esito = await manda(cattura);
  badge();
  return Object.assign({ ok: true, n: buf.length }, esito);
}

/* La consegna a IAM. Se non va, la cattura non si perde: finisce in attesa. */
async function manda(cattura) {
  const cfg = (await leggi('connettore')) || {};
  if (!cfg.chiave) { await inAttesa(cattura, 'non collegata a IAM'); return { mandata: false, errore: 'L\'estensione non e\' collegata a IAM: apri IAM → Fonti compagnie → «Collega l\'estensione». La cattura resta qui in attesa.' }; }
  try {
    const r = await fetch((cfg.api || API_DEFAULT) + '/fonti/connettore/catture', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Connettore-Chiave': cfg.chiave },
      body: JSON.stringify(cattura),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) { await inAttesa(cattura, 'chiave rifiutata'); return { mandata: false, errore: 'IAM non riconosce piu\' questa estensione: ricollegala da Fonti compagnie. La cattura resta in attesa.' }; }
    if (!r.ok || !j.ok) { await inAttesa(cattura, 'risposta ' + r.status); return { mandata: false, errore: 'IAM ha risposto ' + r.status + (j.error ? ': ' + j.error : '') + '. La cattura resta in attesa.' }; }
    return { mandata: true, id: j.id || cattura.id, msg: 'Cattura arrivata a IAM: ' + cattura.chiamate.length + ' chiamate.' };
  } catch (e) {
    await inAttesa(cattura, 'rete: ' + String(e && e.message || e));
    return { mandata: false, errore: 'Non riesco a raggiungere IAM (' + String(e && e.message || e) + '). La cattura resta in attesa: si rimanda dal pulsante.' };
  }
}
async function inAttesa(cattura, motivo) {
  const lista = (await leggi('in_attesa')) || [];
  lista.push(Object.assign({}, cattura, { motivo, messa_in_attesa: Date.now() }));
  await scrivi({ in_attesa: lista.slice(-10) });
}
async function rimanda() {
  const lista = (await leggi('in_attesa')) || [];
  await scrivi({ in_attesa: [] });
  const esiti = [];
  for (const c of lista) { const e = await manda(c); esiti.push(Object.assign({ id: c.id, n: (c.chiamate || []).length }, e)); }
  badge();
  return { ok: true, esiti };
}

async function statoConnettore() {
  const cfg = (await leggi('connettore')) || {};
  const rec = await statoRec();
  const attesa = (await leggi('in_attesa')) || [];
  return { ok: true, ext: true, versione: VERSIONE, collegato: !!cfg.chiave, api: cfg.api || API_DEFAULT, collegato_il: cfg.collegato_il || 0,
    rec, in_attesa: attesa.map(c => ({ id: c.id, portale: c.portale, caso: c.caso, n: (c.chiamate || []).length, motivo: c.motivo })), prima_token: LATEST.token };
}
async function collega({ chiave, api }) {
  if (!chiave || !/^wuc_[A-Za-z0-9_-]{20,}$/.test(String(chiave))) return { ok: false, error: 'chiave non valida' };
  await scrivi({ connettore: { chiave: String(chiave), api: String(api || API_DEFAULT).replace(/\/+$/, ''), collegato_il: Date.now() } });
  badge();
  return { ok: true };
}
async function scollega() { await scrivi({ connettore: {} }); badge(); return { ok: true }; }

/* Il badge dice la cosa piu' urgente: REC mentre registra, «!» se c'e' qualcosa
   in attesa, «✓» se e' collegata, niente altrimenti. */
async function badge() {
  try {
    const rec = await statoRec();
    const attesa = (await leggi('in_attesa')) || [];
    const cfg = (await leggi('connettore')) || {};
    if (rec.on) { chrome.action.setBadgeText({ text: String(rec.n || 'REC') }); chrome.action.setBadgeBackgroundColor({ color: '#ad3a32' }); return; }
    if (attesa.length) { chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#a76008' }); return; }
    if (cfg.chiave) { chrome.action.setBadgeText({ text: '✓' }); chrome.action.setBadgeBackgroundColor({ color: '#02984e' }); return; }
    chrome.action.setBadgeText({ text: '' });
  } catch (e) {}
}
chrome.runtime.onInstalled.addListener(badge);
chrome.runtime.onStartup.addListener(badge);

// ═══ MESSAGGI ════════════════════════════════════════════════════════════════
const rispondi = (p, sendResponse) => { p.then(sendResponse).catch(e => sendResponse({ ok: false, error: String(e && e.message || e) })); return true; };

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  switch (msg.type) {
    case 'TOKEN': markToken(); return;
    case 'POPUP_RUN': return rispondi(runQuote(msg.data), sendResponse);
    case 'POPUP_STATUS': return rispondi(primaStatus(), sendResponse);
    case 'REC_STATE': return rispondi(statoRec(), sendResponse);
    case 'REC_CALL': recChiamata(msg.call); return;
    case 'REC_START': return rispondi(recAvvia(msg.data || {}), sendResponse);
    case 'REC_STOP': return rispondi(recFerma(), sendResponse);
    case 'RIMANDA': return rispondi(rimanda(), sendResponse);
    case 'CONNETTORE_STATO': return rispondi(statoConnettore(), sendResponse);
    case 'CONNETTORE_COLLEGA': return rispondi(collega(msg.data || {}), sendResponse);
    case 'CONNETTORE_SCOLLEGA': return rispondi(scollega(), sendResponse);
  }
});

// messaggi da QUOTO/IAM tramite quoto-bridge.js (esterni all'estensione)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'PRIMA_PING') { sendResponse({ ok: true, ext: 'quoto-prima', version: VERSIONE, hasToken: LATEST.token }); return; }
  if (msg && msg.type === 'PRIMA_QUOTE') return rispondi(runQuote(msg.data), sendResponse);
});
