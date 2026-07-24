// ═══════════════════════════════════════════════════════════════════════════════
//  withus-backend
//  - Mail (IMAP/SMTP Aruba) protetta dal login Supabase delle app IAM/QUOTO
//  - base per i Pagamenti (PayPal/Axerve), in arrivo
//  - Hardening: security headers, rate limiting, guardia job moto (security.js)
// ═══════════════════════════════════════════════════════════════════════════════
import express from 'express';
import cors from 'cors';
import { requireAuth } from './auth.js';
import { publicMail, secureMail } from './mail.js';
import { publicPay, securePay } from './pay.js';
import { notifyRouter } from './notify.js';
import { leadRouter } from './lead.js';
import { shopRouter, ogRouter } from './shop.js';
import { signRouter, publicSign } from './sign.js';
import { firmaCollabRouter, publicFirmaCollab } from './firmaCollab.js';
import { motoRouter } from './moto.js';
import { fontiRouter, publicFontiRouter } from './fonti.js';
import { backupRouter, startBackupScheduler } from './backup.js';
import { plurimaExploreRouter } from './plurimaExplore.js';
import { securityHeaders, rateLimit, createMotoJobGuard } from './security.js';

const app = express();
// Render/Vercel stanno dietro proxy: fidati dell'header X-Forwarded-* per l'IP reale.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: '30mb' }));

// ── CORS: solo i domini delle nostre app ──────────────────────────────────────
const ALLOWED = (process.env.CORS_ORIGINS ||
  'https://iam.withusassicurazioni.it,https://quoto.withusassicurazioni.it,https://www.withusassicurazioni.it'
).split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error('Origin non consentito: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Globale: soglia generosa per non impattare l'uso normale delle app.
app.use(rateLimit({
  windowMs: 60_000,
  max: Number(process.env.RL_GLOBAL_MAX) || 300,
  message: 'Troppe richieste. Riprova tra un minuto.',
}));
// Stretto: endpoint che emettono/verificano OTP (firma), bersaglio di brute force.
const otpLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.RL_OTP_MAX) || 12,
  message: 'Troppi tentativi di firma/OTP. Riprova tra un minuto.',
});
// Guardia di concorrenza per i job di quotazione moto.
const motoJobGuard = createMotoJobGuard({
  maxConcurrent: Number(process.env.MOTO_MAX_CONCURRENT) || 3,
  maxPerUser: Number(process.env.MOTO_MAX_PER_USER) || 1,
});

// ── Stato ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'withus-backend', version: '0.7.1-hardening', time: new Date().toISOString() });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Diagnostica (apribile dal browser): conferma la versione del codice in
//    esecuzione e la presenza (booleana) delle chiavi. NON espone segreti né la
//    lista dei domini CORS.
app.get('/diag', (req, res) => {
  res.json({
    ok: true,
    version: '0.7.1-hardening',
    routes: ['/fonti (GET/POST)', '/fonti/:id (PUT/DELETE)', '/shop/checkout/bonifico', '/shop/anagrafica', '/sign/*'],
    env: {
      supabase: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      brevo: !!process.env.BREVO_API_KEY,
      stripe: !!process.env.STRIPE_SECRET_KEY,
      paypal: !!process.env.PAYPAL_CLIENT_ID,
    },
    corsOriginsCount: ALLOWED.length,
    time: new Date().toISOString(),
  });
});

// ── Mail ──────────────────────────────────────────────────────────────────────
app.use('/mail', publicMail);
app.use('/mail', requireAuth, secureMail);

// ── Pagamenti ───────────────────────────────────────────────────────────────
app.use('/pay', publicPay);
app.use('/pay', requireAuth, securePay);

// ── Notifiche ─────────────────────────────────────────────────────
app.use('/notify', requireAuth, notifyRouter);

// ── Lead ────────────────────────────────────────────────────────
app.use('/lead', leadRouter);

// ── Shop ──────────────────────────────────────────────────────
app.use('/shop', shopRouter);
app.use('/l', ogRouter);

// ── Firma (OTP): rate-limit stretto sulle rotte pubbliche ────────────────────
app.use('/sign', otpLimiter, publicSign);
app.use('/sign', requireAuth, signRouter);
app.use('/firma-collab', otpLimiter, publicFirmaCollab);
app.use('/firma-collab', requireAuth, firmaCollabRouter);

// ── Comparatore moto: guardia di concorrenza job ─────────────────────────────
app.use('/moto', requireAuth, motoJobGuard, motoRouter);

// ── Pannello Fonti (solo Super Admin) ──────────────────────────────
app.use('/fonti', publicFontiRouter);
app.use('/fonti', requireAuth, fontiRouter);

// ── Backup giornaliero (solo Super Admin) ─────────────────────────
app.use('/backup', requireAuth, backupRouter);

// ── EXPLORER TEMPORANEO Plurima (sola lettura, protetto da chiave) — RIMUOVERE dopo l'uso ──
app.use('/plurima-explore', plurimaExploreRouter);

// ── Avvio ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('withus-backend in ascolto sulla porta ' + PORT);
  startBackupScheduler();
});
