// ═══════════════════════════════════════════════════════════════════════════════
//  Assistente AI interno (solo Super Admin) — "un me dentro le app"
//  - Chat di aiuto su IAM / QUOTO / Lab(marketing) con contesto per app
//  - Quando serve una modifica al codice, formatta una "richiesta di correzione"
//    chiara che poi viene eseguita e pubblicata (auto-deploy).
//  - Chiave API Claude salvata CIFRATA a riposo (AES-256-GCM), mai rimandata al browser.
//  Usa l'SDK ufficiale @anthropic-ai/sdk, modello claude-opus-4-8.
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

export const assistantRouter = Router();

const __dir = path.dirname(fileURLToPath(import.meta.url));
const STORE = process.env.ASSISTANT_STORE || path.join(__dir, 'assistant.store.json');
if (!process.env.SUPER_ADMIN_EMAIL) throw new Error('SUPER_ADMIN_EMAIL mancante: impostala nelle variabili d\'ambiente.');
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL.toLowerCase();
const MODEL = process.env.ASSISTANT_MODEL || 'claude-opus-4-8';

// Stessa chiave di cifratura del Pannello Fonti (FONTI_SECRET o fallback stabile).
const SECRET = process.env.FONTI_SECRET;
if (!SECRET || SECRET.length < 16) throw new Error('FONTI_SECRET mancante o troppo corta (>=16 caratteri): impostala prima di avviare.');
const KEY = crypto.createHash('sha256').update(SECRET).digest();
function enc(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function dec(blob) {
  if (!blob || !String(blob).startsWith('v1:')) return '';
  try {
    const raw = Buffer.from(String(blob).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}
function load() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; } }
function save(d) { try { fs.writeFileSync(STORE, JSON.stringify(d, null, 2), { mode: 0o600 }); return true; } catch { return false; } }
function apiKey() { const s = load(); return (s.api_key ? dec(s.api_key) : '') || process.env.ANTHROPIC_API_KEY || ''; }

// ── Gate: solo Super Admin ─────────────────────────────────────────────────────
assistantRouter.use((req, res, next) => {
  if ((req.user && req.user.email) !== SUPER_ADMIN_EMAIL) return res.status(403).json({ error: 'Riservato al Super Admin.' });
  next();
});

// Contesto/persona per app
const APP_CTX = {
  iam: 'IAM ("Agente sospesi"): gestione agenti/utenti, dashboard, produzione, gare/KPI, work diary, ticket, permessi e login. Stack: HTML/JS monolitico + Supabase, GitHub Pages.',
  quoto: 'QUOTO: quotatore assicurativo multi-compagnia (auto/moto, prodotti vari). Stack: HTML/JS monolitico (index.html) + backend Node (withus-backend) + Supabase. Ha un Pannello Fonti per lo scraping (24H, Allianz).',
  lab: 'Lab: la parte dedicata al MARKETING.',
};
function systemFor(app) {
  const ctx = APP_CTX[(app || '').toLowerCase()] || 'Una delle app WithUs (IAM, QUOTO, Lab/marketing).';
  return [
    'Sei l\'assistente interno di WithUs Assicurazioni, riservato al titolare (Super Admin).',
    'Parli SEMPRE in italiano, in modo pratico e diretto, senza tecnicismi inutili: il titolare non è un programmatore.',
    'App di contesto attuale: ' + ctx,
    'Aiuti a capire e risolvere problemi su IAM, QUOTO e Lab(marketing).',
    'Quando la richiesta richiede una MODIFICA al codice, NON la esegui tu: prepari una "RICHIESTA DI CORREZIONE" chiara e sintetica',
    'che il titolare può inoltrarmi (l\'agente di sviluppo) e che verrà pubblicata da sola con l\'auto-deploy.',
    'In quel caso termina con un blocco esattamente così:',
    '— — —',
    'RICHIESTA DI CORREZIONE',
    'App: <iam|quoto|lab>',
    'Cosa: <descrizione breve della modifica>',
    'Dove: <pagina/sezione, se nota>',
    'Risultato atteso: <cosa deve succedere>',
    '— — —',
    'Se invece è solo una domanda o una guida, rispondi e basta, senza il blocco.',
  ].join('\n');
}

// ── GET /assistant/config — stato (nessun segreto) ─────────────────────────────
assistantRouter.get('/config', (req, res) => {
  res.json({ ok: true, configurato: !!apiKey(), modello: MODEL });
});

// ── POST /assistant/key — salva la chiave API Claude (cifrata) ─────────────────
assistantRouter.post('/key', (req, res) => {
  const api_key = (req.body && req.body.api_key || '').trim();
  if (!api_key) return res.status(400).json({ error: 'Chiave API obbligatoria.' });
  if (!/^sk-ant-/.test(api_key)) return res.status(400).json({ error: 'La chiave Claude inizia con "sk-ant-". Controlla di aver copiato quella giusta.' });
  const s = load();
  s.api_key = enc(api_key);
  s.aggiornato_il = new Date().toISOString();
  if (!save(s)) return res.status(500).json({ error: 'Salvataggio non riuscito (permessi file).' });
  res.json({ ok: true });
});

// ── POST /assistant/chat — conversazione con l'assistente ──────────────────────
assistantRouter.post('/chat', async (req, res) => {
  const key = apiKey();
  if (!key) return res.status(400).json({ error: 'Assistente non configurato: inserisci la chiave API nel pannello.' });
  const { app, messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'Messaggio mancante.' });
  const turns = messages.slice(-24).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String((m && m.content) || '').slice(0, 8000),
  })).filter(m => m.content);
  if (!turns.length || turns[0].role !== 'user') return res.status(400).json({ error: 'Conversazione non valida.' });
  try {
    const client = new Anthropic({ apiKey: key });
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemFor(app),
      messages: turns,
    });
    const reply = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    res.json({ ok: true, reply: reply || '(nessuna risposta)' });
  } catch (e) {
    const msg = (e && e.message) || String(e);
    const code = (e && e.status) || 0;
    if (code === 401) return res.status(400).json({ error: 'Chiave API non valida: controllala nel pannello.' });
    if (code === 429) return res.status(429).json({ error: 'Troppo richieste in questo momento, riprova tra poco.' });
    res.status(502).json({ error: 'Errore assistente: ' + msg });
  }
});
