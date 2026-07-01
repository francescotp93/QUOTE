// Ponte QUOTO -> scraper Moto Platinum (interno, localhost:4100).
// Protetto da requireAuth (agente loggato su QUOTO). Formato risposta = comparazione.
import { Router } from 'express';

export const motoRouter = Router();
const SCRAPER = process.env.MOTO_SCRAPER_URL || 'http://127.0.0.1:4100';
const HDI = process.env.HDI_SCRAPER_URL || 'http://127.0.0.1:4400';

// Openapi.it — banca dati targa (veloce, fonte PRA). Se la API key non è configurata
// si usa il fallback gratuito sullo scraper Moto Platinum.
const OPENAPI_TOKEN = process.env.OPENAPI_TARGA_TOKEN || '';
const OPENAPI_BASE  = process.env.OPENAPI_TARGA_URL || 'https://targa.openapi.it';

// Mappa la risposta Openapi (campi non garantiti) sul nostro formato veicolo, con fallback multipli.
function mapOpenapiVeicolo(d) {
  if (!d || typeof d !== 'object') return null;
  const pick = (...keys) => { for (const k of keys) { const v = d[k]; if (v != null && v !== '') return v; } return null; };
  const marca = pick('marca', 'make', 'brand');
  const modello = pick('modello', 'model', 'versione', 'denominazione_commerciale');
  return {
    descrizione: [marca, modello].filter(Boolean).join(' ') || null,
    marca, modello,
    cilindrata: pick('cilindrata', 'cc', 'cilindrata_cc'),
    potenza_kw: pick('kw', 'potenza_kw', 'potenza', 'kw_potenza'),
    immatricolazione: pick('data_immatricolazione', 'immatricolazione', 'dataImmatricolazione', 'anno_immatricolazione', 'anno'),
    alimentazione: pick('alimentazione', 'carburante', 'fuel'),
    posti: pick('posti', 'numero_posti'),
    valore: null,
  };
}

async function lookupOpenapi(plate) {
  if (!OPENAPI_TOKEN) return null;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(OPENAPI_BASE + '/moto/' + encodeURIComponent(plate), {
      headers: { Authorization: 'Bearer ' + OPENAPI_TOKEN, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) return { error: (j && (j.message || j.error)) || ('Openapi HTTP ' + r.status), raw: j };
    const data = Array.isArray(j.data) ? (j.data[0] || {}) : (j.data || j || {});
    return { veicolo: mapOpenapiVeicolo(data), raw: j };
  } catch (e) {
    clearTimeout(to);
    return { error: 'Openapi non raggiungibile: ' + e.message };
  }
}

motoRouter.post('/preventivo', async (req, res) => {
  const { targa, nascita, se, rivalsa, garanzie, cf, comune } = req.body || {};
  if (!targa || !nascita) return res.status(400).json({ error: 'Targa e data di nascita obbligatorie.' });

  const q = new URLSearchParams({ targa: String(targa).trim(), nascita: String(nascita).trim() });
  if (cf) q.set('cf', String(cf).toUpperCase().trim());            // nuovo flusso moto.app v2
  if (comune) q.set('comune', String(comune).trim());              // residenza (serve per il premio)
  if (se != null && se !== '') q.set('se', String(se));
  if (rivalsa) q.set('rivalsa', String(rivalsa));
  if (Array.isArray(garanzie) && garanzie.length) q.set('garanzie', garanzie.join(','));
  else if (typeof garanzie === 'string' && garanzie) q.set('garanzie', garanzie);

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 200000); // il nuovo wizard moto.app può metterci ~2 min
    const r = await fetch(SCRAPER + '/quote?' + q.toString(), { signal: ctrl.signal });
    clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) return res.status(502).json({ error: d.error || ('Scraper HTTP ' + r.status) });

    const risultati = [{
      compagnia: d.compagnia || 'Moto Platinum',
      prev: null,
      sconto: null,
      annuale: { totale: (d.premio_totale_num != null ? d.premio_totale_num : d.premio_totale) || null, premio_polizza: null, diritti: null },
      semestrale: null, // Moto Platinum (H24): solo frazionamento annuale
      garanzie_incluse: ['Rinuncia alla rivalsa'].concat(d.garanzie_incluse || []),
      werepair: !!d.werepair,            // badge: solo Moto Platinum
      veicolo: d.veicolo || null,
      dettaglio: { rivalsa: d.input?.rivalsa, se: d.input?.se, garanzie: d.input?.garanzie },
    }];
    res.json({ ok: true, veicolo: d.veicolo || null, risultati });
  } catch (e) {
    res.status(504).json({ error: 'Scraper non raggiungibile o timeout: ' + e.message });
  }
});

