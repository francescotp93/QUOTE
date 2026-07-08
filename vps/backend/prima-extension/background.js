// ─────────────────────────────────────────────────────────────────────────────
//  QUOTO · Prima Connector — SERVICE WORKER
//
//  - Tiene lo stato "token catturato" e lo mostra sul badge dell'icona.
//  - Instrada le richieste di preventivo (dal popup o dalla pagina QUOTO) verso
//    la scheda Prima aperta, dove il preventivo viene eseguito.
// ─────────────────────────────────────────────────────────────────────────────
let LATEST = { token: false, at: 0 };

function markToken() {
  LATEST = { token: true, at: Date.now() };
  try { chrome.action.setBadgeText({ text: '✓' }); chrome.action.setBadgeBackgroundColor({ color: '#16a34a' }); } catch {}
}

async function findPrimaTab() {
  const tabs = await chrome.tabs.query({ url: ['https://intermediari.prima.it/*', 'https://*.prima.it/*'] });
  // preferisci una scheda attiva/completa
  return (tabs || []).sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0))[0];
}

async function runQuote(data) {
  const tab = await findPrimaTab();
  if (!tab) return { ok: false, error: 'Nessuna scheda Prima aperta. Apri intermediari.prima.it, fai login, poi riprova.' };
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'RUN', data });
  } catch (e) {
    return { ok: false, error: 'La scheda Prima non risponde: ricaricala (F5) e riprova. (' + String(e && e.message || e) + ')' };
  }
}

async function primaStatus() {
  const tab = await findPrimaTab();
  if (!tab) return { tab: false, token: LATEST.token };
  let st = { tab: true, tabUrl: tab.url, token: LATEST.token };
  try { st = Object.assign(st, await chrome.tabs.sendMessage(tab.id, { type: 'STATUS' })); } catch (e) { st.err = String(e && e.message || e); }
  return st;
}

// messaggi interni (dal bridge di pagina e dal popup)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'TOKEN') { markToken(); return; }
  if (msg && msg.type === 'POPUP_RUN') { runQuote(msg.data).then(sendResponse).catch(e => sendResponse({ ok: false, error: String(e) })); return true; }
  if (msg && msg.type === 'POPUP_STATUS') { primaStatus().then(sendResponse).catch(e => sendResponse({ err: String(e) })); return true; }
});

// messaggi dalla pagina QUOTO (integrazione automatica)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'PRIMA_PING') { sendResponse({ ok: true, ext: 'quoto-prima', version: '1.0.0', hasToken: LATEST.token }); return; }
  if (msg && msg.type === 'PRIMA_QUOTE') { runQuote(msg.data).then(sendResponse).catch(e => sendResponse({ ok: false, error: String(e) })); return true; }
});
