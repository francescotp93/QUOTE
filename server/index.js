// ═══════════════════════════════════════════════════════════════════════════════
//  withus-backend
//  - Mail (IMAP/SMTP Aruba) protetta dal login Supabase delle app IAM/QUOTO
//  - base per i Pagamenti (PayPal/Axerve), in arrivo
// ═══════════════════════════════════════════════════════════════════════════════
import express from 'express';
import cors from 'cors';
import { requireAuth } from './auth.js';
import { publicMail, secureMail } from './mail.js';
import { publicPay, securePay } from './pay.js';
import { notifyRouter } from './notify.js';

const app = express();
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

// ── Stato ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'withus-backend', version: '0.2.0', time: new Date().toISOString() });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Mail ──────────────────────────────────────────────────────────────────────
app.use('/mail', publicMail);              // /mail/selftest (collaudo con chiave)
app.use('/mail', requireAuth, secureMail); // /mail/inbox, /mail/message/:uid, /mail/send

// ── Pagamenti ─────────────────────────────────────────────────────────────────
app.use('/pay', publicPay);                // /pay/config (Client ID PayPal)
app.use('/pay', requireAuth, securePay);   // /pay/paypal/create-order, /pay/paypal/capture

// ── Notifiche email automatiche (stati pratica + messaggi) ─────────────────────
app.use('/notify', requireAuth, notifyRouter);

// ── Avvio ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('withus-backend in ascolto sulla porta ' + PORT));
