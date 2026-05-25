/**
 * routes/admin.js
 * Tutti gli endpoint richiedono ruolo admin.
 *
 * GET    /api/v1/admin/stats
 * GET    /api/v1/admin/users
 * POST   /api/v1/admin/users
 * PUT    /api/v1/admin/users/:id
 * DELETE /api/v1/admin/users/:id
 * GET    /api/v1/admin/credentials/:provider
 * PUT    /api/v1/admin/credentials/:provider
 */
import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/errorHandler.js';
import {
  listUsers, createUser, updateUser, deleteUser,
  getProviderCredentials, setProviderCredentials,
  getDashboardStats,
} from '../services/adminService.js';

const router = Router();

// Tutti gli endpoint admin richiedono ruolo admin
router.use(authenticate, requireRole('admin'));

// ── GET /stats ────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    res.json(await getDashboardStats());
  } catch (err) { next(err); }
});

// ── GET /users ────────────────────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    res.json(await listUsers());
  } catch (err) { next(err); }
});

// ── POST /users ───────────────────────────────────────────────────────────────
router.post('/users',
  body('name').notEmpty().withMessage('Nome obbligatorio.'),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password: minimo 8 caratteri.'),
  body('role').optional().isIn(['admin', 'collaboratore']),
  validateRequest,
  async (req, res, next) => {
    try {
      const user = await createUser(req.body);
      res.status(201).json(user);
    } catch (err) { next(err); }
  }
);

// ── PUT /users/:id ────────────────────────────────────────────────────────────
router.put('/users/:id',
  param('id').isUUID(),
  body('name').optional().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'collaboratore']),
  body('active').optional().isBoolean(),
  validateRequest,
  async (req, res, next) => {
    try {
      const user = await updateUser(req.params.id, req.body);
      res.json(user);
    } catch (err) { next(err); }
  }
);

// ── DELETE /users/:id ─────────────────────────────────────────────────────────
router.delete('/users/:id',
  param('id').isUUID(),
  validateRequest,
  async (req, res, next) => {
    try {
      const deleted = await deleteUser(req.params.id, req.user.id);
      res.json({ message: `Utente ${deleted.email} eliminato.` });
    } catch (err) { next(err); }
  }
);

// ── GET /credentials/:provider ────────────────────────────────────────────────
router.get('/credentials/:provider', async (req, res, next) => {
  try {
    const creds = await getProviderCredentials(req.params.provider);
    if (!creds) return res.status(404).json({ error: 'Credenziali non configurate.' });
    res.json(creds); // Restituisce solo metadati, MAI la password
  } catch (err) { next(err); }
});

// ── PUT /credentials/:provider ────────────────────────────────────────────────
router.put('/credentials/:provider',
  body('username').notEmpty().withMessage('Username obbligatorio.'),
  body('password').notEmpty().withMessage('Password obbligatoria.'),
  body('codiceAgente').optional(),
  validateRequest,
  async (req, res, next) => {
    try {
      const result = await setProviderCredentials(
        { provider: req.params.provider, ...req.body },
        req.user.id
      );
      res.json(result);
    } catch (err) { next(err); }
  }
);

export default router;
