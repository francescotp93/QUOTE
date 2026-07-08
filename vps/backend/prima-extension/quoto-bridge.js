// ─────────────────────────────────────────────────────────────────────────────
//  QUOTO · Prima Connector — PONTE lato QUOTO
//
//  Gira sulle pagine di QUOTO (withusassicurazioni.it). Fa da ponte tra la pagina
//  QUOTO (via window.postMessage) e il service worker dell'estensione (che esegue
//  il preventivo nella scheda Prima). Così il quotatore può chiedere un preventivo
//  Prima senza conoscere l'ID dell'estensione e senza backend.
//
//  Protocollo (window.postMessage, stessa finestra):
//    QUOTO → estensione : { __quotoPrima:'request', reqId, action:'ping'|'quote', data }
//    estensione → QUOTO : { __quotoPrima:'response', reqId, result }
//    all'avvio          : { __quotoPrima:'ready', version }
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  const announce = () => { try { window.postMessage({ __quotoPrima: 'ready', version: '1.0.0' }, '*'); } catch {} };
  announce();
  // ri-annuncio se la pagina QUOTO si carica dopo (SPA)
  document.addEventListener('DOMContentLoaded', announce);

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (!m || m.__quotoPrima !== 'request') return;
    const { reqId, action, data } = m;
    const reply = (result) => { try { window.postMessage({ __quotoPrima: 'response', reqId, result }, '*'); } catch {} };
    if (action === 'ping') { reply({ ok: true, ext: true, version: '1.0.0' }); return; }
    if (action === 'quote') {
      try { reply(await chrome.runtime.sendMessage({ type: 'POPUP_RUN', data })); }
      catch (e) { reply({ ok: false, error: String(e && e.message || e) }); }
      return;
    }
    if (action === 'status') {
      try { reply(await chrome.runtime.sendMessage({ type: 'POPUP_STATUS' })); }
      catch (e) { reply({ ok: false, error: String(e && e.message || e) }); }
      return;
    }
  });
})();