// ── 24H ASINCRONO: il preventivo dura ~2 min → il gateway davanti al backend taglia a ~100s.
//    Quindi: /start avvia il calcolo in background e ritorna subito un jobId; il frontend
//    fa polling su /status (richieste veloci, nessun timeout). Il backend↔scraper è interno (no gateway).
const jobs24 = new Map(); // jobId -> { status:'pending'|'done'|'error', risultati, veicolo, error, t }
motoRouter.post('/preventivo24/start', (req, res) => {
  const { targa, nascita, cf, comune, se, rivalsa, garanzie } = req.body || {};
  if (!targa || !nascita) return res.status(400).json({ error: 'Targa e data di nascita obbligatorie.' });
  const jobId = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  jobs24.set(jobId, { status: 'pending', t: Date.now() });
  for (const [k, v] of jobs24) if (Date.now() - v.t > 15 * 60 * 1000) jobs24.delete(k); // pulizia
  (async () => {
    try {
      const q = new URLSearchParams({ targa: String(targa).trim(), nascita: String(nascita).trim() });
      if (cf) q.set('cf', String(cf).toUpperCase().trim());
      if (comune) q.set('comune', String(comune).trim());
      if (se != null && se !== '') q.set('se', String(se));
      if (rivalsa) q.set('rivalsa', String(rivalsa));
      if (Array.isArray(garanzie) && garanzie.length) q.set('garanzie', garanzie.join(','));
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 230000);
      const r = await fetch(SCRAPER + '/quote?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok) { jobs24.set(jobId, { status: 'error', error: (d && d.error) || 'Premio 24H non disponibile.', t: Date.now() }); return; }
      const risultati = [{
        compagnia: d.compagnia || 'Moto Platinum',
        annuale: { totale: (d.premio_totale_num != null ? d.premio_totale_num : d.premio_totale) || null },
        semestrale: null,
        garanzie_incluse: [...new Set(['Rinuncia alla rivalsa', ...(d.garanzie_incluse || [])].map(g => String(g).trim()).filter(Boolean))],
        werepair: !!d.werepair, veicolo: d.veicolo || null,
        opzione_incendio_furto: d.opzione_incendio_furto || null,
      }];
      jobs24.set(jobId, { status: 'done', risultati, veicolo: d.veicolo || null, t: Date.now() });
    } catch (e) { jobs24.set(jobId, { status: 'error', error: 'Scraper non raggiungibile o timeout: ' + e.message, t: Date.now() }); }
  })();
  res.json({ ok: true, jobId });
});
motoRouter.get('/preventivo24/status/:jobId', (req, res) => {
  const j = jobs24.get(req.params.jobId);
  if (!j) return res.status(404).json({ status: 'unknown', error: 'Job non trovato (scaduto?).' });
  res.json(j);
});

