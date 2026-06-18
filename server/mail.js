// ── Motore Mail: lettura via IMAP (ImapFlow) e invio via SMTP (Nodemailer) ──────
// Gestione di tutte le cartelle: Posta in arrivo, Inviata, Bozze, Spam, Cestino…
import { Router } from 'express';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
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

// Mappa le cartelle del server alle chiavi standard (inbox/sent/drafts/junk/trash)
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
  return folder; // percorso esplicito
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
  const payload = { sender: { email: o.from, name: process.env.MAIL_FROM_NAME || 'withus' }, to: toArr, subject: o.subject };
  if (o.html) payload.htmlContent = o.html;
  if (o.text) payload.textContent = o.text;
  if (o.cc)  payload.cc  = String(o.cc).split(',').map(s => ({ email: s.trim() })).filter(x => x.email);
  if (o.bcc) payload.bcc = String(o.bcc).split(',').map(s => ({ email: s.trim() })).filter(x => x.email);
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Brevo: ' + (data.message || ('HTTP ' + r.status)));
  return data.messageId || 'ok';
}

// ── Router pubblico: solo /selftest (collaudo con chiave) ───────────────────────
export const publicMail = Router();
publicMail.get('/selftest', async (req, res) => {
  const key = process.env.MAIL_SELFTEST_KEY;
  if (!key || req.query.key !== key) return res.status(403).json({ ok: false, error: 'Chiave non valida.' });
  try {
    const r = await withImap(async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try { return client.mailbox ? client.mailbox.exists : 0; } finally { lock.release(); }
    });
    res.json({ ok: true, mailbox: process.env.MAIL_USER, inboxCount: r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Router protetto (richiede login Supabase) ───────────────────────────────────
export const secureMail = Router();

// Elenco cartelle disponibili
secureMail.get('/folders', async (req, res) => {
  try {
    const data = await withImap(async (client) => await listFolders(client));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Elenco messaggi di una cartella (folder = inbox|sent|drafts|junk|trash|<path>)
secureMail.get('/list', async (req, res) => {
  const folder = req.query.folder || 'inbox';
  const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);
  try {
    const messages = await withImap(async (client) => {
      const { map } = await listFolders(client);
      const path = resolvePath(map, folder);
      if (!path) return [];
      const lock = await client.getMailboxLock(path);
      try { return await fetchRecent(client, limit); } finally { lock.release(); }
    });
    res.json({ folder, messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Messaggio completo (folder = cartella di provenienza)
secureMail.get('/message/:uid', async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  const folder = req.query.folder || 'inbox';
  if (!uid) return res.status(400).json({ error: 'UID non valido.' });
  try {
    const out = await withImap(async (client) => {
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

// Invio (risponde subito; salva copia in "Inviata" in background)
secureMail.post('/send', async (req, res) => {
  const { to, subject, text, html, cc, bcc } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: 'Destinatario e oggetto sono obbligatori.' });
  try {
    const c = mailConfig();
    const mailOptions = { from: c.user, to, cc: cc || undefined, bcc: bcc || undefined, subject, text: text || undefined, html: html || undefined };

    // Invio: Brevo (HTTPS) se configurato, altrimenti SMTP diretto
    let messageId;
    if (process.env.BREVO_API_KEY) {
      messageId = await sendViaBrevo(mailOptions);
    } else {
      const transporter = nodemailer.createTransport({
        host: c.smtpHost, port: c.smtpPort, secure: true,
        auth: { user: c.user, pass: c.pass },
        connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 25000,
      });
      const info = await transporter.sendMail(mailOptions);
      messageId = info.messageId;
    }
    res.json({ ok: true, messageId });
    // background: copia in "Posta inviata"
    (async () => {
      try {
        const raw = await new Promise((resolve, reject) =>
          new MailComposer(mailOptions).compile().build((e, msg) => e ? reject(e) : resolve(msg)));
        await withImap(async (client) => {
          const { map } = await listFolders(client);
          if (map.sent) await client.append(map.sent, raw, ['\\Seen']);
        });
      } catch (_) {}
    })();
  } catch (e) { res.status(500).json({ error: e.message }); }
});
