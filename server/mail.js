// ── Motore Mail: lettura via IMAP (ImapFlow) e invio via Brevo/SMTP ─────────────
// Multi-casella: amministrazione@, contabilita@, intermediari@, … (Aruba)
import { Router } from 'express';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { simpleParser } from 'mailparser';

// Elenco caselle configurate: MAIL_USER/MAIL_PASS (1ª) + MAIL_USER_2/MAIL_PASS_2 …
function mailAccounts() {
  const out = [];
  const add = (u, p) => { if (u && p) out.push({ email: u.trim(), pass: p }); };
  add(process.env.MAIL_USER, process.env.MAIL_PASS);
  for (let i = 2; i <= 8; i++) add(process.env['MAIL_USER_' + i], process.env['MAIL_PASS_' + i]);
  return out;
}
function accountFor(casella) {
  const accs = mailAccounts();
  if (!accs.length) throw new Error('Nessuna casella configurata (MAIL_USER/MAIL_PASS).');
  if (casella) { const f = accs.find(a => a.email.toLowerCase() === String(casella).toLowerCase()); if (f) return f; }
  return accs[0];
}
function srv() {
  return {
    imapHost: process.env.MAIL_IMAP_HOST || 'imaps.aruba.it',
    imapPort: parseInt(process.env.MAIL_IMAP_PORT || '993', 10),
    smtpHost: process.env.MAIL_SMTP_HOST || 'smtps.aruba.it',
    smtpPort: parseInt(process.env.MAIL_SMTP_PORT || '465', 10),
  };
}

async function withImap(casella, fn) {
  const acc = accountFor(casella);
  const s = srv();
  const client = new ImapFlow({
    host: s.imapHost, port: s.imapPort, secure: true,
    auth: { user: acc.email, pass: acc.pass }, logger: false,
  });
  await client.connect();
  try { return await fn(client, acc); }
  finally { try { await client.logout(); } catch (_) {} }
}

function flagSeen(flags) {
  if (!flags) return false;
  if (typeof flags.has === 'function') return flags.has('\\Seen');
  if (Array.isArray(flags)) return flags.includes('\\Seen');
  return false;
}

async function listFolders(client) {
  const list = await client.list();
  const map = { inbox: 'INBOX' };
  for (const f of list) {
    if (f.specialUse === '\\Sent') map.sent = f.path;
    else if (f.specialUse === '\\Drafts') map.drafts = f.path;
    else if (f.specialUse === '\\Junk') map.junk = f.path;
    else if (f.specialUse === '\\Trash') map.trash = f.path;
    else if (f.specialUse === '\\Archive') map.archive = f.path;
  }
  const byName = (names) => {
    const x = list.find(f => names.includes((f.path || '').toLowerCase()) || names.includes((f.name || '').toLowerCase()));
    return x ? x.path : null;
  };
  if (!map.sent)   map.sent   = byName(['sent', 'inbox.sent', 'posta inviata', 'sent items', 'inviata', 'inbox.sent items']);
  if (!map.drafts) map.drafts = byName(['drafts', 'inbox.drafts', 'bozze', 'inbox.bozze']);
  if (!map.junk)   map.junk   = byName(['junk', 'spam', 'inbox.spam', 'inbox.junk', 'posta indesiderata', 'inbox.posta indesiderata']);
  if (!map.trash)  map.trash  = byName(['trash', 'inbox.trash', 'cestino', 'inbox.cestino', 'deleted', 'deleted items', 'posta eliminata']);
  return { map, all: list.map(f => ({ path: f.path, name: f.name, specialUse: f.specialUse || null })) };
}

function resolvePath(map, folder) {
  if (!folder || folder === 'inbox') return 'INBOX';
  if (map[folder]) return map[folder];
  return folder;
}

async function fetchRecent(client, limit) {
  const total = client.mailbox ? client.mailbox.exists : 0;
  if (!total) return [];
  const from = Math.max(1, total - limit + 1);
  const out = [];
  for await (const m of client.fetch(`${from}:*`, { envelope: true, flags: true, internalDate: true })) {
    const env = m.envelope || {};
    out.push({
      uid: m.uid,
      subject: env.subject || '(nessun oggetto)',
      from: (env.from || []).map(a => ({ name: a.name, address: a.address })),
      to: (env.to || []).map(a => ({ name: a.name, address: a.address })),
      date: m.internalDate || env.date,
      seen: flagSeen(m.flags),
    });
  }
  return out.reverse();
}

// Invio via API Brevo (HTTPS): aggira il blocco SMTP del piano free di Render.
async function sendViaBrevo(o) {
  const key = process.env.BREVO_API_KEY;
  const toArr = String(o.to).split(',').map(s => ({ email: s.trim() })).filter(x => x.email);
  const payload = { sender: { email: o.from, name: o.fromName || process.env.MAIL_FROM_NAME || 'withus' }, to: toArr, subject: o.subject };
  if (o.html) payload.htmlContent = o.html;
  if (o.text) payload.textContent = o.text;
  if (o.cc)  payload.cc  = String(o.cc).split(',').map(s => ({ email: s.trim() })).filter(x => x.email);
  if (o.bcc) payload.bcc = String(o.bcc).split(',').map(s => ({ email: s.trim() })).filter(x => x.email);
  if (o.attachments && o.attachments.length) payload.attachment = o.attachments.map(a => ({ name: a.name, content: a.content }));
  if (o.scheduledAt) payload.scheduledAt = o.scheduledAt;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Brevo: ' + (data.message || ('HTTP ' + r.status)));
  return data.messageId || 'ok';
}

