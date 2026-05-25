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

app.get('/api/v1/auth/me', auth, (req, res) => {
  res.json(req.user);
});

app.get('/api/v1/quotes', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const r = isAdmin
      ? await pool.query('SELECT q.*, u.name as operatore FROM quotes q JOIN users u ON u.id = q.user_id ORDER BY q.requested_at DESC LIMIT 50')
      : await pool.query('SELECT q.*, u.name as operatore FROM quotes q JOIN users u ON u.id = q.user_id WHERE q.user_id = $1 ORDER BY q.requested_at DESC LIMIT 50', [req.user.id]);
    res.json({ quotes: r.rows, total: r.rows.length });
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

app.get('/api/v1/admin/stats', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accesso negato.' });
  try {
    const today = await pool.query('SELECT COUNT(*) FROM quotes WHERE requested_at >= CURRENT_DATE');
    const total = await pool.query('SELECT COUNT(*) FROM quotes');
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

app.get('/api/v1/admin/users', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accesso negato.' });
  try {
    const r = await pool.query('SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/admin/users', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accesso negato.' });
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

export default app;
