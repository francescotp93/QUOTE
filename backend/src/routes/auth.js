/**
 * middleware/auth.js
 * Verifica il JWT Bearer token e inietta req.user.
 * Esporta anche requireRole() per controllo ruoli.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';

/**
 * Middleware autenticazione.
 * Aggiunge req.user = { id, email, role, name } se il token è valido.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token mancante o malformato.' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = payload;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Token scaduto. Effettua di nuovo il login.'
      : 'Token non valido.';
    return res.status(401).json({ error: msg });
  }
}

/**
 * Middleware controllo ruolo.
 * Uso: router.get('/admin/...', authenticate, requireRole('admin'), handler)
 *
 * @param {...string} roles - Ruoli ammessi, es: requireRole('admin') o requireRole('admin','collaboratore')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non autenticato.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Accesso negato. Ruolo richiesto: ${roles.join(' o ')}.`,
      });
    }
    next();
  };
}

/**
 * Middleware opzionale: carica i dati freschi dell'utente dal DB.
 * Utile per verificare che l'account sia ancora attivo.
 */
export async function loadUser(req, res, next) {
  try {
    const result = await query(
      'SELECT id, name, email, role, active FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows.length || !result.rows[0].active) {
      return res.status(401).json({ error: 'Account disattivato o non trovato.' });
    }
    req.user = { ...req.user, ...result.rows[0] };
    next();
  } catch (err) {
    next(err);
  }
}
