// ── Motore Mail: lettura via IMAP (ImapFlow) e invio via SMTP (Nodemailer) ──────
// Fase 1: una sola casella, configurata via variabili d'ambiente su Render.
import { Router } from 'express';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';

function mailConfig() {
  const user = process.env.MAIL_USER, pass = process.env.MAIL_PASS;
  if (!user || !pass) throw new Error('Casella non configurata (MAIL_USER / MAIL_PASS).');
  return {
    user, pass,
    imapHost: process.env.MAIL_IMAP_HOST || 'imaps.aruba.it',
    imapPort: parseInt(process.env.MAIL_IMAP_PORT || '993', 10),
    smtpHost: process.env.MAIL_SMTP_HOST || 'smtps.aruba.it',
    smtpPort: parseInt(process.env.MAIL_SMTP_PORT || '465', 10),
  };
}

async function withImap(fn) {
  const c = mailConfig();
  const client = new ImapFlow({
    host: c.imapHost, port: c.imapPort, secure: true,
    auth: { user: c.user, pass: c.pass }, logger: false,
  });
  await client.connect();
  try { return await fn(client, c); }
  finally { try { await client.logout(); } catch (_) {} }
}

function flagSeen(flags) {
  if (!flags) return false;
  if (typeof flags.has === 'function') return flags.has('\\Seen');
  if (Array.isArray(flags)) return flags.includes('\\Seen');
  return false;
}

// ── Router pubblico: solo /selftest, protetto da una chiave (per collaudo) ──────
export const publicMail = Router();
publicMail.get('/selftest', async (req, res) => {
  const key = process.env.MAIL_SELFTEST_KEY;
  if (!key || req.query.key !== key) return res.status(403).json({ ok: false, error: 'Chiave non valida.' });
  try {
    const r = await withImap(async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try { return client.mailbox ? client.mailbox.exists : 0; }
      finally { lock.release(); }
    });
    res.json({ ok: true, mailbox: process.env.MAIL_USER, inboxCount: r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Router protetto (richiede login Supabase) ───────────────────────────────────
export const secureMail = Router();

// Elenco messaggi recenti della Posta in arrivo
secureMail.get('/inbox', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  try {
    const messages = await withImap(async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const total = client.mailbox ? client.mailbox.exists : 0;
        if (!total) return [];
        const from = Math.max(1, total - limit + 1);
        const out = [];
        for await (const m of client.fetch(`${from}:*`, { envelope: true, flags: true, internalDate: true })) {
          out.push({
            uid: m.uid,
            subject: (m.envelope && m.envelope.subject) || '(nessun oggetto)',
            from: ((m.envelope && m.envelope.from) || []).map(a => ({ name: a.name, address: a.address })),
            date: m.internalDate || (m.envelope && m.envelope.date),
            seen: flagSeen(m.flags),
          });
        }
        return out.reverse(); // più recenti in cima
      } finally { lock.release(); }
    });
    res.json({ messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Messaggio completo per UID (e lo segna come letto)
secureMail.get('/message/:uid', async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  if (!uid) return res.status(400).json({ error: 'UID non valido.' });
  try {
    const out = await withImap(async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) return null;
        const p = await simpleParser(msg.source);
        try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); } catch (_) {}
        return {
          uid,
          subject: p.subject || '(nessun oggetto)',
          from: (p.from && p.from.value) || [],
          to: (p.to && p.to.value) || [],
          date: p.date,
          html: p.html || null,
          text: p.text || '',
          attachments: (p.attachments || []).map(a => ({ filename: a.filename, contentType: a.contentType, size: a.size })),
        };
      } finally { lock.release(); }
    });
    if (!out) return res.status(404).json({ error: 'Messaggio non trovato.' });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Invio email
secureMail.post('/send', async (req, res) => {
  const { to, subject, text, html, cc, bcc } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: 'Destinatario e oggetto sono obbligatori.' });
  try {
    const c = mailConfig();
    const transporter = nodemailer.createTransport({
      host: c.smtpHost, port: c.smtpPort, secure: true,
      auth: { user: c.user, pass: c.pass },
    });
    const info = await transporter.sendMail({
      from: c.user, to, cc: cc || undefined, bcc: bcc || undefined,
      subject, text: text || undefined, html: html || undefined,
    });
    res.json({ ok: true, messageId: info.messageId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
