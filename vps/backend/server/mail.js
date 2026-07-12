// ── Motore Mail: lettura via IMAP (ImapFlow) e invio via Brevo/SMTP ─────────────
// Multi-casella: amministrazione@, contabilita@, intermediari@, … (Aruba)
import { Router } from 'express';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { simpleParser } from 'mailparser';
import { caselleMailStore } from './fonti.js';

// Host IMAP/SMTP di default in base al dominio dell'indirizzo (multi-provider).
// Aruba, Gmail e — per gli altri (es. Zimbra) — un tentativo su mail.<dominio>,
// comunque sovrascrivibile per singola casella via env (vedi mailAccounts).
function providerFor(email) {
  const dom = (String(email).split('@')[1] || '').toLowerCase();
  if (/(^|\.)gmail\.com$|googlemail\.com$/.test(dom)) return { imapHost: 'imap.gmail.com', smtpHost: 'smtp.gmail.com' };
  if (/aruba\.it$|withusassicurazioni\.it$|withus\.coop$/.test(dom)) return { imapHost: 'imaps.aruba.it', smtpHost: 'smtps.aruba.it' };
  return { imapHost: 'mail.' + dom, smtpHost: 'mail.' + dom }; // Zimbra e generici
}

// Costruisce una casella risolvendo host/porta: override espliciti → altrimenti
// dedotti dal dominio (providerFor). `over` può venire da env o dal pannello Fonti.
function resolveAccount(email, pass, over) {
  email = String(email).trim();
  const prov = providerFor(email);
  over = over || {};
  return {
    email, pass,
    imapHost: over.imapHost || prov.imapHost,
    imapPort: over.imapPort || 993,
    smtpHost: over.smtpHost || prov.smtpHost,
    smtpPort: over.smtpPort || 465,
  };
}
// Elenco caselle configurate, da DUE sorgenti (dedup per indirizzo, .env vince):
//  1) variabili d'ambiente: MAIL_USER/MAIL_PASS (+ _2.._8), host per-casella opzionali
//     via MAIL_IMAP_HOST[_n]/MAIL_SMTP_HOST[_n]/MAIL_IMAP_PORT[_n]/MAIL_SMTP_PORT[_n];
//  2) pannello Fonti (cifrate a riposo) — caselleMailStore().
function mailAccounts() {
  const out = [], seen = new Set();
  const push = (email, pass, over) => {
    if (!email || !pass) return;
    const k = String(email).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(resolveAccount(email, pass, over));
  };
  const envOver = (sfx) => ({
    imapHost: process.env['MAIL_IMAP_HOST' + sfx] || undefined,
    imapPort: process.env['MAIL_IMAP_PORT' + sfx] ? parseInt(process.env['MAIL_IMAP_PORT' + sfx], 10) : undefined,
    smtpHost: process.env['MAIL_SMTP_HOST' + sfx] || undefined,
    smtpPort: process.env['MAIL_SMTP_PORT' + sfx] ? parseInt(process.env['MAIL_SMTP_PORT' + sfx], 10) : undefined,
  });
  push(process.env.MAIL_USER, process.env.MAIL_PASS, envOver(''));
  for (let i = 2; i <= 8; i++) push(process.env['MAIL_USER_' + i], process.env['MAIL_PASS_' + i], envOver('_' + i));
  try { for (const c of caselleMailStore()) push(c.email, c.pass, c); } catch (_) {}
  return out;
}
function accountFor(casella) {
  const accs = mailAccounts();
  if (!accs.length) throw new Error('Nessuna casella configurata (MAIL_USER/MAIL_PASS).');
  if (casella) { const f = accs.find(a => a.email.toLowerCase() === String(casella).toLowerCase()); if (f) return f; }
  return accs[0];
}

