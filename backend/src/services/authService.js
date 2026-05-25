/**
 * services/authService.js
 * Business logic autenticazione: login, token, logout, cambio password.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Genera un JWT access token.
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    env.jwtSecret,
    { expiresIn: env.jwtExpiry }
  );
}

/**
 * Login: verifica credenziali e restituisce token + dati utente.
 * @param {string} email
 * @param {string} password
 * @param {{ ip?: string, userAgent?: string }} meta
 */
export async function loginUser(email, password, meta = {}) {
  // 1. Trova utente
  const result = await query(
    'SELECT id, name, email, role, password_hash, active FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  const user = result.rows[0];

  // Timing-safe: verifica hash anche se utente non esiste (previene timing attacks)
  const dummyHash = '$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const hashToCheck = user?.password_hash || dummyHash;
  const passwordOk = await bcrypt.compare(password, hashToCheck);

  if (!user || !passwordOk) {
    logger.warn('Tentativo login fallito:', { email, ip: meta.ip });
    throw Object.assign(new Error('Credenziali non valide.'), { status: 401 });
  }

  if (!user.active) {
    throw Object.assign(new Error('Account disattivato. Contatta l\'amministratore.'), { status: 403 });
  }

  // 2. Genera token
  const token = generateToken(user);

  // 3. Salva sessione (hash del token per revoca)
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // 24h

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, tokenHash, expiresAt, meta.ip || null, meta.userAgent || null]
  );

  logger.info('Login riuscito:', { email: user.email, role: user.role, ip: meta.ip });

  return {
    token,
    expiresIn: env.jwtExpiry,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

/**
 * Logout: invalida la sessione rimuovendo il token dal DB.
 * @param {string} token — Token JWT grezzo dall'header Authorization
 */
export async function logoutUser(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  logger.info('Logout: sessione rimossa.');
}

/**
 * Cambia la password di un utente.
 * @param {string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 */
export async function changePassword(userId, currentPassword, newPassword) {
  const result = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );
  if (!result.rows.length) throw Object.assign(new Error('Utente non trovato.'), { status: 404 });

  const ok = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!ok) throw Object.assign(new Error('Password attuale non corretta.'), { status: 401 });

  if (newPassword.length < 8) {
    throw Object.assign(new Error('La nuova password deve essere di almeno 8 caratteri.'), { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

  // Invalida tutte le sessioni esistenti (forza re-login su tutti i dispositivi)
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  logger.info('Password cambiata, sessioni invalidate.', { userId });
}

/**
 * Pulizia sessioni scadute (chiamare periodicamente, es. ogni ora).
 */
export async function cleanExpiredSessions() {
  const result = await query('DELETE FROM sessions WHERE expires_at < NOW()');
  if (result.rowCount > 0) {
    logger.info(`Sessioni scadute rimosse: ${result.rowCount}`);
  }
}
