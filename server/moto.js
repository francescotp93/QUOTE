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
  const { targa, nascita, se, rivalsa, garanzie } = req.body || {};
  if (!targa || !nascita) return res.status(400).json({ error: 'Targa e data di nascita obbligatorie.' });

  const q = new URLSearchParams({ targa: String(targa).trim(), nascita: String(nascita).trim() });
  if (se != null && se !== '') q.set('se', String(se));
  if (rivalsa) q.set('rivalsa', String(rivalsa));
  if (Array.isArray(garanzie) && garanzie.length) q.set('garanzie', garanzie.join(','));
  else if (typeof garanzie === 'string' && garanzie) q.set('garanzie', garanzie);

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 150000); // lo scraper può metterci ~1 min
    const r = await fetch(SCRAPER + '/quote?' + q.toString(), { signal: ctrl.signal });
    clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) return res.status(502).json({ error: d.error || ('Scraper HTTP ' + r.status) });

    const risultati = [{
      compagnia: d.compagnia || 'Moto Platinum',
      prev: null,
      sconto: null,
      annuale: { totale: d.premio_totale || null, premio_polizza: null, diritti: null },
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