// ── Permessi: quali caselle può vedere l'utente loggato ─────────────────────────
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
async function userCaselle(user) {
  const all = mailAccounts().map(a => a.email);
  const owners = (process.env.MAIL_ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (user && owners.includes((user.email || '').toLowerCase())) return all; // proprietario: tutte
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !user) return [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/iam_utenti?id=eq.${encodeURIComponent(user.id)}&select=mail_caselle`, {
      headers: { apikey: key, Authorization: 'Bearer ' + key },
    });
    const rows = await r.json().catch(() => []);
    const mc = rows && rows[0] && rows[0].mail_caselle;
    if (!mc) return [];
    if (String(mc).trim() === '*') return all;
    const list = String(mc).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return all.filter(e => list.includes(e.toLowerCase()));
  } catch (e) { return []; }
}
function pickCasella(allowed, requested) {
  if (!allowed.length) return null;
  if (requested) { const f = allowed.find(a => a.toLowerCase() === String(requested).toLowerCase()); return f || null; }
  return allowed[0];
}

async function withImap(casella, fn) {
  const acc = accountFor(casella);
  const client = new ImapFlow({
    host: acc.imapHost, port: acc.imapPort, secure: acc.imapPort !== 143,
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

// ── Digest "posta di oggi" per l'automazione (server-side, veloce) ──────────────
// Legge tutte le caselle configurate e restituisce i messaggi di oggi nel formato
// atteso dalla Routine di Giulia. Protetto da chiave condivisa (MAIL_DIGEST_KEY o,
// in fallback, MAIL_SELFTEST_KEY). Nessun login Supabase: gira con le credenziali
// Aruba del server, quindi non dipende da segreti nelle sessioni.
publicMail.get('/digest', async (req, res) => {
  const key = process.env.MAIL_DIGEST_KEY || process.env.MAIL_SELFTEST_KEY;
  if (!key || req.query.key !== key) return res.status(403).json({ ok: false, error: 'Chiave non valida.' });
  const filtro = (req.query.filtro || 'oggi').toString();
  const limit = Math.min(parseInt(req.query.limit, 10) || 60, 100);
  // inizio giornata Europe/Rome per il filtro "oggi"
  const now = new Date();
  const offsetMs = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' })) - new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const [Y, M, D] = now.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10).split('-').map(Number);
  const inizioOggi = new Date(Date.UTC(Y, M - 1, D, 0, 0, 0) - offsetMs);
  const since = filtro === 'oggi' ? inizioOggi : new Date(Date.now() - 36 * 3600 * 1000);
  const risultati = {};
  for (const acc of mailAccounts()) {
    const short = acc.email.split('@')[0].toLowerCase();
    try {
      const msgs = await withImap(acc.email, async (client) => {
        const lock = await client.getMailboxLock('INBOX');
        try { return await fetchRecent(client, limit); } finally { lock.release(); }
      });
      const messaggi = msgs
        .filter(m => m.date && new Date(m.date) >= since)
        .map(m => {
          const a = (m.from && m.from[0]) || {};
          return { da: a.name ? `${a.name} <${a.address}>` : (a.address || ''), oggetto: m.subject || '(nessun oggetto)', data: m.date, uid: m.uid, seen: m.seen };
        });
      risultati[short] = { messaggi };
    } catch (e) { risultati[short] = { errore: e.message }; }
  }
  res.json({ ok: true, filtro, since: since.toISOString(), risultati });
});

// ── Router protetto (richiede login Supabase) ───────────────────────────────────
export const secureMail = Router();

// Elenco caselle gestibili
secureMail.get('/accounts', async (req, res) => {
  res.json({ accounts: await userCaselle(req.user) });
});

// Conteggio mail non lette in "Posta in arrivo" (per il pallino di notifica).
// Leggero: usa STATUS (unseen) senza scaricare i messaggi.
secureMail.get('/unread', async (req, res) => {
  try {
    const caselle = await userCaselle(req.user);
    if (!caselle.length) return res.json({ total: 0, perCasella: {} });
    const perCasella = {};
    let total = 0;
    for (const c of caselle) {
      try {
        const n = await withImap(c, async (client) => {
          const st = await client.status('INBOX', { unseen: true });
          return st && typeof st.unseen === 'number' ? st.unseen : 0;
        });
        perCasella[c] = n;
        total += n;
      } catch (_) { perCasella[c] = 0; }
    }
    res.json({ total, perCasella });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Elenco cartelle
secureMail.get('/folders', async (req, res) => {
  try {
    const casella = pickCasella(await userCaselle(req.user), req.query.casella);
    if (!casella) return res.status(403).json({ error: 'Non hai accesso a questa casella.' });
    const data = await withImap(casella, async (client) => await listFolders(client));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Elenco messaggi di una cartella
secureMail.get('/list', async (req, res) => {
  const folder = req.query.folder || 'inbox';
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  try {
    const casella = pickCasella(await userCaselle(req.user), req.query.casella);
    if (!casella) return res.status(403).json({ error: 'Non hai accesso a questa casella.' });
    const messages = await withImap(casella, async (client) => {
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
    const casella = pickCasella(await userCaselle(req.user), req.query.casella);
    if (!casella) return res.status(403).json({ error: 'Non hai accesso a questa casella.' });
    const out = await withImap(casella, async (client) => {
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
    const casella = pickCasella(await userCaselle(req.user), req.query.casella);
    if (!casella) return res.status(403).json({ error: 'Non hai accesso a questa casella.' });
    const out = await withImap(casella, async (client) => {
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

// Segna un messaggio come letto (seen:true) o da leggere (seen:false)
secureMail.post('/flag', async (req, res) => {
  const { uid, folder, casella, seen } = req.body || {};
  const u = parseInt(uid, 10);
  if (!u) return res.status(400).json({ error: 'UID non valido.' });
  try {
    const chosen = pickCasella(await userCaselle(req.user), casella);
    if (!chosen) return res.status(403).json({ error: 'Non hai accesso a questa casella.' });
    await withImap(chosen, async (client) => {
      const { map } = await listFolders(client);
      const path = resolvePath(map, folder || 'inbox');
      const lock = await client.getMailboxLock(path);
      try {
        if (seen) await client.messageFlagsAdd(u, ['\\Seen'], { uid: true });
        else await client.messageFlagsRemove(u, ['\\Seen'], { uid: true });
      } finally { lock.release(); }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Elimina un messaggio: lo sposta nel Cestino; se è già nel Cestino (o non c'è
// un Cestino) lo elimina definitivamente.
secureMail.post('/delete', async (req, res) => {
  const { uid, folder, casella } = req.body || {};
  const u = parseInt(uid, 10);
  if (!u) return res.status(400).json({ error: 'UID non valido.' });
  try {
    const chosen = pickCasella(await userCaselle(req.user), casella);
    if (!chosen) return res.status(403).json({ error: 'Non hai accesso a questa casella.' });
    const out = await withImap(chosen, async (client) => {
      const { map } = await listFolders(client);
      const path = resolvePath(map, folder || 'inbox');
      if (!path) return null;
      const lock = await client.getMailboxLock(path);
      try {
        const inTrash = map.trash && path === map.trash;
        if (!inTrash && map.trash) {
          await client.messageMove(u, map.trash, { uid: true });
          return { moved: true };
        }
        await client.messageDelete(u, { uid: true });
        return { deleted: true };
      } finally { lock.release(); }
    });
    if (out == null) return res.status(404).json({ error: 'Cartella non trovata.' });
    res.json({ ok: true, ...out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Invio (risponde subito; salva copia in "Inviata" in background)
secureMail.post('/send', async (req, res) => {
  const { to, subject, text, html, cc, bcc, casella, fromName, attachments, scheduledAt } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: 'Destinatario e oggetto sono obbligatori.' });
  try {
    const chosen = pickCasella(await userCaselle(req.user), casella);
    if (!chosen) return res.status(403).json({ error: 'Non hai accesso a questa casella.' });
    const acc = accountFor(chosen);
    const att = Array.isArray(attachments) ? attachments.filter(a => a && a.name && a.content) : [];
    const nodeAtt = att.map(a => ({ filename: a.name, content: a.content, encoding: 'base64' }));
    const mailOptions = { from: acc.email, fromName, to, cc: cc || undefined, bcc: bcc || undefined, subject, text: text || undefined, html: html || undefined, attachments: att, scheduledAt: scheduledAt || undefined };

    let messageId;
    if (process.env.BREVO_API_KEY) {
      messageId = await sendViaBrevo(mailOptions);
    } else {
      const transporter = nodemailer.createTransport({
        host: acc.smtpHost, port: acc.smtpPort, secure: acc.smtpPort === 465,
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

// ── Auto-registrazione della chiave digest su Supabase (all'avvio) ──────────────
// Rende posta_config.digest_url/digest_key sempre allineati alla chiave reale del
// backend, così la funzione SQL posta_oggi() può chiamare /mail/digest senza
// sincronizzazioni manuali. Idempotente e silenziosa.
(async function registraDigestKey() {
  const key = process.env.MAIL_DIGEST_KEY || process.env.MAIL_SELFTEST_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !svc) return;
  const url = process.env.MAIL_DIGEST_URL || 'https://api.withusassicurazioni.it/mail/digest';
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/posta_config?id=eq.1`, {
      method: 'PATCH',
      headers: { apikey: svc, Authorization: 'Bearer ' + svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ digest_key: key, digest_url: url }),
    });
  } catch (_) { /* riproverà al prossimo riavvio */ }
})();
