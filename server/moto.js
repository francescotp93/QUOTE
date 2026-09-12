// Ponte QUOTO -> scraper Moto Platinum (interno, localhost:4100).
// Protetto da requireAuth (agente loggato su QUOTO). Formato risposta = comparazione.
import { Router } from 'express';
import { registraEsito } from './esiti.js';

export const motoRouter = Router();

/* Il registro degli esiti (server/esiti.js): una riga per compagnia per ogni
   tentativo, riuscito o no. `risposta` e' quello che ha detto lo scraper,
   `errore` il messaggio se e' andata male, `durata_ms` il tempo attorno alla
   chiamata. Non lancia mai e non fa aspettare piu' di qualche secondo: torna
   l'id della riga, da rimandare al browser come `esito_id`, oppure null. */
function esito(req, e) {
  return registraEsito(Object.assign({ utente: req.user, modulo: 'rca' }, e));
}
const lineaDaTipo = (t) => { t = String(t || 'auto').toLowerCase(); return /moto|ciclo|scooter/.test(t) ? 'moto' : (/autocarro|autocar/.test(t) ? 'autocarro' : 'auto'); };
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

  const t0 = Date.now();
  const base = { linea: 'moto', compagnia: 'Moto Platinum', targa, richiesta: req.body, fonte: 'pagina' };
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 200000); // il nuovo wizard moto.app può metterci ~2 min
    const r = await fetch(SCRAPER + '/quote?' + q.toString(), { signal: ctrl.signal });
    clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) {
      const msg = d.error || ('Scraper HTTP ' + r.status);
      return res.status(502).json({ error: msg, esito_id: await esito(req, Object.assign(base, { risposta: d, errore: msg, durata_ms: Date.now() - t0 })) });
    }

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
    const esito_id = await esito(req, Object.assign(base, { compagnia: risultati[0].compagnia, risposta: d, premio: risultati[0].annuale.totale, durata_ms: Date.now() - t0 }));
    res.json({ ok: true, veicolo: d.veicolo || null, risultati, esito_id });
  } catch (e) {
    const msg = 'Scraper non raggiungibile o timeout: ' + e.message;
    res.status(504).json({ error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })) });
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
  const t0 = Date.now();
  const base = { linea: 'moto', compagnia: 'Moto Platinum', targa, richiesta: req.body, fonte: 'pagina' };
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
      if (!d || !d.ok) {
        const msg = (d && d.error) || 'Premio 24H non disponibile.';
        jobs24.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { risposta: d, errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
        return;
      }
      const risultati = [{
        compagnia: d.compagnia || 'Moto Platinum',
        annuale: { totale: (d.premio_totale_num != null ? d.premio_totale_num : d.premio_totale) || null },
        semestrale: null,
        garanzie_incluse: [...new Set(['Rinuncia alla rivalsa', ...(d.garanzie_incluse || [])].map(g => String(g).trim()).filter(Boolean))],
        werepair: !!d.werepair, veicolo: d.veicolo || null,
        opzione_incendio_furto: d.opzione_incendio_furto || null,
      }];
      const esito_id = await esito(req, Object.assign(base, { compagnia: risultati[0].compagnia, risposta: d, premio: risultati[0].annuale.totale, durata_ms: Date.now() - t0 }));
      jobs24.set(jobId, { status: 'done', risultati, veicolo: d.veicolo || null, esito_id, t: Date.now() });
    } catch (e) {
      const msg = 'Scraper non raggiungibile o timeout: ' + e.message;
      jobs24.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
    }
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
  const { targa, nascita, tipo, tipoGuida, massimale, frazionamento, garanzie, residenza } = req.body || {};
  if (!targa || !nascita) return res.status(400).json({ error: 'Targa e data di nascita (proprietario) obbligatorie.' });
  const jobId = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  jobsHDI.set(jobId, { status: 'pending', t: Date.now() });
  for (const [k, v] of jobsHDI) if (Date.now() - v.t > 15 * 60 * 1000) jobsHDI.delete(k); // pulizia
  const t0 = Date.now();
  const base = { linea: lineaDaTipo(tipo), compagnia: 'HDI Assicurazioni', targa, richiesta: req.body };
  (async () => {
    try {
      const q = new URLSearchParams({ targa: String(targa).trim().toUpperCase(), nascita: String(nascita).trim() });
      // Linea veicolo (auto/moto) → lo scraper HDI sceglie il prodotto fastmotor giusto (auto 391/63224
      // o moto "Circolazione Sicura" 375/63005). Senza, una moto restava sul prodotto auto e si appendeva.
      if (tipo) q.set('linea', String(tipo).trim());
      // Parametri di polizza da QUOTO (guida/massimale/frazionamento) → applicati sul portale HDI.
      if (tipoGuida) q.set('tipoGuida', String(tipoGuida).trim());
      if (massimale) q.set('massimale', String(massimale).trim());
      if (frazionamento) q.set('frazionamento', String(frazionamento).trim());
      // Garanzie flaggate in QUOTO (chiavi UI: incendioFurto, attiVandalici, ...): lo scraper HDI le
      // traduce nei propri codici prodotto e le aggiunge al pacchetto minimo. Le dipendenze (es. atti
      // vandalici richiede incendio/furto) sono già risolte nel frontend, ma lo scraper le riverifica.
      if (Array.isArray(garanzie) && garanzie.length) q.set('garanzie', garanzie.join(','));
      else if (typeof garanzie === 'string' && garanzie) q.set('garanzie', garanzie);
      // Residenza del contraente → la via diretta HDI (/premio-motor) la usa per riempire l'indirizzo
      // dei soggetti quando l'ANIA non lo restituisce: senza provincia/comune il controllo SIVI va in
      // NPE (errore 500 su situazioneassicurativa/inizializzaAssumption). Inoltro prov/comune/cap/via/civ.
      if (residenza && typeof residenza === 'object') {
        if (residenza.prov) q.set('prov', String(residenza.prov).trim());
        if (residenza.comune) q.set('comune', String(residenza.comune).trim());
        if (residenza.cap) q.set('cap', String(residenza.cap).trim());
        if (residenza.indirizzo) q.set('via', String(residenza.indirizzo).trim());
        if (residenza.civico) q.set('civ', String(residenza.civico).trim());
      }
      // HDI ha DUE vie di quotazione motor:
      //  • /premio-motor = API diretta (JWT UEFA già caldo): ~pochi secondi, la stessa via del preventivo Casa.
      //  • /premio       = pilotaggio del portale via browser: fino a ~82s di attese + lock a 135s → spesso
      //                     "operazione HDI oltre 135s: lock rilasciato" (la quotazione non arriva mai).
      // Provo PRIMA la via diretta (veloce); se non risponde un premio, RIPIEGO sul browser. La forma
      // della risposta è identica (premio_annuale_num/compagnia/garanzie/veicolo). Disattivabile con
      // HDI_DIRECT=0 per tornare al solo browser.
      const HDI_DIRECT = (process.env.HDI_DIRECT || '1') !== '0';
      const fetchHDI = async (path, ms) => {
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), ms);
        try { const r = await fetch(HDI + path + '?' + q.toString(), { signal: ctrl.signal }); return await r.json().catch(() => ({})); }
        finally { clearTimeout(to); }
      };
      /* dUltimo: l'ultima risposta dello scraper anche quando NON porta un premio. Prima si
         teneva solo quella buona, e in errore d restava null: le segnalazioni del portale
         (BLOCCANTE, AUTORIZZATIVA) e il dettaglio tecnico che lo scraper manda proprio quando
         non quota sarebbero andati persi. Serve al registro degli esiti. */
      let d = null, dErr = null, dFallback = false, dUltimo = null, viaBrowser = false;
      if (HDI_DIRECT) {
        // Via diretta con 110s: il refresh del token a freddo è SOLO navigazione (no OTP: la sessione
        // SSO è viva), quindi la diretta si auto-scalda in ~45-60s e chiude. Con pre-warm all'avvio +
        // keep-alive che rinnova il token, di norma è caldo e chiude in pochi secondi.
        try {
          const dd = await fetchHDI('/premio-motor', 70000); // 70s: con il timeout per-step lato scraper la diretta ritorna presto
          if (dd && dd.ok && dd.premio_annuale_num != null) d = dd;
          else { dErr = (dd && dd.error) || 'diretta senza premio'; dFallback = !!(dd && dd._fallback); dUltimo = dd || null; }
        }
        // Abort/timeout o errore di rete sulla diretta = risposta NON definitiva (non è un "targa non
        // quotabile"): la rendo recuperabile (dFallback) così scatta il ripiego sul browser qui sotto.
        catch (e) { dErr = 'diretta: ' + (e.message || e); dFallback = true; }
      }
      // Ripiego sul browser se: la via diretta è disattivata (HDI_DIRECT=0), OPPURE la diretta è
      // fallita per un problema di SESSIONE/token recuperabile (dd._fallback: status 0/401/403 sulla
      // risoluzione targa, es. token UEFA freddo). Così una targa VALIDA non va persa per un token a
      // freddo. NON ripiego per "targa non quotabile" reale (nessun _fallback): lì il browser
      // sprecherebbe fino a 135s di lock senza mai produrre un premio.
      if (!d && (!HDI_DIRECT || dFallback)) {
        try {
          viaBrowser = true;
          const bb = await fetchHDI('/premio', 210000);
          if (bb && bb.ok && bb.premio_annuale_num != null) d = bb;
          else { dUltimo = bb || dUltimo; if (bb && bb.error) dErr = bb.error; }
        }
        catch (e) { if (!dErr) dErr = 'browser: ' + (e.message || e); }
      }
      if (!d || !d.ok || d.premio_annuale_num == null) {
        const tail = Array.isArray(d && d.log) ? d.log.slice(-2).join(' · ') : '';
        const msg = (d && d.error) || dErr || (tail ? 'HDI: ' + tail : 'Premio HDI non disponibile (targa non quotabile con quei dati o proprietario non in ANIA).');
        /* La via diretta (dErr) e il ripiego browser (d) possono aver fallito entrambi: nel
           registro finiscono tutti e due i messaggi, perche' il primo spiega spesso il secondo. */
        jobsHDI.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { risposta: d || dUltimo, errore: dErr && dErr !== msg ? msg + ' [diretta: ' + dErr + ']' : msg, fonte: viaBrowser ? 'browser' : 'diretta', durata_ms: Date.now() - t0 })), t: Date.now() });
        return;
      }
      const risultati = [{
        compagnia: d.compagnia || 'HDI Assicurazioni',
        annuale: { totale: d.premio_annuale_num },
        garanzie: Array.isArray(d.garanzie) ? d.garanzie : [],
        // Campi AGGIUNTIVI della via diretta (la via browser non li produce e restano null/vuoti): chi
        // legge il risultato oggi usa solo compagnia/annuale/garanzie e non se ne accorge.
        //  • segnalazioni: quello che dice il portale sul preventivo. INFORMATIVA = nota, AUTORIZZATIVA =
        //    si quota ma per emettere serve una deroga, BLOCCANTE = il preventivo non si fa (e in quel
        //    caso il testo è già finito nel messaggio d'errore).
        //  • premio_netto / imposte: la scomposizione del premio come la dà HDI.
        //  • sconto: quanto sconto l'agenzia POTREBBE concedere. HDI lo dichiara garanzia per garanzia, e
        //    sulle accessorie (furto, incendio, eventi) spesso NON lo dichiara affatto. Quindi
        //    premio_con_sconto_max_dichiarato è il totale con i soli sconti dichiarati e, quando
        //    sconto_max_parziale è vero, lo sconto vero può essere parecchio più alto. È un'indicazione,
        //    non un prezzo da promettere al cliente: il premio mostrato resta il listino.
        //  • valore_veicolo: il valore su cui HDI tariffa furto e incendio, utile per capire un premio
        //    che sembra strano.
        segnalazioni: Array.isArray(d.segnalazioni) ? d.segnalazioni : [],
        premio_netto: d.premio_netto_num != null ? d.premio_netto_num : null,
        imposte: d.imposte_num != null ? d.imposte_num : null,
        valore_veicolo: d.valore_veicolo || null,
        sconto_max_pct_rca: d.sconto_max_pct_rca != null ? d.sconto_max_pct_rca : null,
        sconto_max_per_garanzia: Array.isArray(d.sconto_max_per_garanzia) ? d.sconto_max_per_garanzia : [],
        premio_con_sconto_max_dichiarato: d.premio_con_sconto_max_dichiarato_num != null ? d.premio_con_sconto_max_dichiarato_num : null,
        sconto_max_parziale: !!d.sconto_max_parziale,
      }];
      /* SE IL PREMIO ARRIVA DAL BROWSER, NEL REGISTRO DEVE RESTARE PERCHE'.
         La via diretta produce i campi che servono a capire il prezzo (garanzie
         spente, valore del veicolo, sconto massimo, segnalazioni del portale);
         il browser no. Quando si ripiega, quei campi mancano e il premio può
         essere più caro del preventivo fatto a mano — ed e' esattamente quello
         che e' successo la sera dell'11/09/2026, senza che il registro sapesse
         dire il motivo della caduta. Ora lo dice: `diretta_fallita` porta il
         messaggio, e chi rivede la giornata non deve andare a cercarlo nel
         giornale della macchina. */
      const viaUsata = d.via || (viaBrowser ? 'browser' : (HDI_DIRECT ? 'diretta' : 'browser'));
      if (viaBrowser && dErr) risultati[0].diretta_fallita = String(dErr).slice(0, 300);
      const esito_id = await esito(req, Object.assign(base, { compagnia: risultati[0].compagnia, prodotto: d.prodotto || null, risposta: d, premio: d.premio_annuale_num, fonte: viaUsata, durata_ms: Date.now() - t0,
        diagnostica_extra: viaBrowser ? { diretta_fallita: dErr || 'motivo non riportato dallo scraper', campi_prezzo_assenti: 'via browser: niente garanzie spente, valore veicolo, sconto massimo' } : null }));
      jobsHDI.set(jobId, { status: 'done', risultati, veicolo: d.veicolo || null, esito_id, t: Date.now() });
    } catch (e) {
      const msg = 'Scraper HDI non raggiungibile o timeout: ' + e.message;
      jobsHDI.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
    }
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
    const keys = ['provincia', 'tipo', 'mq', 'dimora', 'piano', 'cc', 'eta', 'effetto', 'garanzie', 'valfabbricato', 'valcontenuto', 'rcmassvita', 'rcmassprop', 'bnbvita', 'bnbprop', 'animalivita', 'frazcode', 'fattori'];
    const q = new URLSearchParams();
    for (const k of keys) { const v = (req.query[k] || '').toString().trim(); if (v) q.set(k, v); }
    const t0 = Date.now();
    const base = { modulo: 'casa', linea: 'casa', compagnia: 'HDI Assicurazioni', prodotto: 'Globale Casa', richiesta: req.query };
    let d = null;
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 150000); // margine per coda scraper (browser singolo) + re-login
      const r = await fetch(HDI + '/premio-casa?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
      d = await r.json().catch(() => ({}));
    } catch (e) {
      const msg = 'Scraper HDI non raggiungibile o timeout: ' + e.message;
      return res.status(502).json({ ok: false, error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })) });
    }
    if (!d || !d.ok) {
      const msg = (d && d.error) || 'Premio Casa HDI non disponibile (sessione HDI scaduta? rifai il login da Fonti).';
      return res.status(502).json({ ok: false, error: msg, esito_id: await esito(req, Object.assign(base, { risposta: d, errore: msg, durata_ms: Date.now() - t0 })) });
    }
    const esito_id = await esito(req, Object.assign(base, { risposta: d, premio: d.premio ?? d.totale, durata_ms: Date.now() - t0 }));
    res.json(Object.assign({}, d, { esito_id }));
  } catch (e) { res.status(502).json({ ok: false, error: 'Scraper HDI non raggiungibile o timeout: ' + e.message }); }
});
// ── PREMIO CASA HDI — ASINCRONO (start+polling): la via diretta è ~1-2s, ma se cade nel ripiego
// browser mentre il lock è tenuto da un Motor/TCM può avvicinarsi al lock 135s e superare il taglio
// del gateway (~100s) su una richiesta sincrona. Il job in background elimina quel rischio. Il GET
// sincrono /premio-casa resta per retro-compatibilità.
const jobsCasa = new Map(); // jobId -> { status, d, error, t }
/* Esportata perche' la usa anche l'adattatore Casa dell'API v1
   (server/quoteApi.js). L'elenco dei campi che HDI accetta deve stare in UN
   posto solo: due copie divergono al primo campo aggiunto, e il preventivo
   esce senza quel dato senza che nessuno se ne accorga. */
