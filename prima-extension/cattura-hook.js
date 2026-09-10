// ─────────────────────────────────────────────────────────────────────────────
//  WITH US · CONNETTORE — IL GANCIO NELLA PAGINA (mondo principale)
//
//  Gira a document_start, prima del codice del portale, sugli otto portali del
//  manifest. Aggancia fetch e XMLHttpRequest e, SOLO mentre una registrazione
//  e' accesa, mette da parte ogni chiamata utile: metodo, indirizzo, corpo,
//  stato, risposta. Non tocca niente: la chiamata parte e torna come sempre.
//
//  Non puo' parlare con l'estensione (mondo principale): passa tutto al ponte
//  (cattura-bridge.js) con CustomEvent sul window, come fa gia' page-hook.js.
//  La regola di cosa tenere e cosa mascherare sta in registratore.js.
// ─────────────────────────────────────────────────────────────────────────────
(() => {
  if (window.__WU_HOOK) return;
  window.__WU_HOOK = true;
  const R = window.__WU_REG;
  if (!R) { console.warn('[With Us] registratore.js non caricato: niente registrazione'); return; }

  const REC = { on: false, portale: null, t0: 0 };
  const manda = (c) => { try { window.dispatchEvent(new CustomEvent('WU_CALL', { detail: R.nuovaChiamata(c) })); } catch (e) {} };
  const tieni = (url) => REC.on && R.daTenere(url, REC.portale, location.origin);
  const leggibile = (ct) => /json|text|xml|html|javascript|x-www-form/i.test(String(ct || ''));

  window.addEventListener('WU_REC', (e) => {
    const d = (e && e.detail) || {};
    REC.on = !!d.on; REC.portale = d.portale || null; REC.t0 = d.avvio || Date.now();
  });
  /* Il ponte potrebbe non essere ancora in ascolto: si chiede lo stato, e lo
     si richiede se non arriva niente. */
  const chiedi = () => { try { window.dispatchEvent(new CustomEvent('WU_REC_REQ')); } catch (e) {} };
  chiedi(); setTimeout(chiedi, 300); setTimeout(chiedi, 1500);

  const intestazioniDi = (h, inp) => {
    const out = {};
    try {
      if (h) { if (typeof h.forEach === 'function') h.forEach((v, k) => { out[k] = v; }); else for (const k in h) out[k] = h[k]; }
      if (inp && inp.headers && typeof inp.headers.forEach === 'function') inp.headers.forEach((v, k) => { out[k] = v; });
    } catch (e) {}
    return out;
  };
  const corpoDi = (b) => {
    if (b == null) return '';
    if (typeof b === 'string') return b;
    try { if (b instanceof URLSearchParams) return b.toString(); } catch (e) {}
    try { if (b instanceof FormData) { const p = []; b.forEach((v, k) => p.push(k + '=' + (typeof v === 'string' ? v : '[file]'))); return p.join('&'); } } catch (e) {}
    return '[corpo binario]';
  };

  // ── fetch ──
  const _fetch = window.fetch;
  window.fetch = function (inp, init) {
    const url = (typeof inp === 'string') ? inp : (inp && inp.url);
    if (!tieni(url)) return _fetch.apply(this, arguments);
    const inizio = Date.now();
    const rec = { t: inizio - REC.t0, via: 'fetch', metodo: (init && init.method) || (inp && inp.method) || 'GET', url: String(url),
      intestazioni: intestazioniDi(init && init.headers, inp), corpo: corpoDi(init && init.body), pagina: location.href };
    const p = _fetch.apply(this, arguments);
    p.then(async (res) => {
      try {
        rec.stato = res.status; rec.tipo = res.headers.get('content-type') || ''; rec.ms = Date.now() - inizio;
        rec.risposta = leggibile(rec.tipo) ? await res.clone().text() : '[' + (rec.tipo || 'binario') + ']';
      } catch (e) { rec.risposta = '[risposta non leggibile: ' + (e && e.message) + ']'; }
      manda(rec);
    }, (err) => { rec.ms = Date.now() - inizio; rec.risposta = '[errore di rete: ' + (err && err.message) + ']'; manda(rec); });
    return p;
  };

  // ── XMLHttpRequest ──
  const XP = XMLHttpRequest.prototype;
  const _open = XP.open, _send = XP.send, _setH = XP.setRequestHeader;
  XP.open = function (m, u) { this.__wu = { metodo: m, url: String(u), intestazioni: {} }; return _open.apply(this, arguments); };
  XP.setRequestHeader = function (k, v) { try { if (this.__wu) this.__wu.intestazioni[k] = v; } catch (e) {} return _setH.apply(this, arguments); };
  XP.send = function (body) {
    const w = this.__wu;
    if (w && tieni(w.url)) {
      const inizio = Date.now();
      const rec = { t: inizio - REC.t0, via: 'xhr', metodo: w.metodo, url: w.url, intestazioni: w.intestazioni, corpo: corpoDi(body), pagina: location.href };
      this.addEventListener('loadend', () => {
        try {
          rec.stato = this.status; rec.ms = Date.now() - inizio;
          rec.tipo = this.getResponseHeader('content-type') || '';
          const rt = this.responseType;
          if (rt === '' || rt === 'text') rec.risposta = this.responseText;
          else if (rt === 'json') rec.risposta = JSON.stringify(this.response);
          else rec.risposta = '[risposta ' + rt + ']';
        } catch (e) { rec.risposta = '[risposta non leggibile]'; }
        manda(rec);
      });
    }
    return _send.apply(this, arguments);
  };
})();