// ── PREVENTIVO HDI (Giada/UEFA) — ASINCRONO (il drive dura ~80-100s, oltre il gateway) ───────
// targa + data nascita del proprietario (ANIA) → premio annuale HDI. Vale per auto/moto/autocarri.
const jobsHDI = new Map(); // jobId -> { status, risultati, veicolo, error, t }
motoRouter.post('/preventivoHDI/start', (req, res) => {
  const { targa, nascita } = req.body || {};
  if (!targa || !nascita) return res.status(400).json({ error: 'Targa e data di nascita (proprietario) obbligatorie.' });
  const jobId = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  jobsHDI.set(jobId, { status: 'pending', t: Date.now() });
  for (const [k, v] of jobsHDI) if (Date.now() - v.t > 15 * 60 * 1000) jobsHDI.delete(k); // pulizia
  (async () => {
    try {
      const q = new URLSearchParams({ targa: String(targa).trim().toUpperCase(), nascita: String(nascita).trim() });
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 210000);
      const r = await fetch(HDI + '/premio?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || d.premio_annuale_num == null) {
        const tail = Array.isArray(d && d.log) ? d.log.slice(-2).join(' · ') : '';
        jobsHDI.set(jobId, { status: 'error', error: (d && d.error) || (tail ? 'HDI: ' + tail : 'Premio HDI non disponibile (targa non quotabile con quei dati o proprietario non in ANIA).'), t: Date.now() });
        return;
      }
      const risultati = [{
        compagnia: d.compagnia || 'HDI Assicurazioni',
        annuale: { totale: d.premio_annuale_num },
        garanzie: Array.isArray(d.garanzie) ? d.garanzie : [],
      }];
      jobsHDI.set(jobId, { status: 'done', risultati, veicolo: d.veicolo || null, t: Date.now() });
    } catch (e) { jobsHDI.set(jobId, { status: 'error', error: 'Scraper HDI non raggiungibile o timeout: ' + e.message, t: Date.now() }); }
  })();
  res.json({ ok: true, jobId });
});
motoRouter.get('/preventivoHDI/status/:jobId', (req, res) => {
  const j = jobsHDI.get(req.params.jobId);
  if (!j) return res.status(404).json({ status: 'unknown', error: 'Job non trovato (scaduto?).' });
  res.json(j);
});

// ── PREVENTIVO GLOBALE CASA (HDI prodotto 295) — SINCRONO (~10-30s, sotto il limite gateway) ──
// Params abitazione: provincia, tipo(1/5/6), mq(1/2/3), dimora(1/2/3), piano(1/2/3), cc(1/2/3), eta(1/5/6/4), effetto.
motoRouter.get('/premio-casa', async (req, res) => {
  try {
    const keys = ['provincia', 'tipo', 'mq', 'dimora', 'piano', 'cc', 'eta', 'effetto', 'garanzie', 'valfabbricato', 'valcontenuto'];
    const q = new URLSearchParams();
    for (const k of keys) { const v = (req.query[k] || '').toString().trim(); if (v) q.set(k, v); }
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 90000);
    const r = await fetch(HDI + '/premio-casa?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!d || !d.ok) return res.status(502).json({ ok: false, error: (d && d.error) || 'Premio Casa HDI non disponibile (sessione HDI scaduta? rifai il login da Fonti).' });
    res.json(d);
  } catch (e) { res.status(502).json({ ok: false, error: 'Scraper HDI non raggiungibile o timeout: ' + e.message }); }
});

// ── PREVENTIVO GROUPAMA (ISA · auto RCA) — ASINCRONO (il drive dura ~60-90s) ──────
// Solo targa: ISA recupera il veicolo da ANIA e calcola il premio (prodotto Guidamica).
const GROUPAMA = process.env.GROUPAMA_SCRAPER_URL || 'http://127.0.0.1:4500';
const jobsGRP = new Map();
motoRouter.post('/preventivoGroupama/start', (req, res) => {
  const { targa } = req.body || {};
  if (!targa) return res.status(400).json({ error: 'Targa obbligatoria.' });
  const jobId = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  jobsGRP.set(jobId, { status: 'pending', t: Date.now() });
  for (const [k, v] of jobsGRP) if (Date.now() - v.t > 15 * 60 * 1000) jobsGRP.delete(k);
  (async () => {
    try {
      const q = new URLSearchParams({ targa: String(targa).trim().toUpperCase() });
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 210000);
      const r = await fetch(GROUPAMA + '/premio?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || d.premio_annuale_num == null) {
        jobsGRP.set(jobId, { status: 'error', error: (d && d.error) || 'Premio Groupama non disponibile (targa non quotabile con quotazione rapida, o sessione scaduta: rifai il login da Fonti).', t: Date.now() });
        return;
      }
      const risultati = [{
        compagnia: 'Groupama',
        prodotto: d.prodotto || 'Guidamica Autovetture',
        annuale: { totale: d.premio_annuale_num },
        garanzie: [],
      }];
      const veicolo = (d.marca || d.modello) ? { marca: d.marca, modello: d.modello, valore: d.valore_assicurato, cu: d.cu, bm: d.bm } : null;
      jobsGRP.set(jobId, { status: 'done', risultati, veicolo, t: Date.now() });
    } catch (e) { jobsGRP.set(jobId, { status: 'error', error: 'Scraper Groupama non raggiungibile o timeout: ' + e.message, t: Date.now() }); }
  })();
  res.json({ ok: true, jobId });
});
motoRouter.get('/preventivoGroupama/status/:jobId', (req, res) => {
  const j = jobsGRP.get(req.params.jobId);
  if (!j) return res.status(404).json({ status: 'unknown', error: 'Job non trovato (scaduto?).' });
  res.json(j);
});

