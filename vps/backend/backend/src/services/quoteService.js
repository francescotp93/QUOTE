/**
 * services/quoteService.js
 * Orchestrazione preventivi: chiama lo scraper, salva nel DB, restituisce il risultato.
 */
import { query } from '../config/db.js';
import logger from '../config/logger.js';

// ── Import scraper (path relativo dalla root del monorepo) ──────────────────
// In produzione: pacchetto separato oppure import diretto
let scraperGetQuote;
try {
  const scraper = await import('../../scraper/index.js');
  scraperGetQuote = scraper.getQuote;
} catch {
  logger.warn('Scraper non disponibile — modalità mock attiva.');
  scraperGetQuote = mockGetQuote;
}

/**
 * Calcola un preventivo RC Moto.
 * 1. Chiama lo scraper (o mock in dev)
 * 2. Salva il risultato nel DB
 * 3. Restituisce il preventivo strutturato
 *
 * @param {{ dataNascita: string, targa: string }} params
 * @param {{ id: string, role: string }} requestingUser
 * @returns {Promise<Object>}
 */
export async function createMotoQuote(params, requestingUser) {
  const { dataNascita, targa } = params;
  const targaClean = targa.toUpperCase().replace(/\s/g, '');

  logger.info('Calcolo preventivo RC Moto:', {
    targa: targaClean,
    userId: requestingUser.id,
  });

  let scraperResult = null;
  let status = 'success';
  let errorMessage = null;

  // ── Chiamata scraper ──────────────────────────────────────────────────────
  try {
    scraperResult = await scraperGetQuote({ dataNascita, targa: targaClean });
  } catch (err) {
    logger.error('Scraper fallito:', err.message);
    status = 'error';
    errorMessage = err.message;
    // Non lanciamo eccezione: salviamo il tentativo fallito nel DB
  }

  // ── Salvataggio nel DB ────────────────────────────────────────────────────
  const saved = await query(
    `INSERT INTO quotes (
       user_id, vehicle_category, provider,
       targa, data_nascita,
       veicolo_descrizione, veicolo_alimentazione, veicolo_cilindrata, veicolo_anno_imm,
       cu_classe, cu_merito, sinistri_5anni, scadenza_polizza,
       premio_annuo, premio_rata, massimale_rc,
       garanzie, codice_preventivo, pdf_url, emetti_disponibile,
       status, error_message, raw_response
     ) VALUES (
       $1, 'moto', '24hassistance',
       $2, $3,
       $4, $5, $6, $7,
       $8, $9, $10, $11,
       $12, $13, $14,
       $15, $16, $17, $18,
       $19, $20, $21
     ) RETURNING id, requested_at`,
    [
      requestingUser.id,
      targaClean,
      dataNascita,
      scraperResult?.veicolo?.descrizione     || null,
      scraperResult?.veicolo?.alimentazione   || null,
      scraperResult?.veicolo?.cilindrata      || null,
      scraperResult?.veicolo?.annoImmatricolazione || null,
      scraperResult?.bonusMalus?.classeUniversale  || null,
      scraperResult?.bonusMalus?.classeMerito      || null,
      scraperResult?.bonusMalus?.sinistriUltimi5Anni || null,
      scraperResult?.bonusMalus?.scadenzaPolizzaAttuale || null,
      scraperResult?.premio?.annuo   || null,
      scraperResult?.premio?.rata    || null,
      scraperResult?.premio?.massimaleRC || null,
      scraperResult?.garanzie        || [],
      scraperResult?.codicePreventivo || null,
      scraperResult?.azioni?.pdfUrl  || null,
      scraperResult?.azioni?.emettiDisponibile || false,
      status,
      errorMessage,
      scraperResult ? JSON.stringify(scraperResult._raw) : null,
    ]
  );

  if (status === 'error') {
    throw Object.assign(
      new Error(`Preventivo non disponibile: ${errorMessage}`),
      { status: 502, quoteId: saved.rows[0].id }
    );
  }

  return {
    id:           saved.rows[0].id,
    requestedAt:  saved.rows[0].requested_at,
    targa:        targaClean,
    dataNascita,
    veicolo:      scraperResult.veicolo,
    bonusMalus:   scraperResult.bonusMalus,
    premio:       scraperResult.premio,
    garanzie:     scraperResult.garanzie,
    codicePreventivo: scraperResult.codicePreventivo,
    azioni:       scraperResult.azioni,
  };
}

