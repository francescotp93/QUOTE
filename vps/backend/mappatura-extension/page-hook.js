// ─────────────────────────────────────────────────────────────────────────────
//  QUOTO · Connettore Mappatura — HOOK DI PAGINA (gira nel MONDO PRINCIPALE)
//
//  Aggancia fetch/XHR PRIMA del codice della pagina (document_start) e registra
//  la STRUTTURA di ogni chiamata: metodo, percorso, nomi dei parametri, azione
//  (a=/action=), e la FORMA della risposta (nomi dei campi). I VALORI vengono
//  MASCHERATI: niente dati personali dei clienti escono dalla pagina.
//
//  Comunica con la parte "bridge" (mondo isolato) via CustomEvent sul window.
// ─────────────────────────────────────────────────────────────────────────────
(() => {
  const HOST = location.hostname;
  // parametri il cui VALORE è un identificatore di funzione (non un dato personale): li teniamo.
  const ACTION_KEYS = /^(a|action|azione|op|cmd|do|func|funzione|method|metodo|tab|page|pag|view|vista|sez|sezione|section|modulo|controller|task|richiesta|tipo|type)$/i;
  const MAXDEPTH = 4, MAXKEYS = 60, MAXARR = 1;

  // ── maschera un valore tenendo solo la FORMA ──
  function mask(v, depth) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return 's:' + v.length;      // solo lunghezza, non il contenuto
    if (typeof v === 'number') return 'n';
    if (typeof v === 'boolean') return 'b';
    if (depth >= MAXDEPTH) return '…';
    if (Array.isArray(v)) return v.length ? ['×' + v.length, mask(v[0], depth + 1)] : [];
    if (typeof v === 'object') {
      const o = {}; let n = 0;
      for (const k of Object.keys(v)) { if (n++ >= MAXKEYS) { o['…'] = 1; break; } o[k] = mask(v[k], depth + 1); }
      return o;
    }
    return typeof v;
  }

  // ── parametri di una query-string / body urlencoded ──
  function parseParams(str) {
    const keys = {}; let action = null;
    try {
      const sp = new URLSearchParams(str);
      for (const [k, val] of sp) {
        if (ACTION_KEYS.test(k)) { keys[k] = val; if (/^(a|action|azione|op|cmd|do)$/i.test(k) && !action) action = val; }
        else keys[k] = 's:' + String(val).length;
      }
    } catch {}
    return { keys, action };
  }

  // ── costruisce il record strutturale di una chiamata ──
  function buildReq(method, url, body) {
    let path = url, qs = {};
    try { const u = new URL(url, location.origin); path = u.pathname; qs = parseParams(u.search.replace(/^\?/, '')); } catch {}
    const rec = { host: HOST, path, method: (method || 'GET').toUpperCase(), qKeys: qs.keys, action: qs.action || null, ts: Date.now() };
    if (body != null) {
      if (typeof body === 'string') {
        if (/^[^=&]+=[^=&]*(&|$)/.test(body) && !/^\s*[{\[]/.test(body)) { const p = parseParams(body); rec.bodyKeys = p.keys; if (p.action) rec.action = p.action; }
        else { try { rec.bodyShape = mask(JSON.parse(body), 0); } catch { rec.bodyKeys = { _raw: 's:' + body.length }; } }
      } else if (body instanceof URLSearchParams) { const p = parseParams(body.toString()); rec.bodyKeys = p.keys; if (p.action) rec.action = p.action; }
      else if (typeof FormData !== 'undefined' && body instanceof FormData) { const k = {}; for (const key of body.keys()) k[key] = 'file/campo'; rec.bodyKeys = k; }
    }
    return rec;
  }

  function attachResp(rec, text, status) {
    rec.status = status || 0;
    if (text && text.length < 600000) { try { rec.respShape = mask(JSON.parse(text), 0); } catch { rec.respShape = 'testo:' + text.length; } }
    emit(rec);
  }

  function emit(rec) { try { window.dispatchEvent(new CustomEvent('QMAP_REC', { detail: JSON.stringify(rec) })); } catch {} }

  // ── hook fetch ──
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    let url, method, body;
    try {
      url = (typeof input === 'string') ? input : (input && input.url);
      method = (init && init.method) || (input && input.method) || 'GET';
      body = init && init.body;
    } catch {}
    const rec = buildReq(method, url, body);
    return _fetch.apply(this, arguments).then((resp) => {
      try { resp.clone().text().then((t) => attachResp(rec, t, resp.status)).catch(() => emit(rec)); } catch { emit(rec); }
      return resp;
    }).catch((e) => { emit(rec); throw e; });
  };

  // ── hook XHR ──
  const _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__qm = { m, u }; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    const self = this, meta = this.__qm || {};
    const rec = buildReq(meta.m, meta.u, body);
    this.addEventListener('loadend', function () {
      let t = ''; try { if (self.responseType === '' || self.responseType === 'text') t = self.responseText || ''; } catch {}
      attachResp(rec, t, self.status);
    });
    return _send.apply(this, arguments);
  };

  try { window.dispatchEvent(new CustomEvent('QMAP_READY', { detail: HOST })); } catch {}
})();
