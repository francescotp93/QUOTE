// ═══════════════════════════════════════════════════════════════════════════════
//  withus-backend — base minimale
//  Fase 0: server che si avvia e risponde (per validare il deploy su Render).
//  Prossime fasi: endpoint Mail (IMAP/SMTP Aruba) e Pagamenti (PayPal/Axerve),
//  protetti dal token Supabase delle app IAM/QUOTO.
// ═══════════════════════════════════════════════════════════════════════════════
import express from 'express';
import cors from 'cors';

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── CORS: solo i domini delle nostre app ──────────────────────────────────────
const ALLOWED = (process.env.CORS_ORIGINS ||
  'https://iam.withusassicurazioni.it,https://quoto.withusassicurazioni.it,https://www.withusassicurazioni.it'
).split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Richieste senza Origin (es. health check di Render, curl) sono permesse
    if (!origin || ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error('Origin non consentito: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Endpoint di stato (per verificare che il deploy funzioni) ──────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'withus-backend', version: '0.1.0', time: new Date().toISOString() });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Avvio ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('withus-backend in ascolto sulla porta ' + PORT));