// ── AXA (EMISSIONE MOTOR · Nuova Protezione Auto — auto/autocarri/moto) — asincrono ──
// Lo scraper guida il portale Mobility (targa→CERCA→avente diritto→fattori→quotazione) e
// restituisce il premio annuo. Servono i dati del contraente (CF guida la tariffa).
const AXA = process.env.AXA_SCRAPER_URL || 'http://127.0.0.1:4700';
const jobsAXA = new Map();
motoRouter.post('/preventivoAxa/start', (req, res) => {
  const { targa, cf, cognome, nome, data_nascita, data_acquisto } = req.body || {};
  if (!targa) return res.status(400).json({ error: 'Targa obbligatoria.' });
  const jobId = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  jobsAXA.set(jobId, { status: 'pending', t: Date.now() });
  for (const [k, v] of jobsAXA) if (Date.now() - v.t > 15 * 60 * 1000) jobsAXA.delete(k);
  (async () => {
    try {
      const q = new URLSearchParams({ targa: String(targa).trim().toUpperCase() });
      if (cf) q.set('cf', String(cf).trim().toUpperCase());
      if (cognome) q.set('cognome', String(cognome).trim());
      if (nome) q.set('nome', String(nome).trim());
      if (data_nascita) q.set('data_nascita', String(data_nascita).trim());
      if (data_acquisto) q.set('data_acquisto', String(data_acquisto).trim());
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 210000);
      const r = await fetch(AXA + '/premio?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || d.premio_annuale_num == null) {
        jobsAXA.set(jobId, { status: 'error', error: (d && d.error) || 'Premio AXA non disponibile (sessione scaduta? rifai il login da Fonti → AXA).', t: Date.now() });
        return;
      }
      const risultati = [{
        compagnia: 'AXA',
        prodotto: d.prodotto || 'Nuova Protezione Auto',
        annuale: { totale: d.premio_annuale_num },
        garanzie: [],
      }];
      jobsAXA.set(jobId, { status: 'done', risultati, veicolo: null, t: Date.now() });
    } catch (e) { jobsAXA.set(jobId, { status: 'error', error: 'Scraper AXA non raggiungibile o timeout: ' + e.message, t: Date.now() }); }
  })();
  res.json({ ok: true, jobId });
});
motoRouter.get('/preventivoAxa/status/:jobId', (req, res) => {
  const j = jobsAXA.get(req.params.jobId);
  if (!j) return res.status(404).json({ status: 'unknown', error: 'Job non trovato (scaduto?).' });
  res.json(j);
});