// ── Router pubblico: /selftest (collaudo con chiave) ────────────────────────────
export const publicMail = Router();
publicMail.get('/selftest', async (req, res) => {
  const key = process.env.MAIL_SELFTEST_KEY;
  if (!key || req.query.key !== key) return res.status(403).json({ ok: false, error: 'Chiave non valida.' });
  try {
    const r = await withImap(req.query.casella, async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try { return client.mailbox ? client.mailbox.exists : 0; } finally { lock.release(); }
    });
    res.json({ ok: true, accounts: mailAccounts().map(a => a.email), inboxCount: r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Router protetto (richiede login Supabase) ───────────────────────────────────
export const secureMail = Router();

// Elenco caselle gestibili
secureMail.get('/accounts', (req, res) => {
  res.json({ accounts: mailAccounts().map(a => a.email) });
});

// Elenco cartelle
secureMail.get('/folders', async (req, res) => {
  try {
    const data = await withImap(req.query.casella, async (client) => await listFolders(client));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Elenco messaggi di una cartella
secureMail.get('/list', async (req, res) => {
  const folder = req.query.folder || 'inbox';
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  try {
    const messages = await withImap(req.query.casella, async (client) => {
      const { map } = await listFolders(client);
      const path = resolvePath(map, folder);
      if (!path) return [];
      const lock = await client.getMailboxLock(path);
      try { return await fetchRecent(client, limit); } finally { lock.release(); }
    });
    res.json({ folder, messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Messaggio completo
secureMail.get('/message/:uid', async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  const folder = req.query.folder || 'inbox';
  if (!uid) return res.status(400).json({ error: 'UID non valido.' });
  try {
    const out = await withImap(req.query.casella, async (client) => {
      const { map } = await listFolders(client);
      const path = resolvePath(map, folder);
      if (!path) return null;
      const lock = await client.getMailboxLock(path);
      try {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) return null;
        const p = await simpleParser(msg.source);
        if (folder === 'inbox') { try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); } catch (_) {} }
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

// Scarica un singolo allegato (per indice) di un messaggio
secureMail.get('/attachment', async (req, res) => {
  const uid = parseInt(req.query.uid, 10);
  const folder = req.query.folder || 'inbox';
  const index = parseInt(req.query.index, 10) || 0;
  if (!uid) return res.status(400).json({ error: 'UID non valido.' });
  try {
    const out = await withImap(req.query.casella, async (client) => {
      const { map } = await listFolders(client);
      const path = resolvePath(map, folder);
      if (!path) return null;
      const lock = await client.getMailboxLock(path);
      try {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) return null;
        const p = await simpleParser(msg.source);
        const a = (p.attachments || [])[index];
        if (!a) return null;
        return {
          filename: a.filename || ('allegato-' + index),
          contentType: a.contentType || 'application/octet-stream',
          content: a.content.toString('base64'),
        };
      } finally { lock.release(); }
    });
    if (!out) return res.status(404).json({ error: 'Allegato non trovato.' });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Invio (risponde subito; salva copia in "Inviata" in background)
secureMail.post('/send', async (req, res) => {
  const { to, subject, text, html, cc, bcc, casella, fromName, attachments, scheduledAt } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: 'Destinatario e oggetto sono obbligatori.' });
  try {
    const acc = accountFor(casella);
    const att = Array.isArray(attachments) ? attachments.filter(a => a && a.name && a.content) : [];
    const nodeAtt = att.map(a => ({ filename: a.name, content: a.content, encoding: 'base64' }));
    const mailOptions = { from: acc.email, fromName, to, cc: cc || undefined, bcc: bcc || undefined, subject, text: text || undefined, html: html || undefined, attachments: att, scheduledAt: scheduledAt || undefined };

    let messageId;
    if (process.env.BREVO_API_KEY) {
      messageId = await sendViaBrevo(mailOptions);
    } else {
      const s = srv();
      const transporter = nodemailer.createTransport({
        host: s.smtpHost, port: s.smtpPort, secure: true,
        auth: { user: acc.email, pass: acc.pass },
        connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 25000,
      });
      const info = await transporter.sendMail({ from: acc.email, to, cc, bcc, subject, text, html, attachments: nodeAtt });
      messageId = info.messageId;
    }
    res.json({ ok: true, messageId });

    // background: copia in "Posta inviata" (solo se inviata subito, non programmata)
    if (!scheduledAt) (async () => {
      try {
        const raw = await new Promise((resolve, reject) =>
          new MailComposer({ from: acc.email, to, cc, bcc, subject, text, html, attachments: nodeAtt }).compile().build((e, msg) => e ? reject(e) : resolve(msg)));
        await withImap(acc.email, async (client) => {
          const { map } = await listFolders(client);
          if (map.sent) await client.append(map.sent, raw, ['\\Seen']);
        });
      } catch (_) {}
    })();
  } catch (e) { res.status(500).json({ error: e.message }); }
});
