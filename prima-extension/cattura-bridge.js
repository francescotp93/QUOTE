// ─────────────────────────────────────────────────────────────────────────────
//  WITH US · CONNETTORE — IL PONTE (mondo isolato, vede le chrome.* API)
//
//  Sta fra il gancio nella pagina (CustomEvent) e il service worker
//  (chrome.runtime). Dice al gancio se si sta registrando e su quale portale;
//  inoltra ogni chiamata catturata al service worker, che la mette da parte.
// ─────────────────────────────────────────────────────────────────────────────
(() => {
  let ultimo = null;
  const diAlGancio = (st) => {
    ultimo = st || { on: false };
    try { window.dispatchEvent(new CustomEvent('WU_REC', { detail: ultimo })); } catch (e) {}
  };
  const aggiorna = () => {
    try { chrome.runtime.sendMessage({ type: 'REC_STATE' }, (st) => { if (chrome.runtime.lastError) return; diAlGancio(st); }); } catch (e) {}
  };
  window.addEventListener('WU_REC_REQ', () => { if (ultimo) diAlGancio(ultimo); else aggiorna(); });
  aggiorna();
  try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.rec) aggiorna(); }); } catch (e) {}

  /* Ogni pagina aperta mentre si registra vale come una tappa: aiuta a
     leggere la cattura («qui l'agente e' passato alla schermata del veicolo»). */
  const tappa = () => {
    if (!ultimo || !ultimo.on) return;
    try { chrome.runtime.sendMessage({ type: 'REC_CALL', call: { via: 'pagina', metodo: 'NAV', url: location.href, pagina: location.href, tipo: 'text/html', t: Date.now() - (ultimo.avvio || Date.now()), richiesta: { intestazioni: {}, corpo: '' }, risposta: (document.title || ''), stato: null, ms: null, portale: ultimo.portale } }); } catch (e) {}
  };
  document.addEventListener('DOMContentLoaded', tappa);

  window.addEventListener('WU_CALL', (e) => {
    const c = e && e.detail; if (!c) return;
    try { chrome.runtime.sendMessage({ type: 'REC_CALL', call: c }); } catch (err) {}
  });
})();
