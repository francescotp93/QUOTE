// ── Generazione lead dal sito (widget "Richiedi preventivo") ─────────────────────
// Endpoint PUBBLICO: riceve un contatto dal sito, lo salva come "richiesta" in QUOTO
// (così entra nel flusso Richieste) e avvisa l'ufficio via email (Brevo).
import { Router } from 'express';
import { creaLeadIAM } from './iamLead.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const STAFF_INBOX = process.env.STAFF_EMAIL || 'intermediari@withusassicurazioni.it';
const NOTIFY_FROM = process.env.NOTIFY_FROM || STAFF_INBOX;

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function sbInsert(row) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/quote_preventivi`, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify([row]),
  });
  if (!r.ok) throw new Error('Supabase insert: ' + (await r.text()).slice(0, 200));
}
async function sendBrevo(to, subject, html) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return;
  const recipients = [...new Set((to || []).filter(Boolean))].map(e => ({ email: e }));
  if (!recipients.length) return;
  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: NOTIFY_FROM, name: 'QUOTO Lead' }, to: recipients, subject, htmlContent: html }),
  });
}

export const leadRouter = Router();
leadRouter.post('/', async (req, res) => {
  const b = req.body || {};
  if (b.azienda_web) return res.json({ ok: true }); // honeypot: bot → finge successo
  if (process.env.LEAD_API_KEY && b.key !== process.env.LEAD_API_KEY) return res.status(403).json({ error: 'Non autorizzato.' });

  const clip = (v, n) => String(v ?? '').trim().slice(0, n);
  const nome = clip(b.nome, 120);
  const email = clip(b.email, 160);
  const telefono = clip(b.telefono, 40);
  const prodotto = clip(b.prodotto || 'Richiesta dal sito', 160);
  const messaggio = clip(b.messaggio, 2000);
  const fonte = clip(b.fonte || 'sito web', 80);
  if (!nome || (!email && !telefono)) {
    return res.status(400).json({ error: 'Servono il nome e almeno un contatto (email o telefono).' });
  }

  try {
    const dati = { stato: 'richiesta', lead: true, contatto: { nome, email, telefono }, messaggio, fonte, prodottoInteresse: prodotto, ricevuto_il: new Date().toISOString() };
    await sbInsert({ modulo: 'lead', prodotto, cliente: nome, dati, creato_nome: ('Sito · ' + fonte).slice(0, 120) });
    // Lo ritrovo anche nella sezione Lead di IAM
    try { await creaLeadIAM({ nominativo: nome, telefono, email, fonte, prodotto, note: messaggio || ('Richiesta dal sito · ' + fonte) }); } catch (_) {}

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#3b5bfd,#2a45e0);color:#fff;padding:18px 22px;font-size:18px;font-weight:700">⚡ Nuovo lead dal sito</div>
      <div style="padding:22px 24px;color:#2b3346;font-size:15px;line-height:1.6">
        <p><b>Nome:</b> ${esc(nome)}<br>
        <b>Telefono:</b> ${esc(telefono) || '—'}<br>
        <b>Email:</b> ${esc(email) || '—'}<br>
        <b>Prodotto d'interesse:</b> ${esc(prodotto)}<br>
        <b>Fonte:</b> ${esc(fonte)}</p>
        ${messaggio ? `<blockquote style="border-left:3px solid #3b5bfd;margin:12px 0;padding:8px 14px;color:#3a4254;background:#f5f7ff;border-radius:0 8px 8px 0">${esc(messaggio)}</blockquote>` : ''}
        <p style="color:#8b93a7;font-size:13px">Lo trovi in QUOTO → Richieste di preventivo.</p>
      </div></div>`;
    try { await sendBrevo([STAFF_INBOX], 'Nuovo lead dal sito — ' + prodotto, html); } catch (_) {}

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
