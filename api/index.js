import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SECRET = process.env.JWT_SECRET || 'quote_secret';

// Crea la tabella dei preventivi Infortuni se non esiste (multi-prodotto QUOTO).
let infortuniReady = false;
async function ensureInfortuniTable() {
  if (infortuniReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS infortuni_quotes (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID        NOT NULL REFERENCES users(id),
      data_nascita      DATE        NOT NULL,
      tipologia_lavoro  TEXT        NOT NULL,
      no_sinistri_5anni BOOLEAN     NOT NULL DEFAULT true,
      status            TEXT        NOT NULL DEFAULT 'pending',
      requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  infortuniReady = true;
}

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Credenziali non valide.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenziali non valide.' });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function auth(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Token mancante.' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accesso negato.' });
  next();
}

app.get('/api/v1/auth/me', auth, (req, res) => res.json(req.user));

app.get('/api/v1/quotes', auth, async (req, res) => {
  try {
    await ensureInfortuniTable();
    const isAdmin = req.user.role === 'admin';
    const userId  = isAdmin ? null : req.user.id;
    // Storico unificato multi-prodotto: RCA veicoli + Infortuni
    const r = await pool.query(
      `SELECT * FROM (
         SELECT q.requested_at,
                COALESCE(q.vehicle_category::text, 'rca') AS product,
                q.targa        AS ref,
                q.premio_annuo AS premio_annuo,
                q.status       AS status,
                u.name         AS operatore,
                q.user_id      AS user_id
           FROM quotes q JOIN users u ON u.id = q.user_id
         UNION ALL
         SELECT i.requested_at,
                'infortuni' AS product,
                to_char(i.data_nascita, 'DD/MM/YYYY') AS ref,
                NULL::numeric AS premio_annuo,
                i.status      AS status,
                u.name        AS operatore,
                i.user_id     AS user_id
           FROM infortuni_quotes i JOIN users u ON u.id = i.user_id
       ) t
       WHERE ($1::uuid IS NULL OR t.user_id = $1)
       ORDER BY t.requested_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json({ quotes: r.rows, total: r.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/quotes/infortuni', auth, async (req, res) => {
  try {
    await ensureInfortuniTable();
    const { dataNascita, tipologiaLavoro, noSinistri5Anni = true } = req.body;
    if (!dataNascita || !tipologiaLavoro) {
      return res.status(400).json({ error: 'Data di nascita e tipologia lavoro obbligatorie.' });
    }
    const r = await pool.query(
      `INSERT INTO infortuni_quotes (user_id, data_nascita, tipologia_lavoro, no_sinistri_5anni, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, requested_at`,
      [req.user.id, dataNascita, tipologiaLavoro, !!noSinistri5Anni]
    );
    res.status(201).json({ id: r.rows[0].id, message: 'Preventivo Infortuni in elaborazione.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/quotes/rc-moto', auth, async (req, res) => {
  try {
    const { dataNascita, targa } = req.body;
    const r = await pool.query(
      'INSERT INTO quotes (user_id, vehicle_category, provider, targa, data_nascita, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, requested_at',
      [req.user.id, 'moto', '24hassistance', targa.toUpperCase(), dataNascita, 'pending']
    );
    res.status(201).json({ id: r.rows[0].id, message: 'Preventivo in elaborazione.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/admin/stats', auth, adminOnly, async (req, res) => {
  try {
    await ensureInfortuniTable();
    const today = await pool.query(
      `SELECT (SELECT COUNT(*) FROM quotes WHERE requested_at >= CURRENT_DATE)
            + (SELECT COUNT(*) FROM infortuni_quotes WHERE requested_at >= CURRENT_DATE) AS count`);
    const total = await pool.query(
      `SELECT (SELECT COUNT(*) FROM quotes)
            + (SELECT COUNT(*) FROM infortuni_quotes) AS count`);
    const users = await pool.query('SELECT COUNT(*) FROM users WHERE active = true');
    res.json({
      quotesToday: parseInt(today.rows[0].count),
      quotesTotal: parseInt(total.rows[0].count),
      activeUsers: parseInt(users.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role = 'collaboratore' } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, hash, role]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/admin/providers', auth, adminOnly, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, provider, login_url, active, updated_at, CASE WHEN username_enc IS NOT NULL THEN true ELSE false END as configured FROM provider_credentials ORDER BY provider');
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/v1/admin/providers/:provider', auth, adminOnly, async (req, res) => {
  try {
    const { login_url, username, password } = req.body;
    const usernameEnc = username ? Buffer.from(username).toString('base64') : null;
    const passwordEnc = password ? Buffer.from(password).toString('base64') : null;
    await pool.query(
      `INSERT INTO provider_credentials (provider, login_url, username_enc, password_enc)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider) DO UPDATE SET
         login_url = COALESCE($2, provider_credentials.login_url),
         username_enc = COALESCE($3, provider_credentials.username_enc),
         password_enc = COALESCE($4, provider_credentials.password_enc),
         updated_at = NOW()`,
      [req.params.provider, login_url || null, usernameEnc, passwordEnc]
    );
    res.json({ success: true, message: 'Credenziali aggiornate.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default app;