export const CASA_KEYS = ['provincia', 'tipo', 'mq', 'dimora', 'piano', 'cc', 'eta', 'effetto', 'garanzie', 'valfabbricato', 'valcontenuto', 'rcmassvita', 'rcmassprop', 'bnbvita', 'bnbprop', 'animalivita', 'frazcode', 'fattori'];
motoRouter.post('/preventivoCasa/start', (req, res) => {
  const body = req.body || {};
  const jobId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  jobsCasa.set(jobId, { status: 'pending', t: Date.now() });
  for (const [k, v] of jobsCasa) if (Date.now() - v.t > 15 * 60 * 1000) jobsCasa.delete(k); // pulizia
  const t0 = Date.now();
  const base = { modulo: 'casa', linea: 'casa', compagnia: 'HDI Assicurazioni', prodotto: 'Globale Casa', richiesta: body };
  (async () => {
    try {
      const q = new URLSearchParams();
      for (const k of CASA_KEYS) { const v = (body[k] != null ? body[k] : '').toString().trim(); if (v) q.set(k, v); }
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 230000); // copre l'eventuale ripiego browser sotto lock
      const r = await fetch(HDI + '/premio-casa?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok) {
        const msg = (d && d.error) || 'Premio Casa HDI non disponibile (sessione HDI scaduta? rifai il login da Fonti).';
        jobsCasa.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { risposta: d, errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
        return;
      }
      const esito_id = await esito(req, Object.assign(base, { risposta: d, premio: d.premio ?? d.totale, durata_ms: Date.now() - t0 }));
      jobsCasa.set(jobId, { status: 'done', d, esito_id, t: Date.now() });
    } catch (e) {
      const msg = 'Scraper HDI non raggiungibile o timeout: ' + e.message;
      jobsCasa.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
    }
  })();
  res.json({ ok: true, jobId });
});
motoRouter.get('/preventivoCasa/status/:jobId', (req, res) => {
  const j = jobsCasa.get(req.params.jobId);
  if (!j) return res.status(404).json({ status: 'unknown', error: 'Job non trovato (scaduto?).' });
  res.json(j);
});

