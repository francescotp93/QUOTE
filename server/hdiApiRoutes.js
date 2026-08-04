// ── HDI · Partner API · le rotte del backend ─────────────────────────────────
//  La logica sta in hdiApi.js, che non importa express: qui c'e' solo il modo
//  di chiamarla da fuori. Montato in server/index.js sotto requireAuth.
import { Router } from 'express';
import { hdiConfigurato, hdiAmbiente, hdiDatiVeicolo, hdiBase, hdiClientIdCorto, hdiHaToken } from './hdiApi.js';

export const hdiApiRouter = Router();

/* Lo stato si puo' chiedere anche senza credenziali: e' il modo di sapere se il
   collegamento e' acceso senza doverlo provare a mano. Del client id esce solo
   l'inizio, e del segreto niente. */
hdiApiRouter.get('/stato', (req, res) => {
  res.json({
    configurato: hdiConfigurato(),
    ambiente: hdiAmbiente(),
    base: hdiBase(),
    clientId: hdiClientIdCorto(),
    tokenInMemoria: hdiHaToken(),
  });
});

/* Dati veicolo da targa: la piu' innocua delle 169 rotte, e quella che oggi
   facciamo con lo scraper. Serve a confrontare i due. */
hdiApiRouter.get('/veicolo', async (req, res) => {
  try {
    const dati = await hdiDatiVeicolo(req.query.targa);
    res.json({ ok: true, ambiente: hdiAmbiente(), targa: String(req.query.targa || '').toUpperCase(), dati });
  } catch (e) {
    const stato = e.codice === 'NON_CONFIGURATO' ? 503
                : e.codice === 'TARGA_MANCANTE'  ? 400
                : e.codice === 'NON_ABILITATO'   ? 403
                : 502;
    res.status(stato).json({ ok: false, motivo: e.codice || 'ERRORE_HDI', errore: e.message });
  }
});
