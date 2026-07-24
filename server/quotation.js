// Orchestratore preventivo multi-compagnia — M4 + recupero dati (M3) del piano di integrazione
// (vedi Progetto: claude/piano-integrazione-motor-quoto.md).
//
// Da un "clientinfo" unificato: (1) RECUPERA veicolo + situazione (provenienza/CU) dall'hub
// del ramo (oggi Italiana), poi (2) fa il FAN-OUT in parallelo su tutte le NOSTRE compagnie
// (registry server/companies.js), normalizza ogni risposta in PremioNorm (server/premio-norm.js)
// e ritorna prezzi confrontabili + i dati recuperati, con risultati PROGRESSIVI (start + polling).
// Come Kube/Quotiamo: prima recupera, poi quota.
//
// ADDITIVO: nuovo router montato su /moto accanto a motoRouter; NON modifica moto.js.

import { Router } from 'express';
import { companiesForRamo, hubForRamo } from './companies.js';
import { normalize } from './premio-norm.js';

export const quotationRouter = Router();

const up = (v) => (v == null ? '' : String(v).toUpperCase().trim());
const s = (v) => (v == null ? '' : String(v).trim());

// Traduce il clientinfo unificato nei query params dello scraper di UNA compagnia.
export function buildParams(company, input) {
  const p = new URLSearchParams();
  const set = (k, v) => { const x = s(v); if (x) p.set(k, x); };
  const targa = up(input.targa);
  const nascita = s(input.nascita);
  const garanzie = Array.isArray(input.garanzie) ? input.garanzie.filter(Boolean).join(',') : s(input.garanzie);
  const res = input.residenza && typeof input.residenza === 'object' ? input.residenza : {};
  const prov = s(input.prov || res.prov);
  const comune = s(input.comune || res.comune);
  const cap = s(input.cap || res.cap);
  const via = s(input.indirizzo || input.via || res.indirizzo || res.via);
  const civico = s(input.civico || res.civico);
  const polizza = () => { set('tipoGuida', input.tipoGuida); set('massimale', input.massimale); set('frazionamento', input.frazionamento); };

  switch (company.id) {
    case 'italiana':
      set('targa', targa); set('situazione', input.situazione || 'Rinnovo');
      if (company.capabilities.bersani) set('bersani', up(input.bersani));
      polizza(); set('garanzie', garanzie); set('cf', up(input.cf)); set('indirizzo', via);
      break;
    case 'hdi':
      set('targa', targa); set('nascita', nascita); set('linea', input.tipo || 'auto');
      polizza(); set('garanzie', garanzie);
      set('prov', prov); set('comune', comune); set('cap', cap); set('via', via); set('civ', civico);
      break;
    case 'allianz':
      set('targa', targa); set('nascita', nascita); set('tipo', input.tipo || 'auto');
      polizza(); set('garanzie', garanzie);
      if (company.capabilities.bersani) set('bersani', up(input.bersani));
      break;
    case 'groupama':
      set('targa', targa); polizza();
      break;
    case 'axa':
      set('targa', targa); set('cf', up(input.cf));
      set('cognome', input.cognome); set('nome', input.nome);
      set('data_nascita', nascita); set('data_acquisto', input.data_acquisto); polizza();
      break;
    case 'moto24h':
      set('targa', targa); set('nascita', nascita); set('cf', up(input.cf)); set('comune', comune);
      set('se', input.se); set('rivalsa', input.rivalsa); set('garanzie', garanzie);
      break;
    default:
      set('targa', targa); set('nascita', nascita);
  }
  return p;
}

// Interroga lo scraper di una compagnia -> PremioNorm, con ripiego (HDI /premio-motor -> /premio).
async function quoteCompany(company, input, timeoutMs = 210000) {
  const base = company.scraper();
  const qs = buildParams(company, input).toString();
  const call = async (path) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try { const r = await fetch(base + path + '?' + qs, { signal: ctrl.signal }); return await r.json().catch(() => ({})); }
    finally { clearTimeout(to); }
  };
  try {
    let norm = normalize(company.id, await call(company.endpoints.premio));
    if (norm.errore && company.endpoints.premioBrowser) {
      const norm2 = normalize(company.id, await call(company.endpoints.premioBrowser));
      if (!norm2.errore) norm = norm2;
    }
    return norm;
  } catch (e) { return normalize(company.id, { ok: false, error: 'non raggiungibile: ' + e.message }); }
}

