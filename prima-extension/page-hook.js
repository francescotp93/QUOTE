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
  // Risolve comune (nome) → codice ISTAT via la query cities di Prima (cookie).
  async function resolveIstat(nome, cap) {
    if (!nome) return null;
    const oggi = new Date().toISOString().slice(0, 10);
    const r = await gql('/api/graphql', `query { cities(date: "${oggi}", filter: "${esc(nome)}") { zipCodes { zip } province name istat } }`);
    const cities = (r.json && r.json.data && r.json.data.cities) || [];
    if (!cities.length) return null;
    if (cap) { for (const c of cities) if ((c.zipCodes || []).some(z => String(z.zip) === String(cap))) return c.istat; }
    const exact = cities.find(c => (c.name || '').toLowerCase() === String(nome).toLowerCase());
    return (exact || cities[0]).istat;
  }

  /* «I prezzi sono arrivati?»: vero se almeno un'opzione di pagamento, in
     qualunque piano, ha una garanzia selezionata con un importo. */
  function prontoConPrezzi(ip) {
    const P = (typeof window !== 'undefined' && window.__QP_PREZZO) || null;
    if (!P) return false;
    for (const piano of ip || []) {
      for (const opz of (piano && piano.installments) || []) {
        if (P.totaleOpzione(opz)) return true;
      }
    }
    return false;
  }

  async function runQuote(D) {
    // 0) risolvo il codice ISTAT città se ho solo il nome comune
    let cittaIstat = D.cittaIstat;
    if ((!cittaIstat || !/^\d{4,6}$/.test(String(cittaIstat))) && D.comune) {
      try { const ist = await resolveIstat(D.comune, D.cap); if (ist) cittaIstat = ist; } catch {}
    }
    D = Object.assign({}, D, { cittaIstat });
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
    /* Si chiede anche installmentConfiguration: senza, non si sa a QUALE
       frazionamento appartengono gli importi, e un numero di cui non si sa a
       cosa si riferisce non e' un premio. */
    const qq = `query Quote($id: UUID!) { quote(id: $id) { __typename ... on Quote { installmentPrices { installments { installmentConfiguration { slug count size labels { name } } guarantees { slug label selected priceBlocks { coveragePrice { legal } } } } } } } }`;
    let ip = null, last = null;
    for (let i = 0; i < 16; i++) {
      const r2 = await gql('/mfe/covers-api/graphql', qq, { id }, token);
      last = r2;
      if (r2.status === 401) return { ok: false, error: 'covers-api 401 anche col token coniato', quote_id: id, raw: r2.raw };
      const q = r2.json && r2.json.data && r2.json.data.quote;
      ip = q && q.installmentPrices;
      /* Si aspetta che i prezzi arrivino in QUALUNQUE opzione di pagamento,
         non solo nella prima: guardare solo `installments[0]` voleva dire
         rinunciare dopo 16 tentativi anche quando i prezzi c'erano gia', ma
         in un'altra opzione. Il controllo e' lo stesso che usa la lettura. */
      if (prontoConPrezzi(ip)) break;
      await new Promise(r => setTimeout(r, 1500));
    }
    if (!ip || !ip[0]) return { ok: false, error: 'Quote senza prezzi', last: last && last.status, quote_id: id };

    /* IL PREMIO SI LEGGE IN UN POSTO SOLO, ED E' PROVATO.
       Qui prima si prendeva `installments[0]` — la prima opzione di pagamento
       che capitava — e la si chiamava «premio annuale». Se quella era la
       mensile, al cliente si mostrava una RATA come premio dell'anno. Adesso
       l'opzione si sceglie in base al frazionamento richiesto, e se non c'e'
       si dice. Vedi prezzo.js e verifica/prezzo.test.mjs. */
    const P = (typeof window !== 'undefined' && window.__QP_PREZZO) || null;
    if (!P) return { ok: false, error: 'prezzo.js non caricato: l\'estensione e\' incompleta, ricaricala da chrome://extensions', quote_id: id };
    const letto = P.leggiPremio({ installmentPrices: ip }, D.frazionamento);
    if (!letto.ok) return { ok: false, error: letto.error, disponibili: letto.disponibili, quote_id: id };

    const euroIt = (n) => Number(n).toFixed(2).replace('.', ',') + ' \u20ac';
    return {
      ok: true, compagnia: 'Prima', prodotto: 'RC Auto', via: 'estensione',
      premio_annuale_num: letto.premio_annuo,
      premio_annuale: euroIt(letto.premio_annuo),
      annuale: { totale: Number(letto.premio_annuo).toFixed(2).replace('.', ',') },
      rata: letto.premio_rata, rate: letto.rate, frazionamento: letto.frazionamento,
      garanzie_incluse: letto.garanzie.map(g => g.slug),
      dettaglio: letto.garanzie.map(g => ({ slug: g.slug, nome: g.label, price: String(g.prezzo) })),
      alternative: letto.alternative,
      quote_id: id
    };
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