// PREVENTIVO VITA TCM (Protezione Serena / TCM Mutuo) — pilota il wizard JSP /hdiqq
motoRouter.get('/premio-tcm', async (req, res) => {
  try {
    const keys = ['capitale', 'durata', 'nascita', 'eta', 'fumatore', 'frazcode', 'decorrenza', 'prodotto'];
    const q = new URLSearchParams();
    for (const k of keys) { const v = (req.query[k] || '').toString().trim(); if (v) q.set(k, v); }
    const t0 = Date.now();
    const base = { modulo: 'vita', linea: 'vita', compagnia: 'HDI Assicurazioni', prodotto: 'TCM ' + String(req.query.prodotto || '').trim(), richiesta: req.query };
    let d = null;
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 150000); // TCM: wizard 10 step + eventuale coda/re-login
      const r = await fetch(HDI + '/premio-tcm?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
      d = await r.json().catch(() => ({}));
    } catch (e) {
      const msg = 'Scraper HDI non raggiungibile o timeout: ' + e.message;
      return res.status(502).json({ ok: false, error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })) });
    }
    if (!d || !d.ok) {
      const msg = (d && d.error) || 'Premio TCM HDI non disponibile (sessione HDI scaduta? rifai il login da Fonti).';
      return res.status(502).json({ ok: false, error: msg, esito_id: await esito(req, Object.assign(base, { risposta: d, errore: msg, durata_ms: Date.now() - t0 })) });
    }
    const esito_id = await esito(req, Object.assign(base, { risposta: d, premio: d.premio_lordo, durata_ms: Date.now() - t0 }));
    res.json(Object.assign({}, d, { esito_id }));
  } catch (e) { res.status(502).json({ ok: false, error: 'Scraper HDI non raggiungibile o timeout: ' + e.message }); }
});