/**
 * Recupera lo storico preventivi.
 * Admin → tutti. Collaboratore → solo i propri.
 */
export async function getQuoteHistory({ userId, role, page = 1, limit = 20, category }) {
  const offset = (page - 1) * limit;
  const conditions = ['1=1'];
  const values = [];
  let i = 1;

  if (role !== 'admin') {
    conditions.push(`q.user_id = $${i++}`);
    values.push(userId);
  }
  if (category) {
    conditions.push(`q.vehicle_category = $${i++}`);
    values.push(category);
  }

  const where = conditions.join(' AND ');

  const [dataRes, countRes] = await Promise.all([
    query(
      `SELECT
         q.id, q.vehicle_category, q.provider, q.targa, q.data_nascita,
         q.veicolo_descrizione, q.cu_classe, q.sinistri_5anni,
         q.premio_annuo, q.codice_preventivo,
         q.status, q.requested_at,
         u.name AS operatore_name, u.email AS operatore_email
       FROM quotes q
       JOIN users u ON u.id = q.user_id
       WHERE ${where}
       ORDER BY q.requested_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...values, limit, offset]
    ),
    query(
      `SELECT COUNT(*) FROM quotes q WHERE ${where}`,
      values
    ),
  ]);

  return {
    quotes: dataRes.rows,
    total:  parseInt(countRes.rows[0].count),
    page,
    limit,
    pages:  Math.ceil(parseInt(countRes.rows[0].count) / limit),
  };
}

/**
 * Dettaglio singolo preventivo (solo se appartiene all'utente o admin).
 */
export async function getQuoteById(quoteId, requestingUser) {
  const result = await query(
    `SELECT q.*, u.name AS operatore_name
     FROM quotes q JOIN users u ON u.id = q.user_id
     WHERE q.id = $1`,
    [quoteId]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Preventivo non trovato.'), { status: 404 });
  }
  const quote = result.rows[0];
  if (requestingUser.role !== 'admin' && quote.user_id !== requestingUser.id) {
    throw Object.assign(new Error('Accesso negato.'), { status: 403 });
  }
  return quote;
}

// ── Mock scraper (fallback in sviluppo senza 24hassistance) ─────────────────
async function mockGetQuote({ dataNascita, targa }) {
  await new Promise(r => setTimeout(r, 800)); // simula latenza
  const eta = new Date().getFullYear() - new Date(dataNascita).getFullYear();
  const cu  = Math.max(1, Math.min(18, 7 + Math.floor(Math.random() * 4 - 1)));
  const base = 180 + cu * 12 + (eta < 25 ? 80 : eta > 60 ? 40 : 0);
  const premio = +(base + Math.floor(Math.random() * 40)).toFixed(2);
  const veicoli = ['Honda CB500F 2020','Yamaha MT-07 2021','Kawasaki Z650 2019','BMW G310R 2022'];
  return {
    codicePreventivo: `MOCK-${Date.now()}`,
    veicolo: {
      descrizione:   veicoli[Math.floor(Math.random() * veicoli.length)],
      targa:         targa.toUpperCase(),
      alimentazione: 'Benzina',
      cilindrata:    '650 cc',
      annoImmatricolazione: '2020',
    },
    bonusMalus: {
      classeUniversale:   cu,
      classeMerito:       cu,
      sinistriUltimi5Anni: Math.random() > 0.7 ? 1 : 0,
      scadenzaPolizzaAttuale: '31/12/2024',
    },
    premio: {
      annuo:       premio,
      rata:        +(premio / 2 * 1.05).toFixed(2),
      massimaleRC: '6.450.000 €',
    },
    garanzie: ['RCA', 'Assistenza stradale 24h', 'Tutela legale'],
    azioni:   { emettiDisponibile: true, pdfUrl: null },
    _raw:     { mock: true },
  };
}
