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
import { marketingRouter } from './marketing.js';
import { vigilanzaRouter, startFontiWatchdog } from './fontiWatchdog.js';
import { crmRouter } from './crm.js';
import { catalogoRouter } from './catalogo.js';
import { hdiApiRouter } from './hdiApiRoutes.js';
import { preventiviRouter } from './preventivi.js';

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
/* HDI Partner API. Finche' le credenziali non sono nel .env risponde «non
   configurato» invece di rompersi: sta in produzione spento e si accende
   quando HDI rilascia client id e secret. */
app.use('/hdi-api', requireAuth, hdiApiRouter);
app.use('/preventivi', requireAuth, preventiviRouter);

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
// Vigilanza automatica delle sessioni compagnia: va montata PRIMA del router fonti,
// altrimenti /fonti/vigilanza finirebbe intercettata dalle rotte generiche /fonti/:id.
app.use('/fonti/vigilanza', requireAuth, vigilanzaRouter);
app.use('/fonti', requireAuth, fontiRouter);

// ── Backup giornaliero (solo Super Admin) ─────────────────────────
app.use('/backup', requireAuth, backupRouter);

// ── Marketing: il ponte con Brevo (Blocco D) ──────────────────────────────────
// La chiave di Brevo resta qui: non deve mai finire nel browser.
app.use('/marketing', requireAuth, marketingRouter); // /liste, /mittenti, /campagne, /campagna…

/* ── EXPLORER TEMPORANEO Plurima: SMONTATO il 07/08/2026 ──────────────────────
   Diceva «RIMUOVERE dopo l'uso» dal giorno in cui e' stato scritto, ed e'
   rimasto. Non era protetto: montato senza requireAuth, l'unica guardia era
   `EXPLORE_KEY` con un valore di ripiego scritto nel sorgente versionato, e
   nessun file di deploy imposta quella variabile — quindi in esercizio la
   chiave era pubblica quanto il resto del repository.
   Che cosa apriva: un proxy verso 127.0.0.1 su qualunque porta 4xxx, cioe'
   TUTTI gli scraper delle compagnie. Fra le operazioni ammesse, `read` (i campi
   della pagina di quotazione: codice fiscale, cognome, nome, data di nascita
   del contraente), `logindump`, e `login`, che fa partire un accesso VERO sul
   portale di una compagnia. Senza alcuna autenticazione.
   Il frontend non lo chiamava da nessuna parte: nessuna funzione persa.
   Il modulo resta in server/plurimaExplore.js ma non e' piu' raggiungibile.
   Se dovesse servire di nuovo, va rimontato dietro requireAuth E dietro il
   controllo Super Admin, come il Pannello Fonti. Lo verifica
   server/perimetro.test.mjs. */

// ── Avvio ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('withus-backend in ascolto sulla porta ' + PORT);
  startBackupScheduler();
  startFontiWatchdog();
});
