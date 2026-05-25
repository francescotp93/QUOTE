/**
 * routes/quotes.js
 * POST /api/v1/quotes/rc-moto       — Calcola preventivo
 * GET  /api/v1/quotes                — Storico (filtrato per ruolo)
 * GET  /api/v1/quotes/:id            — Dettaglio preventivo
 * POST /api/v1/quotes/notify         — Registra email "avvisami"
 */
import { Router } from 'express';
import { body, query as qv, param } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { createMotoQuote, getQuoteHistory, getQuoteById } from '../services/quoteService.js';
import { query } from '../config/db.js';

const router = Router();

// Tutti gli endpoint richiedono autenticazione
router.use(authenticate);

// ── POST /rc-moto ─────────────────────────────────────────────────────────────
router.post('/rc-moto',
  requireRole('admin', 'collaboratore'),
  body('dataNascita')
    .notEmpty().withMessage('Data di nascita obbligatoria.')
    .isISO8601().withMessage('Formato data: YYYY-MM-DD.')
    .custom(val => {
      const age = (Date.now() - new Date(val)) / (365.25 * 24 * 3600 * 1000);
      if (age < 14 || age > 110) throw new Error('Età non plausibile.');
      return true;
    }),
  body('targa')
    .notEmpty().withMessage('Targa obbligatoria.')
    .isLength({ min: 5, max: 8 }).withMessage('Targa non valida (5-8 caratteri).')
    .matches(/^[A-Za-z0-9]+$/).withMessage('Targa: solo lettere e numeri.'),
  validateRequest,
  async (req, res, next) => {
    try {
      const result = await createMotoQuote(
        { dataNascita: req.body.dataNascita, targa: req.body.targa },
        req.user
      );
      res.status(201).json(result);
    } catch (err) { next(err); }
  }
);

// ── GET / (storico) ──────────────────────────────────────────────────────────
router.get('/',
  qv('page').optional().isInt({ min: 1 }).toInt(),
  qv('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  qv('category').optional().isIn(['moto', 'auto', 'ciclo', 'truck']),
  validateRequest,
  async (req, res, next) => {
    try {
      const result = await getQuoteHistory({
        userId:   req.user.id,
        role:     req.user.role,
        page:     req.query.page  || 1,
        limit:    req.query.limit || 20,
        category: req.query.category,
      });
      res.json(result);
    } catch (err) { next(err); }
  }
);

// ── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id',
  param('id').isUUID().withMessage('ID non valido.'),
  validateRequest,
  async (req, res, next) => {
    try {
      const quote = await getQuoteById(req.params.id, req.user);
      res.json(quote);
    } catch (err) { next(err); }
  }
);

// ── POST /notify (senza autenticazione — endpoint pubblico) ──────────────────
router.post('/notify',
  body('email').isEmail().normalizeEmail(),
  body('category').isIn(['auto', 'ciclo', 'truck']).withMessage('Categoria non valida.'),
  validateRequest,
  async (req, res, next) => {
    try {
      await query(
        `INSERT INTO notify_requests (email, category) VALUES ($1, $2)
         ON CONFLICT (email, category) DO NOTHING`,
        [req.body.email, req.body.category]
      );
      res.json({ message: 'Iscritto! Ti avviseremo appena il modulo sarà attivo.' });
    } catch (err) { next(err); }
  }
);

export default router;