// ── Quotazione AUTO multi-compagnia (nuovo Motor wizard, stile Plurima) ──────────
// Interroga le compagnie disponibili e ritorna una LISTA da comparare (24H + Italiana
// + le prossime). Italiana (Plurima) fa anche da hub: ritorna anagrafica/veicolo/situazione.
const ITALIANA = process.env.ITALIANA_SCRAPER_URL || 'http://127.0.0.1:4300';
// ── Banca Dati ANIA (via portale Allianz) ─────────────────────────────────────────────────────
// Da targa → proprietario REALE (CF / P.IVA), impresa attuale, polizza, classe CU / attestato.
// A differenza di Plurima (solo clienti dell'agenzia) interroga la banca dati CENTRALE: vale per
// qualsiasi targa (anche prospect). Utile su rinnovo e voltura (proprietario effettivo del mezzo).
const ALLIANZ = process.env.ALLIANZ_SCRAPER_URL || 'http://127.0.0.1:4200';
motoRouter.get('/ania', async (req, res) => {
  const targa = String(req.query.targa || '').toUpperCase().trim();
  if (!targa) return res.status(400).json({ error: 'Targa obbligatoria.' });
  const q = new URLSearchParams({ targa });
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 95000);
    const r = await fetch(ALLIANZ + '/lookup?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!d || d.error) return res.status(502).json({ error: (d && d.error) || 'Allianz/ANIA non raggiungibile.' });
    res.json({ ok: true, trovato: !!d.trovato, ania: d.ania || null });
  } catch (e) { res.status(502).json({ error: 'Allianz/ANIA non raggiungibile: ' + e.message }); }
});
// ── PREMIO AUTO da Allianz Motor: targa + data nascita proprietario → premio + garanzie ──────────
// Lo scraper pilota il fast-quote Motor (apri → targa+nascita → CALCOLA → legge offerta), ~30-50s.
motoRouter.get('/allianz-auto', async (req, res) => {
  const targa = String(req.query.targa || '').toUpperCase().trim();
  const nascita = String(req.query.nascita || '').trim();
  const tipo = String(req.query.tipo || 'auto').trim();
  if (!targa || !nascita) return res.status(400).json({ error: 'Servono targa e data di nascita (GG/MM/AAAA).' });
  const q = new URLSearchParams({ targa, nascita, tipo });
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 175000);
    const r = await fetch(ALLIANZ + '/premio?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!d || !d.ok) return res.status(502).json({ error: (d && d.error) || 'Allianz Motor non ha restituito un premio.' });
    res.json({ ok: true, compagnia: 'Allianz', premio: d });
  } catch (e) { res.status(504).json({ error: 'Allianz non raggiungibile o timeout: ' + e.message }); }
});
motoRouter.post('/quota-auto', async (req, res) => {
  const b = req.body || {};
  if (!b.targa) return res.status(400).json({ error: 'Targa obbligatoria.' });
  const q = new URLSearchParams();
  for (const k of ['targa', 'situazione', 'attestato', 'bersani', 'tipoGuida', 'frazionamento', 'massimale', 'dataUltimaVoltura', 'indirizzo']) {
    if (b[k] != null && b[k] !== '') q.set(k, String(b[k]));
  }
  if (b.salva) q.set('salva', '1');
  const risultati = [];
  let recuperato = null;
  // ── Italiana (Plurima) ──
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 150000);
    const r = await fetch(ITALIANA + '/preventivo?' + q.toString(), { signal: ctrl.signal });
    clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (d && d.ok) {
      risultati.push({
        compagnia: d.compagnia || 'Italiana Assicurazioni',
        annuale: { totale: d.premio || null }, semestrale: null,
        provvigioni: d.provvigioni || null, daAutorizzare: !!d.daAutorizzare, salvato: !!d.salvato,
        garanzie_incluse: ['Infortuni del conducente', 'Sconto massimo'],
      });
      recuperato = { anagrafica: d.anagrafica || null, veicolo: d.veicolo || null, situazione: d.situazione || null };
    } else if (d && d.error) {
      risultati.push({ compagnia: 'Italiana Assicurazioni', errore: d.error });
    }
  } catch (e) {
    risultati.push({ compagnia: 'Italiana Assicurazioni', errore: 'non raggiungibile: ' + e.message });
  }
  // ── (Le prossime compagnie — es. 24H per moto — si aggiungono qui con la stessa struttura) ──
  res.json({ ok: risultati.some(x => x.annuale && x.annuale.totale), recuperato, risultati });
});

