// QUOTO · Connettore Mappatura — BRIDGE (mondo isolato del content script)
// Riceve i record strutturali dal page-hook (mondo pagina) e li passa al background.
(() => {
  window.addEventListener('QMAP_REC', (e) => {
    let rec = null;
    try { rec = JSON.parse(e.detail); } catch { return; }
    try { chrome.runtime.sendMessage({ type: 'rec', rec }); } catch {}
  });
})();
