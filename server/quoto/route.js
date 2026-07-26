/**
 * Router QUOTO — Portafoglio (montato in server/index.js sotto requireAuth).
 *   GET /quoto/scadenzario?dal=&al=  -> polizze in scadenza nel periodo (rinnovi)
 *   GET /quoto/mora                  -> polizze scadute ancora attive
 *   GET /quoto/opportunita?copertura=tutela  -> clienti auto senza quella copertura (cross-selling)
 * ⚠️ Richiede quote_polizze applicata.
 */
import { Router } from 'express';
import { scadenzario, inMora, opportunitaCrossSelling } from './portafoglio.js';

export const quotoRouter = Router();

quotoRouter.get('/scadenzario', async (req, res) => {
  try { res.json(await scadenzario({ dal: req.query.dal, al: req.query.al })); } catch (e) { res.status(500).json({ error: e.message }); }
});

quotoRouter.get('/mora', async (req, res) => {
  try { res.json(await inMora()); } catch (e) { res.status(500).json({ error: e.message }); }
});

quotoRouter.get('/opportunita', async (req, res) => {
  try { res.json(await opportunitaCrossSelling(req.query.copertura || 'tutela')); } catch (e) { res.status(500).json({ error: e.message }); }
});
