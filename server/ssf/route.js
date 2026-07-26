/**
 * Router SSF — montato in server/index.js sotto requireAuth (come /crm, /moto).
 *   POST /ssf/parse   { cartella }  -> conteggi del flusso (DRY: nessuna scrittura)
 *   POST /ssf/import  { cartella }  -> upsert idempotente su Quoto/IM
 *
 * `cartella` = nome (non path assoluto) di una sottocartella dell'inbox SSF, che
 * contiene i REC*.csv gia estratti dallo ZIP di compagnia. L'inbox e definita da
 * env SSF_INBOX_DIR (default /tmp/ssf-inbox). Sicurezza: la cartella richiesta
 * viene risolta DENTRO l'inbox (niente path traversal).
 *
 * NB: l'estrazione dello ZIP resta a monte (cron/ops) per non aggiungere dipendenze.
 *     TODO: endpoint di upload multipart + unzip; scheduler ~04:00; staff-gating.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { parseSsfDirectory } from './ssfParser.js';
import { mapModel } from './mapWithus.js';
import { importModel } from './importService.js';
import { generateIncassiFlusso } from './ssfWriter.js';

const INBOX = (process.env.SSF_INBOX_DIR || '/tmp/ssf-inbox');

// Risolve `name` dentro l'inbox; ritorna null se esce dall'inbox o non esiste.
function resolveInbox(name) {
  if (!name || typeof name !== 'string') return null;
  const base = path.resolve(INBOX);
  const dir = path.resolve(base, name);
  if (dir !== base && !dir.startsWith(base + path.sep)) return null; // no traversal
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  return dir;
}

export const ssfRouter = Router();

// Conteggi del flusso, senza scrivere nulla.
ssfRouter.post('/parse', (req, res) => {
  try {
    const dir = resolveInbox(req.body && req.body.cartella);
    if (!dir) return res.status(400).json({ error: 'cartella non valida o inesistente nell\'inbox' });
    const model = parseSsfDirectory(dir);
    res.json({ meta: model.meta, stats: model.stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Import idempotente su Quoto/IM.
ssfRouter.post('/import', async (req, res) => {
  try {
    const dir = resolveInbox(req.body && req.body.cartella);
    if (!dir) return res.status(400).json({ error: 'cartella non valida o inesistente nell\'inbox' });
    const model = parseSsfDirectory(dir);
    const mapped = mapModel(model);
    const imported = await importModel(mapped);
    res.json({ ok: true, meta: model.meta, imported });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// OUTBOUND — genera i CSV SSF (segnalazioni incassi) da inviare alla compagnia.
// Body: { testata:{emittente,intermediario,dal,al}, titoli:[{...,incassi:[...]}] }.
// (I titoli/incassi arriveranno da IM; qui accettati nel body per disaccoppiare.)
ssfRouter.post('/export', (req, res) => {
  try {
    const { testata, titoli } = req.body || {};
    if (!Array.isArray(titoli) || titoli.length === 0) return res.status(400).json({ error: 'titoli mancanti' });
    const files = generateIncassiFlusso({ testata: testata || {}, titoli });
    res.json({ ok: true, files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