// ── HUB Italiana: da targa (+ codice fiscale) recupera veicolo + anagrafica validata ────
// Chiama lo scraper Italiana (/hub, chiamate API dirette firmate) e normalizza i dati
// per riempire la scheda Cliente di QUOTO. È la "base centrale" da cui ripartono le altre.
motoRouter.get('/hub-auto', async (req, res) => {
  const targa = String(req.query.targa || '').toUpperCase().trim();
  const cf = String(req.query.cf || req.query.codice_fiscale || '').toUpperCase().trim();
  if (!targa && !cf) return res.status(400).json({ error: 'Serve almeno targa o codice fiscale.' });
  const q = new URLSearchParams(); if (targa) q.set('targa', targa); if (cf) q.set('cf', cf);
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 60000);
    const r = await fetch(ITALIANA + '/hub?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    const sd = (d.situazione && d.situazione.data) || {};
    const ad = (d.anagrafica && Array.isArray(d.anagrafica.data) && d.anagrafica.data[0]) || null;
    // Anagrafica RICCA: oltre a nome/cognome/CF passo indirizzo, contatti, nascita e sesso,
    // così QUOTO pre-compila l'intera scheda contraente. "valido" = abbiamo almeno il cognome.
    const di = (ad && ad.dataset_indirizzo) || {};
    const anagrafica = ad ? {
      codice_fiscale: ad.codice_fiscale || cf || null,
      cognome: ad.cognome || null, nome: ad.nome || null,
      ragione_sociale: ad.ragione_sociale || null, partita_iva: ad.partita_iva || null,
      nome_completo: ad.ade_descrizione || [ad.cognome, ad.nome].filter(Boolean).join(' ') || null,
      data_nascita: ad.data_nascita || null,
      sesso: ad.sesso || null,                       // 'M' / 'F'
      cellulare: ad.cellulare || ad.telefono || null,
      email: ad.indirizzo_email || ad.email || null,
      indirizzo: ad.indirizzo_solo || di.indirizzo || null,
      numero_civico: ad.numero_civico || di.numero_civico || null,
      cap: ad.cap || di.cap || null,
      comune: ad.citta || di.comune || null,
      provincia: ad.provincia || di.sigla_provincia || null,
      regione: di.regione || null,
      indirizzo_completo: ad.indirizzo_completo || di.indirizzo_completo || null,
      valido: !!(ad.cognome || ad.nome || ad.ragione_sociale || ad.valid),
    } : null;
    res.json({
      ok: !!(sd.tipo_veicolo || (anagrafica && anagrafica.valido)),
      veicolo: { tipo: sd.tipo_veicolo || null, prodotto: sd.prodotto || null, tipo_proprietario: sd.tipo_proprietario || null, legge_familiare: !!sd.legge_familiare },
      situazioni: sd.situazione_assicurativa || [],
      anagrafica,
    });
  } catch (e) { res.status(502).json({ error: 'Italiana non raggiungibile: ' + e.message }); }
});

// ── DATI VEICOLO da Italiana (Plurima): marca/modello/alimentazione/cilindrata/kW dalla targa ──
// Lo scraper pilota il wizard reale fino allo step 2 (≈15-25s), quindi timeout generoso.
motoRouter.get('/hub-veicolo', async (req, res) => {
  const targa = String(req.query.targa || '').toUpperCase().trim();
  const situazione = String(req.query.situazione || 'Rinnovo').trim();
  const bersani = String(req.query.bersani || '').toUpperCase().trim(); // targa da cui importare la CU (Legge Bersani)
  if (!targa) return res.status(400).json({ error: 'Targa obbligatoria.' });
  const q = new URLSearchParams({ targa, situazione });
  if (bersani) q.set('bersani', bersani);
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 60000);
    const r = await fetch(ITALIANA + '/hubveicolo?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!d || !d.ok) return res.status(502).json({ error: (d && d.error) || ('Scraper HTTP ' + r.status) });
    res.json({
      ok: true, veicolo: d.veicolo || null, prodotto: d.prodotto || null,
      situazione_assicurativa: d.situazione_assicurativa || null,
      proprietario: d.proprietario || null, contraente: d.contraente || null,
      data_scadenza_polizza: d.data_scadenza_polizza || null,
      garanzie_predefinite: d.garanzie_predefinite || null,
    });
  } catch (e) { res.status(504).json({ error: 'Italiana non raggiungibile o timeout: ' + e.message }); }
});

