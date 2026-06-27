// Ponte QUOTO -> scraper Moto Platinum (interno, localhost:4100).
// Protetto da requireAuth (agente loggato su QUOTO). Formato risposta = comparazione.
import { Router } from 'express';

export const motoRouter = Router();
const SCRAPER = process.env.MOTO_SCRAPER_URL || 'http://127.0.0.1:4100';

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

// ── Quotazione AUTO multi-compagnia (nuovo Motor wizard, stile Plurima) ──────────
// Interroga le compagnie disponibili e ritorna una LISTA da comparare (24H + Italiana
// + le prossime). Italiana (Plurima) fa anche da hub: ritorna anagrafica/veicolo/situazione.
const ITALIANA = process.env.ITALIANA_SCRAPER_URL || 'http://127.0.0.1:4300';
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
