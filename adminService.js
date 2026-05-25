/**
 * services/adminService.js
 * Gestione utenti e credenziali provider (solo admin).
 */
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import logger from '../config/logger.js';

// ── Gestione utenti ──────────────────────────────────────────────────────────

export async function listUsers() {
  const result = await query(
    `SELECT id, name, email, role, active, created_at
     FROM users ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function createUser({ name, email, password, role = 'collaboratore' }) {
  if (!['admin', 'collaboratore'].includes(role)) {
    throw Object.assign(new Error('Ruolo non valido.'), { status: 400 });
  }
  if (password.length < 8) {
    throw Object.assign(new Error('Password troppo corta (min 8 caratteri).'), { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at`,
    [name, email.toLowerCase().trim(), hash, role]
  );

  logger.info('Nuovo utente creato:', { email, role });
  return result.rows[0];
}

export async function updateUser(userId, { name, email, role, active }) {
  const fields = [];
  const values = [];
  let i = 1;

  if (name  !== undefined) { fields.push(`name = $${i++}`);   values.push(name); }
  if (email !== undefined) { fields.push(`email = $${i++}`);  values.push(email.toLowerCase().trim()); }
  if (role  !== undefined) {
    if (!['admin', 'collaboratore'].includes(role)) {
      throw Object.assign(new Error('Ruolo non valido.'), { status: 400 });
    }
    fields.push(`role = $${i++}`); values.push(role);
  }
  if (active !== undefined) { fields.push(`active = $${i++}`); values.push(active); }

  if (!fields.length) throw Object.assign(new Error('Nessun campo da aggiornare.'), { status: 400 });

  values.push(userId);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, name, email, role, active`,
    values
  );
  if (!result.rows.length) throw Object.assign(new Error('Utente non trovato.'), { status: 404 });

  logger.info('Utente aggiornato:', { userId, fields: fields.map(f => f.split('=')[0].trim()) });
  return result.rows[0];
}

export async function deleteUser(userId, requestingAdminId) {
  if (userId === requestingAdminId) {
    throw Object.assign(new Error('Non puoi eliminare il tuo stesso account.'), { status: 400 });
  }
  const result = await query('DELETE FROM users WHERE id = $1 RETURNING id, email', [userId]);
  if (!result.rows.length) throw Object.assign(new Error('Utente non trovato.'), { status: 404 });
  logger.info('Utente eliminato:', result.rows[0]);
  return result.rows[0];
}

// ── Credenziali provider ─────────────────────────────────────────────────────
// Nota: in produzione usare una vera libreria di cifratura (es. node-forge o KMS).
// Qui usiamo un encoding base64 invertibile come placeholder.
// SOSTITUIRE con AES-256-GCM prima del go-live.

function encodeCredential(text) {
  return Buffer.from(text).toString('base64');
}
function decodeCredential(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

export async function getProviderCredentials(provider = '24hassistance') {
  const result = await query(
    'SELECT provider, codice_agente, updated_at FROM provider_credentials WHERE provider = $1',
    [provider]
  );
  if (!result.rows.length) return null;
  // Non restituisce le credenziali in chiaro — solo metadati
  return {
    provider:     result.rows[0].provider,
    codiceAgente: result.rows[0].codice_agente,
    updatedAt:    result.rows[0].updated_at,
    configured:   true,
  };
}

export async function setProviderCredentials({ provider = '24hassistance', username, password, codiceAgente }, adminId) {
  const usernameEnc = encodeCredential(username);
  const passwordEnc = encodeCredential(password);

  await query(
    `INSERT INTO provider_credentials (provider, username_enc, password_enc, codice_agente, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider) DO UPDATE SET
       username_enc = EXCLUDED.username_enc,
       password_enc = EXCLUDED.password_enc,
       codice_agente = EXCLUDED.codice_agente,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [provider, usernameEnc, passwordEnc, codiceAgente || null, adminId]
  );

  logger.info('Credenziali provider aggiornate:', { provider, adminId });
  return { provider, configured: true, updatedAt: new Date() };
}

/**
 * Recupera le credenziali in chiaro — chiamata SOLO dal scraper service.
 * Non esporre mai via API.
 */
export async function getPlaintextCredentials(provider = '24hassistance') {
  const result = await query(
    'SELECT username_enc, password_enc FROM provider_credentials WHERE provider = $1',
    [provider]
  );
  if (!result.rows.length) return null;
  return {
    username: decodeCredential(result.rows[0].username_enc),
    password: decodeCredential(result.rows[0].password_enc),
  };
}

// ── Statistiche dashboard admin ──────────────────────────────────────────────
export async function getDashboardStats() {
  const [todayRes, totalRes, usersRes, categoryRes] = await Promise.all([
    query(`SELECT COUNT(*) FROM quotes WHERE requested_at >= CURRENT_DATE`),
    query(`SELECT COUNT(*) FROM quotes`),
    query(`SELECT COUNT(*) FROM users WHERE active = true`),
    query(`SELECT vehicle_category, COUNT(*) as count FROM quotes GROUP BY vehicle_category`),
  ]);

  return {
    quotesToday:   parseInt(todayRes.rows[0].count),
    quotesTotal:   parseInt(totalRes.rows[0].count),
    activeUsers:   parseInt(usersRes.rows[0].count),
    byCategory:    Object.fromEntries(
      categoryRes.rows.map(r => [r.vehicle_category, parseInt(r.count)])
    ),
  };
}