// ── PREMIO da Italiana (Plurima): targa (+ situazione, + bersani) → premio strutturato ────────
// Lo scraper pilota il wizard fino allo step Preventivo e calcola il premio (job ~30-40s).
motoRouter.get('/premio', async (req, res) => {
  const targa = String(req.query.targa || '').toUpperCase().trim();
  const situazione = String(req.query.situazione || 'Rinnovo').trim();
  const bersani = String(req.query.bersani || '').toUpperCase().trim();
  const garanzie = String(req.query.garanzie || '').trim(); // chiavi ARD/CVT (selezionaGaranzia), CSV
  const cf = String(req.query.cf || '').toUpperCase().trim();       // CF contraente (Voltura)
  const indirizzo = String(req.query.indirizzo || '').trim();       // indirizzo contraente (Voltura)
  if (!targa) return res.status(400).json({ error: 'Targa obbligatoria.' });
  const q = new URLSearchParams({ targa, situazione });
  if (bersani) q.set('bersani', bersani);
  if (garanzie) q.set('garanzie', garanzie);
  if (cf) q.set('cf', cf);
  if (indirizzo) q.set('indirizzo', indirizzo);
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 175000);
    const r = await fetch(ITALIANA + '/premio?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!d || !d.ok) {
      // messaggio utile: errore reale dello scraper o ultime righe di log (il portale non ha calcolato il premio)
      const tail = Array.isArray(d && d.log) ? d.log.slice(-3).join(' · ') : '';
      const msg = (d && d.error) || (tail ? 'Premio non calcolato dal portale: ' + tail : 'Il portale non ha restituito un premio valido (riprova).');
      return res.status(502).json({ error: msg, premio: d && d.premio, log: d && d.log });
    }
    res.json({ ok: true, premio: d.premio || null });
  } catch (e) { res.status(504).json({ error: 'Italiana non raggiungibile o timeout: ' + e.message }); }
});

// Recupero dati veicolo DALLA SOLA TARGA (la banca dati dipende dalla targa, non dalla data).
// In fase preliminare si usa una data di nascita "farlocca" se non fornita. Ordine: Openapi (se
// configurata) -> scraper Moto Platinum (gratis).
motoRouter.post('/lookup', async (req, res) => {
  const { targa } = req.body || {};
  if (!targa) return res.status(400).json({ error: 'Targa obbligatoria.' });
  const plate = String(targa).trim().toUpperCase();
  const nascita = (req.body && req.body.nascita && String(req.body.nascita).trim()) || '01/01/1980'; // farlocca: serve solo al portale, non cambia il veicolo

  // 1) Openapi (veloce) — solo se è configurata la API key
  const oa = await lookupOpenapi(plate);
  if (oa && oa.veicolo && oa.veicolo.descrizione) {
    return res.json({ ok: true, source: 'openapi', veicolo: oa.veicolo, raw: JSON.stringify(oa.raw).slice(0, 3000) });
  }

  // 2) Fallback scraper gratuito (targa + nascita farlocca)
  const q = new URLSearchParams({ targa: plate, nascita });
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 120000);
    const r = await fetch(SCRAPER + '/lookup?' + q.toString(), { signal: ctrl.signal });
    clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) return res.status(502).json({ error: d.error || ('Scraper HTTP ' + r.status) });
    res.json({ ok: true, source: 'scraper', veicolo: d.veicolo || null, raw: d._text || null, dump: d._dump || null });
  } catch (e) {
    res.status(504).json({ error: 'Scraper non raggiungibile o timeout: ' + e.message });
  }
});
