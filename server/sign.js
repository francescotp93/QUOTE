// ── Firma del cliente (OTP) + email privacy/precontrattuale ───────────────────────
//  Flusso:
//   1) L'operatore, dalla pratica, chiama  POST /sign/request  → genera OTP,
//      lo invia al cliente via EMAIL (e SMS se abilitato) e salva lo stato firma.
//   2) Il cliente apre la pagina pubblica firma.html?id=..&t=token :
//        GET  /sign/info    → riepilogo proposta + documenti
//        POST /sign/verify  → verifica OTP + consensi → registra la firma,
//                             invia al cliente l'email privacy + precontrattuale
//                             e la conferma di avvenuta firma.
//  Le scritture sul preventivo usano la service role (il cliente non è loggato).
import { Router } from 'express';
import crypto from 'node:crypto';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const APP_URL = (process.env.QUOTO_URL || 'https://quoto.withusassicurazioni.it').replace(/\/$/, '');
const STAFF_INBOX = process.env.STAFF_EMAIL || 'intermediari@withusassicurazioni.it';
const NOTIFY_FROM = process.env.NOTIFY_FROM || STAFF_INBOX;
const NOTIFY_NAME = process.env.NOTIFY_NAME || 'With Us Assicurazioni';
const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 15);
const SMS_ENABLED = String(process.env.BREVO_SMS_ENABLED || '').toLowerCase() === 'true';
const SMS_SENDER = (process.env.BREVO_SMS_SENDER || 'WithUs').slice(0, 11);

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function genOtp() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }
function genToken() { return crypto.randomBytes(18).toString('base64url'); }

// ── Supabase REST con service role ───────────────────────────────────────────────
function srvKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return key;
}
async function sbGet(path) {
  const key = srvKey();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  return r.json().catch(() => []);
}
async function sbPatch(path, body) {
  const key = srvKey();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ([]));
  if (!r.ok) throw new Error('Supabase: ' + (d.message || ('HTTP ' + r.status)));
  return d;
}
async function getPrev(id) {
  const rows = await sbGet(`quote_preventivi?id=eq.${encodeURIComponent(id)}&select=id,prodotto,cliente,premio,dati`);
  return Array.isArray(rows) ? rows[0] : null;
}
async function setFirma(id, firma, dati) {
  const next = { ...(dati || {}), firma };
  return sbPatch(`quote_preventivi?id=eq.${encodeURIComponent(id)}`, { dati: next });
}

// ── Invio email (Brevo) ──────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY non configurata');
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))].map((e) => ({ email: e }));
  if (!recipients.length) return { skipped: true };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: NOTIFY_FROM, name: NOTIFY_NAME }, to: recipients, subject, htmlContent: html }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Brevo: ' + (d.message || ('HTTP ' + r.status)));
  return d;
}
// ── Invio SMS (Brevo) — attivo solo se BREVO_SMS_ENABLED=true ─────────────────────
async function sendSms(phone, text) {
  if (!SMS_ENABLED) return { skipped: 'sms_disabled' };
  const key = process.env.BREVO_API_KEY;
  if (!key || !phone) return { skipped: true };
  const num = String(phone).replace(/[^0-9+]/g, '');
  const e164 = num.startsWith('+') ? num : (num.length <= 10 ? '+39' + num : '+' + num);
  const r = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: SMS_SENDER, recipient: e164, content: text, type: 'transactional' }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { error: d.message || ('HTTP ' + r.status) };
  return d;
}