// ── PREVENTIVO GROUPAMA (ISA · auto RCA) — ASINCRONO (il drive dura ~60-90s) ──────
// Solo targa: ISA recupera il veicolo da ANIA e calcola il premio (prodotto Guidamica).
const GROUPAMA = process.env.GROUPAMA_SCRAPER_URL || 'http://127.0.0.1:4500';
const jobsGRP = new Map();
motoRouter.post('/preventivoGroupama/start', (req, res) => {
  const { targa, tipoGuida, massimale, frazionamento } = req.body || {};
  if (!targa) return res.status(400).json({ error: 'Targa obbligatoria.' });
  const jobId = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  jobsGRP.set(jobId, { status: 'pending', t: Date.now() });
  for (const [k, v] of jobsGRP) if (Date.now() - v.t > 15 * 60 * 1000) jobsGRP.delete(k);
  const t0 = Date.now();
  const base = { linea: 'auto', compagnia: 'Groupama', targa, richiesta: req.body };
  (async () => {
    try {
      const q = new URLSearchParams({ targa: String(targa).trim().toUpperCase() });
      // Parametri di polizza da QUOTO (guida/massimale/frazionamento) → applicati sul portale ISA.
      if (tipoGuida) q.set('tipoGuida', String(tipoGuida).trim());
      if (massimale) q.set('massimale', String(massimale).trim());
      if (frazionamento) q.set('frazionamento', String(frazionamento).trim());
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 210000);
      const r = await fetch(GROUPAMA + '/premio?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || d.premio_annuale_num == null) {
        const msg = (d && d.error) || 'Premio Groupama non disponibile (targa non quotabile con quotazione rapida, o sessione scaduta: rifai il login da Fonti).';
        jobsGRP.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { risposta: d, errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
        return;
      }
      const risultati = [{
        compagnia: 'Groupama',
        prodotto: d.prodotto || 'Guidamica Autovetture',
        annuale: { totale: d.premio_annuale_num },
        garanzie: [],
        // dallo scraper (lettura JSON ISA): avvisi/blocchi del portale e scomposizione del premio.
        // Campi in piu', additivi: index.html non li usa ancora (bloccanti = premio non emettibile).
        fonte_premio: d.fonte_premio || 'pagina',
        avvisi: d.avvisi || [],
        bloccanti: d.bloccanti || [],
        dettaglio: d.dettaglio || null,
      }];
      const veicolo = (d.marca || d.modello) ? { marca: d.marca, modello: d.modello, valore: d.valore_assicurato, cu: d.cu, bm: d.bm } : null;
      const esito_id = await esito(req, Object.assign(base, { prodotto: risultati[0].prodotto, risposta: d, premio: d.premio_annuale_num, durata_ms: Date.now() - t0 }));
      jobsGRP.set(jobId, { status: 'done', risultati, veicolo, esito_id, t: Date.now() });
    } catch (e) {
      const msg = 'Scraper Groupama non raggiungibile o timeout: ' + e.message;
      jobsGRP.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
    }
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
  const { targa, cf, cognome, nome, data_nascita, data_acquisto, tipoGuida, massimale, frazionamento } = req.body || {};
  if (!targa) return res.status(400).json({ error: 'Targa obbligatoria.' });
  const jobId = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  jobsAXA.set(jobId, { status: 'pending', t: Date.now() });
  for (const [k, v] of jobsAXA) if (Date.now() - v.t > 15 * 60 * 1000) jobsAXA.delete(k);
  const t0 = Date.now();
  const base = { linea: 'auto', compagnia: 'AXA', targa, richiesta: req.body, fonte: 'pagina' };
  (async () => {
    try {
      const q = new URLSearchParams({ targa: String(targa).trim().toUpperCase() });
      if (cf) q.set('cf', String(cf).trim().toUpperCase());
      if (cognome) q.set('cognome', String(cognome).trim());
      if (nome) q.set('nome', String(nome).trim());
      if (data_nascita) q.set('data_nascita', String(data_nascita).trim());
      if (data_acquisto) q.set('data_acquisto', String(data_acquisto).trim());
      // Parametri di polizza da QUOTO → il portale Mobility li applica (quando lo scraper AXA saprà
      // impostare la guida; per ora vengono inoltrati e sarà lo scraper a usarli).
      if (tipoGuida) q.set('tipoGuida', String(tipoGuida).trim());
      if (massimale) q.set('massimale', String(massimale).trim());
      if (frazionamento) q.set('frazionamento', String(frazionamento).trim());
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 210000);
      const r = await fetch(AXA + '/premio?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || d.premio_annuale_num == null) {
        const msg = (d && d.error) || 'Premio AXA non disponibile (sessione scaduta? rifai il login da Fonti → AXA).';
        jobsAXA.set(jobId, { status: 'error', error: msg, url: d && d.url, dump: d && d.dump, esito_id: await esito(req, Object.assign(base, { risposta: d, errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
        return;
      }
      const risultati = [{
        compagnia: 'AXA',
        prodotto: d.prodotto || 'Nuova Protezione Auto',
        annuale: { totale: d.premio_annuale_num },
        garanzie: [],
      }];
      const esito_id = await esito(req, Object.assign(base, { prodotto: risultati[0].prodotto, risposta: d, premio: d.premio_annuale_num, durata_ms: Date.now() - t0 }));
      jobsAXA.set(jobId, { status: 'done', risultati, veicolo: null, esito_id, t: Date.now() });
    } catch (e) {
      const msg = 'Scraper AXA non raggiungibile o timeout: ' + e.message;
      jobsAXA.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
    }
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
  const t0 = Date.now();
  const base = { linea: lineaDaTipo(tipo), compagnia: 'Allianz', targa, richiesta: req.query, fonte: 'pagina' };
  try {
    // rotta sincrona storica: stesso motivo dell'asincrona sopra, 175s -> 225s
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 225000);
    const r = await fetch(ALLIANZ + '/premio?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!d || !d.ok) {
      const msg = (d && d.error) || 'Allianz Motor non ha restituito un premio.';
      return res.status(502).json({ error: msg, esito_id: await esito(req, Object.assign(base, { risposta: d, errore: msg, durata_ms: Date.now() - t0 })) });
    }
    const esito_id = await esito(req, Object.assign(base, { prodotto: d.pacchetto || null, risposta: d, premio: d.premio_annuale, durata_ms: Date.now() - t0 }));
    res.json({ ok: true, compagnia: 'Allianz', premio: d, esito_id });
  } catch (e) {
    const msg = 'Allianz non raggiungibile o timeout: ' + e.message;
    res.status(504).json({ error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })) });
  }
});
// ── PREMIO AUTO Allianz — ASINCRONO (il fast-quote Motor può durare 90-225s: oltre il gateway) ──
// Stesso pattern di HDI/AXA/Groupama: /start avvia il calcolo in background e ritorna subito un
// jobId; il frontend fa polling su /status (richieste veloci). Il backend↔scraper è interno (no
// gateway a tagliare a ~100s). /allianz-auto (sincrono) resta per retro-compatibilità.
const jobsAllianz = new Map(); // jobId -> { status:'pending'|'done'|'error', premio, error, t }
motoRouter.post('/preventivoAllianz/start', (req, res) => {
  const { targa, nascita, tipo, tipoGuida, massimale, frazionamento, garanzie, bersani, infortuni } = req.body || {};
  const plate = String(targa || '').toUpperCase().trim();
  const nasc = String(nascita || '').trim();
  if (!plate || !nasc) return res.status(400).json({ error: 'Servono targa e data di nascita (GG/MM/AAAA).' });
  const jobId = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  jobsAllianz.set(jobId, { status: 'pending', t: Date.now() });
  for (const [k, v] of jobsAllianz) if (Date.now() - v.t > 15 * 60 * 1000) jobsAllianz.delete(k); // pulizia
  const t0 = Date.now();
  const base = { linea: lineaDaTipo(tipo), compagnia: 'Allianz', targa: plate, richiesta: req.body, fonte: 'pagina' };
  (async () => {
    try {
      const q = new URLSearchParams({ targa: plate, nascita: nasc, tipo: String(tipo || 'auto').trim() });
      // Parametri di polizza da QUOTO → applicati sul portale Allianz dallo scraper /premio.
      if (tipoGuida) q.set('tipoGuida', String(tipoGuida).trim());
      if (massimale) q.set('massimale', String(massimale).trim());
      if (frazionamento) q.set('frazionamento', String(frazionamento).trim());
      if (Array.isArray(garanzie) && garanzie.length) q.set('garanzie', garanzie.join(','));
      else if (typeof garanzie === 'string' && garanzie) q.set('garanzie', garanzie);
      // Le garanzie di QUOTO arrivano con i nomi della mappa Italiana (infortuni_conducente,
      // assistenza, incendio, ...). Lo scraper Allianz non legge quell'elenco: capisce due
      // interruttori, che qui traduciamo (prima l'elenco viaggiava e veniva ignorato).
      const garElenco = (Array.isArray(garanzie) ? garanzie : String(garanzie || '').split(','))
        .map(g => String(g || '').trim().toLowerCase()).filter(Boolean);
      // ASSISTENZA = gli Auto Rischi Diversi che il portale pre-include (Assistenza Auto + Rapid
      // Repair + Imprevisti da circolazione): si tengono solo se l'agente li ha davvero scelti.
      // (Con ALLIANZ_MOTOR_ESCLUSIVO=0 sullo scraper non si spegne nulla, ARD compresi: e' il
      // comportamento di prima della patch, l'interruttore d'emergenza.)
      q.set('assistenza', garElenco.some(g => /assistenz/.test(g)) ? '1' : '0');
      /* INFORTUNI DEL CONDUCENTE: sempre accesi, perché sono il pacchetto base dichiarato da QUOTO
         (RCA + rinuncia rivalsa + infortuni 31.000/31.000 + carrozzeria convenzionata) e
         l'interfaccia non permette di toglierli davvero: la mappa delle garanzie li fa sparire
         dall'elenco anche quando restano previsti. Dedurli dall'elenco darebbe due risposte opposte
         allo stesso gesto dell'agente. Si spengono solo se la richiesta lo chiede esplicitamente
         (infortuni: 0). Per renderli disattivabili dall'interfaccia servirà una modifica a
         index.html (fuori da questo intervento). */
      q.set('infortuni', (infortuni === 0 || infortuni === false || String(infortuni) === '0') ? '0' : '1');
      // Legge Bersani / Importa CU: targa "donatrice" da cui lo scraper Allianz importa la classe
      // di merito (ATR/CU). Lo scraper /premio la accetta come 'bersani'. Param opzionale: se assente
      // il flusso resta identico al preventivo normale.
      if (bersani) q.set('bersani', String(bersani).toUpperCase().trim());
      // 230s coprivano il caso lento (~225s) con 5s di margine. Le garanzie ora si impostano con
      // 4 cicli PUT + rilettura in piu' (~12-15s dai tempi della cattura del 10/09/2026): il margine
      // sarebbe diventato negativo e i casi lenti sarebbero morti in timeout. Alzato a 280s (il pacchetto esclusivo aggiunge fino a ~27s).
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 280000); // pacchetto esclusivo: fino a ~27s in piu' sul caso lento (~225s); il frontend attende 390s
      const r = await fetch(ALLIANZ + '/premio?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok) {
        const msg = (d && d.error) || 'Allianz Motor non ha restituito un premio.';
        jobsAllianz.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { risposta: d, errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
        return;
      }
      // Stessa mappatura del sincrono /allianz-auto: la risposta dello scraper diventa "premio".
      const esito_id = await esito(req, Object.assign(base, { prodotto: d.pacchetto || null, risposta: d, premio: d.premio_annuale, durata_ms: Date.now() - t0 }));
      jobsAllianz.set(jobId, { status: 'done', premio: d, esito_id, t: Date.now() });
    } catch (e) {
      const msg = 'Allianz non raggiungibile o timeout: ' + e.message;
      jobsAllianz.set(jobId, { status: 'error', error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })), t: Date.now() });
    }
  })();
  res.json({ ok: true, jobId });
});
motoRouter.get('/preventivoAllianz/status/:jobId', (req, res) => {
  const j = jobsAllianz.get(req.params.jobId);
  if (!j) return res.status(404).json({ status: 'unknown', error: 'Job non trovato (scaduto?).' });
  res.json(j);
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
  const t0 = Date.now();
  const base = { linea: 'auto', compagnia: 'Italiana Assicurazioni', targa: b.targa, richiesta: b, fonte: 'pagina' };
  let esito_id = null;
  // ── Italiana (Plurima) ──
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 150000);
    const r = await fetch(ITALIANA + '/preventivo?' + q.toString(), { signal: ctrl.signal });
    clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    esito_id = await esito(req, Object.assign(base, { risposta: d, premio: d && d.ok ? d.premio : null, errore: d && d.ok ? null : ((d && d.error) || 'Italiana senza premio'), durata_ms: Date.now() - t0 }));
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
    esito_id = await esito(req, Object.assign(base, { errore: 'non raggiungibile: ' + e.message, durata_ms: Date.now() - t0 }));
  }
  if (risultati[0]) risultati[0].esito_id = esito_id;
  // ── (Le prossime compagnie — es. 24H per moto — si aggiungono qui con la stessa struttura) ──
  res.json({ ok: risultati.some(x => x.annuale && x.annuale.totale), recuperato, risultati, esito_id });
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
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 120000);
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
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 120000);
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
  const t0 = Date.now();
  const base = { linea: 'auto', compagnia: 'Italiana Assicurazioni', targa, richiesta: req.query, fonte: 'pagina' };
  /* VOLTURA SENZA CONTRAENTE: il portale non ce la fa, e ci mette un minuto a
     dirlo. Nel rinnovo l'anagrafica arriva dall'attestato; nella voltura no, e
     senza codice fiscale il wizard Plurima si ferma allo step «Anagrafiche»
     con «Errore creazione preventivo: anagrafica mancante» — cognome, nome e
     indirizzo di contraente e proprietario tutti vuoti. Visto la sera
     dell'11/09/2026 sul primo preventivo vero: 60 secondi di attesa per un
     errore deciso in partenza.
     Si ferma qui, subito, con un messaggio che dice cosa fare. Vale anche il
     bersani: è l'altro caso in cui il contraente non arriva dall'attestato. */
  const serveContraente = /voltura|bersani|nuova immatricolazione/i.test(situazione) || !!bersani;
  if (serveContraente && !cf) {
    const msg = 'Per la ' + (bersani ? 'Legge Bersani' : situazione) +
      ', Italiana chiede i dati del contraente: apri lo step Contraente, compila codice fiscale e indirizzo, poi ricalcola. Senza, il portale si ferma allo step Anagrafiche e il preventivo non esce.';
    return res.status(400).json({
      error: msg, avviso: msg, errore_portale: true,
      esito_id: await esito(req, Object.assign({}, base, { esito: 'non_quotabile', errore: msg, durata_ms: Date.now() - t0 })),
    });
  }
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
      const esito_id = await esito(req, Object.assign(base, { risposta: d, errore: (d && (d.avviso || d.error)) || 'Il portale non ha restituito un premio valido.', durata_ms: Date.now() - t0 }));
      // messaggio utile: PRIMA l'avviso reale del portale (es. "veicolo già assicurato", "residenza
      // mancante") se lo scraper lo restituisce, poi le ultime righe di log. Inoltro anche avviso/
      // errore_portale/campiVuoti/prevDump (già prodotti dallo scraper) per la diagnosi.
      const tail = Array.isArray(d && d.log) ? d.log.slice(-8).join(' · ') : '';
      const msg = (d && (d.avviso || d.error)) || (tail ? 'Premio non calcolato dal portale: ' + tail : 'Il portale non ha restituito un premio valido (riprova).');
      return res.status(502).json({ error: msg, avviso: d && d.avviso, errore_portale: d && d.errore_portale, campiVuoti: d && d.campiVuoti, prevDump: d && d.prevDump, premio: d && d.premio, log: d && d.log, esito_id });
    }
    const esito_id = await esito(req, Object.assign(base, { prodotto: d.premio && d.premio.prodotto || null, risposta: d, premio: d.premio && d.premio.premio_annuale, durata_ms: Date.now() - t0 }));
    res.json({ ok: true, premio: d.premio || null, esito_id });
  } catch (e) {
    const msg = 'Italiana non raggiungibile o timeout: ' + e.message;
    res.status(504).json({ error: msg, esito_id: await esito(req, Object.assign(base, { errore: msg, durata_ms: Date.now() - t0 })) });
  }
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
