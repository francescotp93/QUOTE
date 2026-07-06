// ─────────────────────────────────────────────────────────────────────────────
//  QUOTO · Prima Connector — BRIDGE (mondo isolato, può usare le chrome.* API)
//
//  Fa da ponte tra il hook di pagina (mondo principale, via CustomEvent) e il
//  service worker / popup (via chrome.runtime). Inoltra il token catturato e
//  instrada le richieste di preventivo verso la pagina, restituendo il risultato.
// ─────────────────────────────────────────────────────────────────────────────
const _pending = {};
let _rid = 0;

// token catturato dalla pagina → avviso il background
window.addEventListener('QP_TOKEN', () => {
  try { chrome.runtime.sendMessage({ type: 'TOKEN' }); } catch {}
  try { chrome.storage.local.set({ prima_token_at: Date.now() }); } catch {}
});

// risultato preventivo dalla pagina
window.addEventListener('QP_RESULT', (e) => {
  const { reqId, result } = (e && e.detail) || {};
  if (_pending[reqId]) { _pending[reqId](result); delete _pending[reqId]; }
});

function runInPage(data) {
  return new Promise((resolve) => {
    const reqId = 'r' + (++_rid) + '_' + Date.now();
    _pending[reqId] = resolve;
    window.dispatchEvent(new CustomEvent('QP_RUN', { detail: { reqId, data } }));
    setTimeout(() => { if (_pending[reqId]) { _pending[reqId]({ ok: false, error: 'timeout: nessuna risposta dalla pagina Prima (60s)' }); delete _pending[reqId]; } }, 60000);
  });
}

// richieste da background (che le riceve dal popup o da QUOTO)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'RUN') { runInPage(msg.data).then(sendResponse); return true; }
  if (msg && msg.type === 'STATUS') {
    let done = false;
    const h = (e) => { if (done) return; done = true; window.removeEventListener('QP_STATUS_RES', h); sendResponse(e.detail || { hasToken: false }); };
    window.addEventListener('QP_STATUS_RES', h);
    window.dispatchEvent(new CustomEvent('QP_STATUS_REQ'));
    setTimeout(() => { if (!done) { done = true; window.removeEventListener('QP_STATUS_RES', h); try { sendResponse({ hasToken: false, url: location.href }); } catch {} } }, 1500);
    return true;
  }
});
