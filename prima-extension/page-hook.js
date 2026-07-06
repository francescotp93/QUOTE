// ─────────────────────────────────────────────────────────────────────────────
//  QUOTO · Prima Connector — HOOK DI PAGINA (gira nel MONDO PRINCIPALE della pagina)
//
//  Gira PRIMA del codice della SPA di Prima (document_start). Aggancia fetch/XHR
//  per catturare il token Bearer che la SPA usa sulla covers-api (in memoria, non
//  in storage). Poi, su richiesta, esegue il preventivo (fastQuote + Quote) usando
//  i cookie di sessione + quel token — tutto DENTRO la pagina, quindi dallo stesso
//  IP e sessione dell'utente.
//
//  Comunica con la parte "bridge" (mondo isolato) via CustomEvent sul window.
// ─────────────────────────────────────────────────────────────────────────────
(() => {
  const O = location.origin;
  const isPrima = (u) => { try { return new URL(u, O).hostname.endsWith('prima.it'); } catch { return false; } };
  let TOKEN = null;
  const setTok = (t) => {
    if (t && t !== TOKEN) {
      TOKEN = t;
      try { window.dispatchEvent(new CustomEvent('QP_TOKEN', { detail: t })); } catch {}
    }
  };
  const grab = (url, k, v) => {
    if (isPrima(url) && /^authorization$/i.test(k) && /bearer /i.test(String(v))) {
      setTok(String(v).replace(/bearer\s+/i, '').trim());
    }
  };

  // ── hook fetch ──
  const _fetch = window.fetch;
  window.fetch = function (inp, init) {
    try {
      const url = (typeof inp === 'string') ? inp : (inp && inp.url);
      const h = init && init.headers;
      if (h) { if (h.forEach) h.forEach((v, k) => grab(url, k, v)); else for (const k in h) grab(url, k, h[k]); }
      if (inp && inp.headers && inp.headers.forEach) inp.headers.forEach((v, k) => grab(url, k, v));
    } catch {}
    return _fetch.apply(this, arguments);
  };

  // ── hook XHR ──
  const _open = XMLHttpRequest.prototype.open;
  const _setH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__qpUrl = u; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { try { grab(this.__qpUrl, k, v); } catch {} return _setH.apply(this, arguments); };

  // ── esecuzione preventivo ──
  const esc = (s) => String(s || '').replace(/\\/g, '').replace(/"/g, '\\"');
  async function gql(path, query, variables, auth) {
    const h = { 'Content-Type': 'application/json' };
    if (auth) h['Authorization'] = 'Bearer ' + auth;
    const r = await _fetch.call(window, O + path, {
      method: 'POST', credentials: 'include', headers: h,
      body: JSON.stringify(variables !== undefined ? { query, variables } : { query })
    });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, json: j, raw: t.slice(0, 300) };
  }
  async function runQuote(D) {
    // 1) fastQuote → uniqueIdentifier (autenticazione a cookie)
    const fq = `mutation { fastQuote(fastQuoteData: {vehicleType: ${D.vehicleType || 'CAR'}, vehiclePlateNumber: "${esc(D.targa)}", ownerBirthDate: "${esc(D.nascita)}", ownerOccupation: ${D.professione || 'IMPIEGATO_QUADRO_DIRIGENTE'}, ownerCivilStatus: ${D.statoCivile || 'SINGLE'}, ownerResidentialAddress: "${esc(D.indirizzo)}", ownerResidentialZipCode: "${esc(D.cap)}", ownerResidentialCity: "${esc(D.cittaIstat)}", ownerResidentialCivicNumber: "${esc(D.civico)}", phoneNumber: "${esc(D.telefono)}", ownerLicenseIdIsRequested: true, ownerLicenseYear: ${parseInt(D.annoPatente, 10) || 2010}, legalEntity: false, insuranceType: BONUS_MALUS, ownerNoLicense: false, privacyAll: true, userPrivacyMarketing: false, userPrivacyThirdPart: false, userPrivacyCommercial: false}) { errors { field level messages } valid uniqueIdentifier } }`;
    const r1 = await gql('/api/graphql', fq);
    const fqd = r1.json && r1.json.data && r1.json.data.fastQuote;
    if (!fqd || !fqd.uniqueIdentifier) return { ok: false, error: 'fastQuote fallito (' + r1.status + ')', errors: fqd && fqd.errors, raw: r1.raw };
    const id = fqd.uniqueIdentifier;
    // 2) authorizeSalesFlow → token specifico di QUESTO preventivo per la covers-api (cookie)
    const az = await gql('/api/graphql', `query { authorizeSalesFlow(resourceId: "${id}", resourceType: QUOTE) { token } }`);
    const token = az.json && az.json.data && az.json.data.authorizeSalesFlow && az.json.data.authorizeSalesFlow.token;
    if (!token) return { ok: false, error: 'authorizeSalesFlow senza token (' + az.status + ')', quote_id: id, raw: az.raw };
    // 3) Quote → prezzi sulla covers-api col token appena coniato
    const qq = `query Quote($id: UUID!) { quote(id: $id) { __typename ... on Quote { installmentPrices { installments { guarantees { slug selected priceBlocks { coveragePrice { legal } } } } } } } }`;
    let ip = null, last = null;
    for (let i = 0; i < 16; i++) {
      const r2 = await gql('/mfe/covers-api/graphql', qq, { id }, token);
      last = r2;
      if (r2.status === 401) return { ok: false, error: 'covers-api 401 anche col token coniato', quote_id: id, raw: r2.raw };
      const q = r2.json && r2.json.data && r2.json.data.quote;
      ip = q && q.installmentPrices;
      if (ip && ip[0] && ip[0].installments && ip[0].installments[0] && (ip[0].installments[0].guarantees || []).length) break;
      await new Promise(r => setTimeout(r, 1500));
    }
    if (!ip || !ip[0] || !ip[0].installments || !ip[0].installments[0]) return { ok: false, error: 'Quote senza prezzi', last: last && last.status, quote_id: id };
    const gars = ip[0].installments[0].guarantees || [];
    let tot = 0; const det = [];
    for (const g of gars) { if (!g.selected) continue; const pb = (g.priceBlocks || [])[0]; const v = pb && pb.coveragePrice && pb.coveragePrice.legal; const n = v ? parseFloat(String(v).replace(',', '.')) : 0; if (n > 0) { tot += n; det.push({ slug: g.slug, price: String(v) }); } }
    tot = Math.round(tot * 100) / 100;
    return { ok: tot > 0, compagnia: 'Prima', prodotto: 'RC Auto', via: 'estensione', premio_annuale_num: tot, premio_annuale: tot.toFixed(2).replace('.', ',') + ' €', annuale: { totale: tot.toFixed(2).replace('.', ',') }, garanzie_incluse: det.map(d => d.slug), quote_id: id, dettaglio: det };
  }

  // ── ponte con il "bridge" (mondo isolato) ──
  window.addEventListener('QP_RUN', async (e) => {
    const { reqId, data } = (e && e.detail) || {};
    let result;
    try { result = await runQuote(data || {}); } catch (err) { result = { ok: false, error: String(err && err.message || err) }; }
    try { window.dispatchEvent(new CustomEvent('QP_RESULT', { detail: { reqId, result } })); } catch {}
  });
  window.addEventListener('QP_STATUS_REQ', () => {
    try { window.dispatchEvent(new CustomEvent('QP_STATUS_RES', { detail: { hasToken: !!TOKEN, url: location.href, loggato: /prima\.it/.test(location.href) && !/login|signin|auth/i.test(location.href) } })); } catch {}
  });

  console.log('[QUOTO Prima] hook attivo su', location.href);
})();
