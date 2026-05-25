/**
 * server.js — Entry point backend QUOTE
 *
 * Avvia il server Express con:
 * - Helmet (security headers)
 * - CORS configurato
 * - Rate limiting per endpoint sensibili
 * - Morgan (HTTP logging)
 * - Routes API v1
 * - Error handler globale
 * - Pulizia periodica sessioni scadute
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { checkDbConnection } from './config/db.js';
import logger from './config/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { cleanExpiredSessions } from './services/authService.js';

import authRoutes   from './routes/auth.js';
import quotesRoutes from './routes/quotes.js';
import adminRoutes  from './routes/admin.js';

const app = express();

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1); // Per rate limit corretto dietro nginx/reverse proxy

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      env.corsOrigin,
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── HTTP logging ──────────────────────────────────────────────────────────────
app.use(morgan(env.isDev ? 'dev' : 'combined', {
  stream: { write: msg => logger.info(msg.trim()) },
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Globale
app.use('/api/', rateLimit({
  windowMs:        env.rateLimitWindow * 60 * 1000,
  max:             env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Troppe richieste. Riprova tra qualche minuto.' },
}));

// Più restrittivo su login (anti brute-force)
app.use('/api/v1/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minuti
  max:      10,                 // max 10 tentativi
  message:  { error: 'Troppi tentativi di login. Riprova tra 15 minuti.' },
}));

// ── Health check (senza autenticazione) ──────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', env: env.nodeEnv, ts: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',   authRoutes);
app.use('/api/v1/quotes', quotesRoutes);
app.use('/api/v1/admin',  adminRoutes);

// ── 404 + Error handler ───────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Avvio server ──────────────────────────────────────────────────────────────
async function start() {
  try {
    await checkDbConnection();

    app.listen(env.port, () => {
      logger.info(`\n🚀  QUOTE Backend avviato`);
      logger.info(`   Porta:       ${env.port}`);
      logger.info(`   Ambiente:    ${env.nodeEnv}`);
      logger.info(`   CORS origin: ${env.corsOrigin}`);
      logger.info(`   API base:    http://localhost:${env.port}/api/v1\n`);
    });

    // Pulizia sessioni scadute ogni ora
    setInterval(cleanExpiredSessions, 60 * 60 * 1000);

  } catch (err) {
    logger.error('Avvio fallito:', err.message);
    process.exit(1);
  }
}

start();

export default app;
