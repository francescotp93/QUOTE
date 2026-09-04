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
import { convenzionatiRouter, convenzionatiPubblico, convenzionatiRouter_pubblicoAssociati } from './convenzionati.js';
import { creaApiQuotazione } from './quoteApi.js';
import { creaApiFonti } from './fontiApi.js';
import { chiaveCondivisa } from './chiaveCondivisa.js';
import { PRODOTTI } from './prodottiApi.js';
import { motoRouter } from './moto.js';
import { fontiRouter, publicFontiRouter } from './fonti.js';
import { backupRouter, startBackupScheduler } from './backup.js';
import { marketingRouter } from './marketing.js';
import { vigilanzaRouter, startFontiWatchdog } from './fontiWatchdog.js';
import { plurimaExploreRouter } from './plurimaExplore.js';
import { crmRouter } from './crm.js';
import { catalogoRouter } from './catalogo.js';
import { hdiApiRouter } from './hdiApiRoutes.js';
import { preventiviRouter } from './preventivi.js';
import { parametriPrevRouter } from './parametriPrevidenziali.js';
import { analisiPrevRouter } from './analisiPrevidenziali.js';
import { registroRichieste } from './registro.js';

const app = express();
app.use(express.json({ limit: '30mb' }));

/* Il registro delle richieste. Sta QUI, prima di ogni rotta, perche' deve
   vedere anche quelle che finiscono in errore prima di arrivare da qualche
   parte. Scrive alla fine di ogni risposta: percorso, esito, durata. Mai la
   query, mai il corpo — il perche' e' in cima a registro.js. */
app.use(registroRichieste());

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
app.use('/parametri-previdenziali', requireAuth, parametriPrevRouter);
app.use('/analisi-previdenziali', requireAuth, analisiPrevRouter);

// ── Shop ──────────────────────────────────────────────────────
app.use('/shop', shopRouter);
app.use('/l', ogRouter);

// ── Firma ────────────────────────────────────────────────────
app.use('/sign', publicSign);
app.use('/sign', requireAuth, signRouter);
app.use('/firma-collab', publicFirmaCollab);
app.use('/firma-collab', requireAuth, firmaCollabRouter);
/* Convenzionati: la rotta dell'ISCRIZIONE e' pubblica (ci arriva chi non ha
   nessun accesso, e' il punto), tutto il resto vuole lo staff. La pubblica va
   montata PRIMA, altrimenti il cancello la fermerebbe. */
app.use('/convenzionati', convenzionatiPubblico);
/* Le rotte dell'associato: fuori dal cancello dello staff, ma non aperte —
   ognuna verifica il suo accesso Supabase e quale riga puo' toccare. */
app.use('/convenzionati', convenzionatiRouter_pubblicoAssociati);
app.use('/convenzionati', requireAuth, convenzionatiRouter);

// ── La chiave del ponte IAM<->QUOTO ───────────────────────────
// Non sta in un file: nasce dentro Supabase e i due lati la leggono da li'
// (tabella ponte_segreti, nessuna policy RLS, solo il service_role la vede).
// IAM e' un sito statico su GitHub Pages: un segreto nel browser non e' un
// segreto, quindi il lato IAM e' una Edge Function, che legge la stessa riga.
// Cosi' nessuno digita o incolla la chiave da nessuna parte.
// INTERNAL_API_KEY nel .env, se c'e', vince: e' la via di fuga a mano.
// Se non si riesce a leggerla, l'API risponde 401 a tutto: porta chiusa.
const chiavePonte = chiaveCondivisa({
  url: process.env.SUPABASE_URL || '',
  servizio: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  log: (r) => { try { console.log('[chiave-ponte]', JSON.stringify(r)); } catch {} },
});

// ── API v1 delle Fonti — il pannello portali, chiamabile da IAM ─
// Stessa porta della quotazione (chiave interna), e in piu' X-Operatore per
// tutto cio' che tocca le credenziali.
// Va montata PRIMA di /api/v1: quella e' montata sul prefisso, quindi ogni
// chiamata alle Fonti le passerebbe davanti — e ogni chiamata risulterebbe
// due volte nel registro, con la prima che non porta a niente.
app.use('/api/v1/fonti', creaApiFonti({
  pannello: fontiRouter,
  vigilanza: vigilanzaRouter,
  superAdmin: (process.env.SUPER_ADMIN_EMAIL || 'francesco.oddo199307@gmail.com').toLowerCase(),
  chiave: chiavePonte,
  log: (r) => { try { console.log('[api-v1-fonti]', JSON.stringify(r)); } catch {} },
}));

// ── API di quotazione v1 — il contratto con IAM ───────────────
// Server-to-server: NON passa da requireAuth (che verifica il token di un
// utente). L'utente lo ha gia' autenticato IAM; qui vale una chiave interna,
// controllata dentro il router. Montarla sotto requireAuth vorrebbe dire che
// QUOTO deve saper leggere le sessioni di IAM — un legame in piu' fra due
// servizi che stiamo separando.
// Se la chiave non e' configurata il router risponde 401 a tutto: meglio una
// porta chiusa che una aperta per distrazione.
app.use('/api/v1', creaApiQuotazione({
  chiave: chiavePonte,
  prodotti: PRODOTTI,
  log: (r) => { try { console.log('[api-v1]', JSON.stringify(r)); } catch {} },
}));

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

// ── EXPLORER TEMPORANEO Plurima (sola lettura, protetto da chiave) — RIMUOVERE dopo l'uso ──
app.use('/plurima-explore', plurimaExploreRouter);

// ── Avvio ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('withus-backend in ascolto sulla porta ' + PORT);
  startBackupScheduler();
  startFontiWatchdog();
});