// ── Template email ───────────────────────────────────────────────────────────────
function shell(title, body) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0b1437,#1b2a6b);color:#fff;padding:18px 22px;font-size:18px;font-weight:800;letter-spacing:.5px">With Us Assicurazioni</div>
    <div style="padding:24px;color:#2b3346;font-size:15px;line-height:1.6">
      <h2 style="margin:0 0 14px;font-size:19px;color:#1d2740">${title}</h2>${body}
    </div>
    <div style="padding:14px 24px;background:#f8f9fc;color:#8b93a7;font-size:12px">With Us Soc. Coop. · Email automatica, non rispondere a questo messaggio.</div>
  </div>`;
}
function rigaProposta(prev) {
  return `<table style="width:100%;border-collapse:collapse;margin:10px 0 4px">
    <tr><td style="padding:6px 0;color:#6b7488">Prodotto</td><td style="padding:6px 0;text-align:right;font-weight:700">${esc(prev.prodotto || '—')}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7488">Contraente</td><td style="padding:6px 0;text-align:right;font-weight:700">${esc(prev.cliente || '—')}</td></tr>
    ${prev.premio != null ? `<tr><td style="padding:6px 0;color:#6b7488">Premio</td><td style="padding:6px 0;text-align:right;font-weight:700">€ ${Number(prev.premio).toFixed(2)}</td></tr>` : ''}
  </table>`;
}

export const signRouter = Router(); // protetto (operatore)
export const publicSign = Router(); // pubblico (cliente)

// 1) L'operatore invia la richiesta di firma al cliente
signRouter.post('/request', async (req, res) => {
  try {
    const { preventivoId, email, telefono } = req.body || {};
    if (!preventivoId) return res.status(400).json({ error: 'preventivoId obbligatorio' });
    const prev = await getPrev(preventivoId);
    if (!prev) return res.status(404).json({ error: 'preventivo non trovato' });

    const dati = prev.dati || {};
    const cli = email || (dati.contatto && dati.contatto.email) || '';
    const tel = telefono || (dati.contatto && dati.contatto.telefono) || '';
    if (!cli) return res.status(400).json({ error: 'Manca l\'email del cliente: aggiungila prima di inviare la firma.' });

    const otp = genOtp();
    const token = genToken();
    const firma = {
      stato: 'inviata',
      otp_hash: sha(otp + ':' + token),
      scadenza: new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString(),
      token, email: cli, telefono: tel,
      inviata_il: new Date().toISOString(),
      tentativi: 0,
    };
    await setFirma(preventivoId, firma, dati);

    const link = `${APP_URL}/firma.html?id=${encodeURIComponent(preventivoId)}&t=${encodeURIComponent(token)}`;
    const html = shell('Firma la tua proposta assicurativa',
      `<p>Gentile cliente,<br>per concludere la sottoscrizione della tua polizza con <b>With Us Assicurazioni</b>, conferma e firma la proposta qui sotto.</p>
       ${rigaProposta(prev)}
       <p style="margin:18px 0 6px">Il tuo codice di firma (OTP) è:</p>
       <div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1b2a6b;background:#eef2ff;border-radius:12px;padding:14px;text-align:center">${otp}</div>
       <p style="color:#6b7488;font-size:13px">Valido ${OTP_TTL_MIN} minuti. Inseriscilo nella pagina di firma.</p>
       <div style="margin-top:18px"><a href="${link}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700">Apri la pagina di firma</a></div>`);
    const emailRes = await sendEmail(cli, 'Firma la tua proposta — With Us Assicurazioni', html);
    const smsRes = await sendSms(tel, `With Us: il tuo codice di firma è ${otp} (valido ${OTP_TTL_MIN} min). Apri ${link}`);

    res.json({ ok: true, email: cli, telefono: tel, sms: smsRes && !smsRes.skipped ? 'inviato' : 'non inviato', emailRes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stato firma (per l'operatore, refresh UI)
signRouter.get('/status', async (req, res) => {
  try {
    const prev = await getPrev(req.query.id);
    if (!prev) return res.status(404).json({ error: 'non trovato' });
    const f = (prev.dati && prev.dati.firma) || null;
    res.json({ ok: true, firma: f ? { stato: f.stato, inviata_il: f.inviata_il, firmato_il: f.firmato_il, email: f.email } : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2a) Pagina pubblica: riepilogo proposta
publicSign.get('/info', async (req, res) => {
  try {
    const { id, t } = req.query || {};
    const prev = await getPrev(id);
    if (!prev) return res.status(404).json({ error: 'non trovato' });
    const f = (prev.dati && prev.dati.firma) || null;
    if (!f || !t || f.token !== t) return res.status(403).json({ error: 'link non valido' });
    if (f.stato === 'firmata') return res.json({ ok: true, stato: 'firmata', firmato_il: f.firmato_il, prodotto: prev.prodotto, cliente: prev.cliente, premio: prev.premio });
    res.json({ ok: true, stato: f.stato, prodotto: prev.prodotto, cliente: prev.cliente, premio: prev.premio, email: f.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2b) Pagina pubblica: verifica OTP + consensi → registra firma + email privacy
publicSign.post('/verify', async (req, res) => {
  try {
    const { id, t, otp, consensi } = req.body || {};
    const prev = await getPrev(id);
    if (!prev) return res.status(404).json({ error: 'non trovato' });
    const dati = prev.dati || {};
    const f = dati.firma || null;
    if (!f || !t || f.token !== t) return res.status(403).json({ error: 'link non valido' });
    if (f.stato === 'firmata') return res.json({ ok: true, gia_firmata: true });
    if (new Date(f.scadenza).getTime() < Date.now()) return res.status(410).json({ error: 'Codice scaduto. Richiedi un nuovo invio.' });
    if (!(consensi && consensi.privacy && consensi.precontrattuale))
      return res.status(400).json({ error: 'Devi accettare l\'informativa privacy e i documenti precontrattuali.' });
    if (sha(String(otp) + ':' + t) !== f.otp_hash) {
      const tentativi = (f.tentativi || 0) + 1;
      await setFirma(id, { ...f, tentativi }, dati);
      return res.status(401).json({ error: 'Codice OTP errato.', tentativi });
    }

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    const firma = { ...f, stato: 'firmata', firmato_il: new Date().toISOString(), ip, canale: f.telefono ? 'email+sms' : 'email', consensi: { privacy: true, precontrattuale: true, marketing: !!(consensi && consensi.marketing) } };
    delete firma.otp_hash;
    await setFirma(id, firma, dati);

    // Email privacy GDPR + set precontrattuale al cliente + conferma firma
    const privacyHtml = shell('Conferma firma e informativa privacy',
      `<p>Gentile cliente, abbiamo registrato la tua firma sulla proposta. Di seguito i riferimenti e l'informativa.</p>
       ${rigaProposta(prev)}
       <p style="margin-top:8px;color:#6b7488;font-size:13px">Firma elettronica registrata il ${new Date(firma.firmato_il).toLocaleString('it-IT')} (esito OTP positivo).</p>
       <h3 style="margin:20px 0 6px;font-size:15px">Informativa Privacy (Reg. UE 2016/679)</h3>
       <p style="font-size:13px;color:#3a4254">I tuoi dati personali sono trattati da With Us Soc. Coop., in qualità di Titolare, per la gestione del rapporto assicurativo e gli adempimenti di legge. Il conferimento è necessario alla stipula; il trattamento avviene con strumenti elettronici nel rispetto dei principi di liceità e minimizzazione. Hai diritto di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità scrivendo a ${esc(STAFF_INBOX)}. L'informativa completa è disponibile su richiesta e sul nostro sito.</p>
       <h3 style="margin:18px 0 6px;font-size:15px">Set informativo precontrattuale</h3>
       <p style="font-size:13px;color:#3a4254">In allegato/seguito ricevi il Set Informativo del prodotto (DIP, DIP aggiuntivo e Condizioni di Assicurazione), redatto ai sensi del Regolamento IVASS. Ti invitiamo a leggerlo attentamente prima della conclusione del contratto.</p>`);
    let emailRes = null;
    try { emailRes = await sendEmail(firma.email, 'Conferma firma, privacy e set precontrattuale — With Us', privacyHtml); } catch (e) { emailRes = { error: e.message }; }
    // Avvisa lo staff che il cliente ha firmato
    try {
      await sendEmail(STAFF_INBOX, 'Cliente ha firmato la proposta — ' + (prev.prodotto || ''),
        shell('Proposta firmata dal cliente', `<p>Il cliente <b>${esc(prev.cliente || '—')}</b> ha firmato la proposta. La pratica può procedere al pagamento/emissione.</p>${rigaProposta(prev)}`));
    } catch (_) {}

    res.json({ ok: true, firmato_il: firma.firmato_il, emailRes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reinvio OTP (pagina pubblica)
publicSign.post('/resend', async (req, res) => {
  try {
    const { id, t } = req.body || {};
    const prev = await getPrev(id);
    if (!prev) return res.status(404).json({ error: 'non trovato' });
    const dati = prev.dati || {};
    const f = dati.firma || null;
    if (!f || !t || f.token !== t) return res.status(403).json({ error: 'link non valido' });
    if (f.stato === 'firmata') return res.json({ ok: true, gia_firmata: true });
    const otp = genOtp();
    const firma = { ...f, otp_hash: sha(otp + ':' + t), scadenza: new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString(), tentativi: 0 };
    await setFirma(id, firma, dati);
    const link = `${APP_URL}/firma.html?id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`;
    await sendEmail(f.email, 'Nuovo codice di firma — With Us', shell('Nuovo codice di firma',
      `<p>Ecco il tuo nuovo codice di firma:</p><div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1b2a6b;background:#eef2ff;border-radius:12px;padding:14px;text-align:center">${otp}</div>
       <p style="color:#6b7488;font-size:13px">Valido ${OTP_TTL_MIN} minuti.</p><div style="margin-top:14px"><a href="${link}" style="color:#3b5bfd">Apri la pagina di firma</a></div>`));
    await sendSms(f.telefono, `With Us: nuovo codice di firma ${otp} (valido ${OTP_TTL_MIN} min).`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
