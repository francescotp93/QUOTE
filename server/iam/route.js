/**
 * Router IAM — Contabilità (montato in server/index.js sotto requireAuth).
 *   GET  /iam/piano-conti          -> piano dei conti (con i flag/natura)
 *   GET  /iam/causali              -> causali con le righe template Dare/Avere
 *   POST /iam/movimenti            -> registra un movimento da causale (prima nota)
 *                                    body: { causaleCodice, importo, dataMovimento, descrizione?, documento? }
 *   GET  /iam/movimenti?data=YYYY-MM-DD  -> elenco movimenti (con righe)
 *   GET  /iam/quadratura?data=YYYY-MM-DD -> saldi finanziario/economico/direzione
 *
 * ⚠️ Richiede la migrazione supabase/iam_contabilita.sql applicata.
 */
import { Router } from 'express';
import { getPianoConti, getCausali, listMovimenti, registraMovimento, getQuadratura, registraIncasso, listSospesi, creaSospeso, incassaSospeso, estrattoContoCompagnia, contabilizzaTitoli } from './contabilita.js';

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

// Incasso premio -> prima nota (ponte portafoglio/SSF -> contabilità)
iamRouter.post('/incassi', async (req, res) => {
  try {
    const { lordo, provvigioni, mezzoPag, dataMovimento, descrizione, numeroPolizza, saldoCompagnia } = req.body || {};
    const out = await registraIncasso({ lordo, provvigioni, mezzoPag, dataMovimento, descrizione, numeroPolizza, saldoCompagnia, creatoDa: req.user && req.user.id });
    res.json({ ok: true, ...out });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Sospesi (scadenzario crediti, non cancellabile)
iamRouter.get('/sospesi', async (req, res) => {
  try { res.json(await listSospesi(req.query.stato)); } catch (e) { res.status(500).json({ error: e.message }); }
});
iamRouter.post('/sospesi', async (req, res) => {
  try { res.json({ ok: true, sospeso: await creaSospeso({ ...req.body, creatoDa: req.user && req.user.id }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
iamRouter.post('/sospesi/:id/incassa', async (req, res) => {
  try { res.json({ ok: true, ...(await incassaSospeso({ id: req.params.id, ...req.body, creatoDa: req.user && req.user.id })) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Estratto conto verso compagnia (saldo da versare nel periodo)
iamRouter.get('/estratto-conto', async (req, res) => {
  try { res.json(await estrattoContoCompagnia({ dal: req.query.dal, al: req.query.al })); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Contabilizza automaticamente i titoli incassati importati via SSF (idempotente)
iamRouter.post('/contabilizza-flusso', async (req, res) => {
  try { res.json({ ok: true, ...(await contabilizzaTitoli({ creatoDa: req.user && req.user.id })) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