// Recupero dati dall'hub del ramo (oggi Italiana /hubveicolo): veicolo + situazione
// assicurativa (provenienza/CU) + proprietario/contraente. Non blocca il fan-out.
async function recuperaDaHub(ramo, input, timeoutMs = 120000) {
  const hub = hubForRamo(ramo);
  if (!hub || !hub.endpoints.veicolo) return null;
  const q = new URLSearchParams({ targa: up(input.targa), situazione: input.situazione || 'Rinnovo' });
  if (up(input.bersani)) q.set('bersani', up(input.bersani));
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(hub.scraper() + hub.endpoints.veicolo + '?' + q.toString(), { signal: ctrl.signal });
    const d = await r.json().catch(() => ({}));
    if (!d || !d.ok) return { fonte: hub.nome, errore: (d && d.error) || 'recupero non riuscito' };
    return {
      fonte: hub.nome,
      veicolo: d.veicolo || null,
      prodotto: d.prodotto || null,
      situazione_assicurativa: d.situazione_assicurativa || null,
      proprietario: d.proprietario || null,
      contraente: d.contraente || null,
      data_scadenza_polizza: d.data_scadenza_polizza || null,
      garanzie_predefinite: d.garanzie_predefinite || null,
    };
  } catch (e) { return { fonte: hub.nome, errore: 'hub non raggiungibile: ' + e.message }; }
  finally { clearTimeout(to); }
}

// ── Job in background: recupero (non bloccante) + fan-out parallelo + risultati PROGRESSIVI ──
const jobs = new Map();
const TTL = 15 * 60 * 1000;

quotationRouter.post('/quotation/start', (req, res) => {
  const input = req.body || {};
  const ramo = s(input.ramo || input.tipo || 'auto').toLowerCase();
  if (!input.targa) return res.status(400).json({ error: 'Targa obbligatoria.' });
  const companies = companiesForRamo(ramo);
  if (!companies.length) return res.status(400).json({ error: 'Nessuna compagnia configurata per il ramo: ' + ramo });

  const jobId = 'Q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const job = { status: 'pending', ramo, total: companies.length, done: 0, prices: [], recuperato: null, t: Date.now() };
  jobs.set(jobId, job);
  for (const [k, v] of jobs) if (Date.now() - v.t > TTL) jobs.delete(k);

  // (1) recupero dati dall'hub, in parallelo e non bloccante
  if (input.recupera !== false) {
    recuperaDaHub(ramo, input).then((rec) => { job.recuperato = rec; job.t = Date.now(); }).catch(() => {});
  }
  // (2) fan-out sulle compagnie
  companies.forEach((c) => {
    quoteCompany(c, input)
      .then((norm) => { job.prices.push(norm); })
      .catch((e) => { job.prices.push(normalize(c.id, { ok: false, error: e.message })); })
      .finally(() => { job.done += 1; if (job.done >= job.total) job.status = 'done'; job.t = Date.now(); });
  });

  res.json({ ok: true, jobId, ramo, total: companies.length, compagnie: companies.map((c) => c.nome) });
});

quotationRouter.get('/quotation/status/:jobId', (req, res) => {
  const j = jobs.get(req.params.jobId);
  if (!j) return res.status(404).json({ status: 'unknown', error: 'Job non trovato (scaduto?).' });
  const prices = [...j.prices].sort((a, b) => {
    const pa = a.annuale && a.annuale.totale;
    const pb = b.annuale && b.annuale.totale;
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });
  res.json({ status: j.status, ramo: j.ramo, done: j.done, total: j.total, recuperato: j.recuperato, prices });
});

export default quotationRouter;
