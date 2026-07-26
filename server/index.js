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
import { leadRouter } from './lead.js';
import { shopRouter, ogRouter } from './shop.js';
import { signRouter, publicSign } from './sign.js';
import { firmaCollabRouter, publicFirmaCollab } from './firmaCollab.js';
import { motoRouter } from './moto.js';
import { fontiRouter, publicFontiRouter } from './fonti.js';
import { backupRouter, startBackupScheduler } from './backup.js';
import { plurimaExploreRouter } from './plurimaExplore.js';
import { crmRouter } from './crm.js';
import { catalogoRouter } from './catalogo.js';
import { preventiviRouter } from './preventivi.js';
import { quotoRouter } from './quoto/route.js';

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
  res.json({ status: 'ok', service: 'withus-backend', version: '0.7.0-italiana', time: new Date().toISOString() });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Diagnostica (apribile dal browser): conferma la versione del codice in esecuzione
//    e la configurazione. NON espone segreti: solo booleani sulla presenza delle chiavi.
app.get('/diag', (req, res) => {
  res.json({
    ok: true,
    version: '0.7.0-italiana',
    routes: ['/fonti (GET/POST)', '/fonti/:id (PUT/DELETE)', '/shop/checkout/bonifico', '/shop/anagrafica', '/sign/*'],
    env: {
      supabase: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      brevo: !!process.env.BREVO_API_KEY,
      stripe: !!process.env.STRIPE_SECRET_KEY,
      paypal: !!process.env.PAYPAL_CLIENT_ID,
    },
    corsOrigins: ALLOWED,
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

// ── CRM · Anagrafiche clienti (solo utenti autenticati) ──────────────
app.use('/crm', requireAuth, crmRouter);
app.use('/catalogo', requireAuth, catalogoRouter);
app.use('/preventivi', requireAuth, preventiviRouter);

// ── QUOTO · Portafoglio (scadenzario/rinnovi + opportunità) ──
app.use('/quoto', requireAuth, quotoRouter);

// ── Shop ──────────────────────────────────────────────────────
app.use('/shop', shopRouter);
app.use('/l', ogRouter);

// ── Firma ────────────────────────────────────────────────────
app.use('/sign', publicSign);
app.use('/sign', requireAuth, signRouter);
app.use('/firma-collab', publicFirmaCollab);
app.use('/firma-collab', requireAuth, firmaCollabRouter);

// ── Comparatore moto ─────────────────────────────────────────
app.use('/moto', requireAuth, motoRouter);

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
