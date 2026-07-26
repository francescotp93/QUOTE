/**
 * Router IAM — Contabilità (montato in server/index.js sotto requireAuth).
 *   GET  /iam/piano-conti          -> piano dei conti (con i flag/natura)
 *   GET  /iam/causali              -> causali con le righe template Dare/Avere
 *   POST /iam/movimenti            -> registra un movimento da causale (prima nota)
 *                                    body: { causaleCodice, importo, dataMovimento, descrizione?, documento? }
 *   GET  /iam/movimenti?data=YYYY-MM-DD  -> elenco movimenti (con righe)
 *   GET  /iam/quadratura?data=YYYY-MM-DD -> saldi finanziario/economico/direzione
 *
 * ⚠️ Richiede la migrazione supabase/im_contabilita.sql applicata.
 */
import { Router } from 'express';
import { getPianoConti, getCausali, listMovimenti, registraMovimento, getQuadratura } from './contabilita.js';

export const iamRouter = Router();

iamRouter.get('/piano-conti', async (req, res) => {
  try { res.json(await getPianoConti()); } catch (e) { res.status(500).json({ error: e.message }); }
});

iamRouter.get('/causali', async (req, res) => {
  try { res.json(await getCausali()); } catch (e) { res.status(500).json({ error: e.message }); }
});

iamRouter.get('/movimenti', async (req, res) => {
  try { res.json(await listMovimenti(req.query.data)); } catch (e) { res.status(500).json({ error: e.message }); }
});

iamRouter.post('/movimenti', async (req, res) => {
  try {
    const { causaleCodice, importo, dataMovimento, dataContabile, descrizione, documento, societa } = req.body || {};
    const out = await registraMovimento({
      causaleCodice, importo, dataMovimento, dataContabile, descrizione, documento, societa,
      creatoDa: req.user && req.user.id,
    });
    res.json({ ok: true, ...out });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

iamRouter.get('/quadratura', async (req, res) => {
  try { res.json(await getQuadratura(req.query.data)); } catch (e) { res.status(500).json({ error: e.message }); }
});
