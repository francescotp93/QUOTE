// ═══════════════════════════════════════════════════════════════════════════════
//  Le rotte delle candidature. Solo il collegamento fra express e la logica,
//  che sta in candidature.js e non conosce express — cosi' le prove possono
//  girarla davvero, senza tirare su un server e senza dipendenze.
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { leggiInformativa, creaCandidatura } from './candidature.js';

export const candidaturePubblico = Router();

candidaturePubblico.get('/informativa', async (req, res) => {
  const { stato, dato } = await leggiInformativa();
  res.status(stato).json(dato);
});

candidaturePubblico.post('/', async (req, res) => {
  const { stato, dato } = await creaCandidatura(req);
  res.status(stato).json(dato);
});
