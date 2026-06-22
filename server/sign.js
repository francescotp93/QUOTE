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
const SELF_URL = (process.env.SELF_URL || 'https://api.withusassicurazioni.it').replace(/\/$/, '');
const STAFF_INBOX = process.env.STAFF_EMAIL || 'intermediari@withusassicurazioni.it';
const NOTIFY_FROM = process.env.NOTIFY_FROM || STAFF_INBOX;
const NOTIFY_NAME = process.env.NOTIFY_NAME || 'With Us Assicurazioni';
const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 5);
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
const EMAIL_DISCLAIMER = `<div style="padding:12px 24px;background:#fbfbfd;color:#9aa1b3;font-size:10.5px;line-height:1.5;border-top:1px solid #eef"><b>ATTENZIONE: Privacy Policy - D.Lgs. 196/2003</b><br>Le informazioni contenute in questo messaggio di posta elettronica sono di carattere privato e confidenziale ed esclusivamente rivolte al destinatario sopra indicato. Nel caso aveste ricevuto questo messaggio di posta elettronica per errore, vi comunichiamo che ai sensi di Legge è vietato l'uso, la diffusione, distribuzione o riproduzione da parte di ogni altra persona. Siete pregati di segnalarlo immediatamente, rispondendo al mittente e distruggere quanto ricevuto (compresi i file allegati) senza farne copia o leggerne il contenuto. Grazie.</div>`;
function shell(title, body) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0b1437,#1b2a6b);padding:20px 22px;text-align:center">
      <img src="https://quoto.withusassicurazioni.it/withus-logo-white.png" alt="With Us Assicurazioni" style="height:44px;width:auto;display:inline-block">
    </div>
    <div style="padding:24px;color:#2b3346;font-size:15px;line-height:1.6">
      <h2 style="margin:0 0 14px;font-size:19px;color:#1d2740">${title}</h2>${body}
    </div>
    <div style="padding:14px 24px;background:#f8f9fc;color:#8b93a7;font-size:12px">With Us Soc. Coop. · Email automatica, non rispondere a questo messaggio.</div>
    ${EMAIL_DISCLAIMER}
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

// ── Set informativo precontrattuale per prodotto (DIP, DIP Aggiuntivo, Condizioni) ─
const PRECONTRATTUALE = [
  { match: /rc vita privata/i, docs: [
    { nome: 'DIP — Documento Informativo Precontrattuale', url: APP_URL + '/docs/casa/GlobaleCasa_DIP.pdf' },
    { nome: 'DIP Aggiuntivo', url: APP_URL + '/docs/casa/GlobaleCasa_DIP_Aggiuntivo.pdf' },
    { nome: 'Condizioni di Assicurazione', url: APP_URL + '/docs/casa/GlobaleCasa_Condizioni.pdf' },
  ] },
];
function docsForPrev(prev) {
  const p = ((prev && prev.prodotto) || '') + ' ' + ((prev && prev.modulo) || '');
  const m = PRECONTRATTUALE.find((x) => x.match.test(p));
  return m ? m.docs : [];
}
function docsListHtml(docs) {
  if (!docs || !docs.length) return '';
  return `<div style="margin:16px 0;padding:12px 14px;background:#f5f7ff;border:1px solid #e0e6ff;border-radius:10px">
    <div style="font-weight:700;font-size:13px;margin-bottom:8px">📄 Documentazione precontrattuale da leggere</div>
    ${docs.map((d) => `<div style="margin:5px 0"><a href="${esc(d.url)}" style="color:#3b5bfd;text-decoration:none">› ${esc(d.nome)}</a></div>`).join('')}
  </div>`;
}

// Avvia la firma a distanza del cliente (privacy + precontrattuale via OTP email/SMS).
// Riutilizzabile: dall'operatore (/sign/request) e dallo shop online (dopo il pagamento).
export async function avviaFirmaCliente(preventivoId, { email, telefono, prev } = {}) {
  prev = prev || await getPrev(preventivoId);
  if (!prev) throw new Error('preventivo non trovato');
  const dati = prev.dati || {};
  const cli = email || (dati.contatto && dati.contatto.email) || '';
  const tel = telefono || (dati.contatto && dati.contatto.telefono) || '';
  if (!cli) throw new Error('Manca l\'email del cliente: aggiungila prima di inviare la firma.');

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
  const precDocs = [
    { nome: 'Modulo Unico Precontrattuale (MUP)', url: `${SELF_URL}/sign/mup?id=${encodeURIComponent(preventivoId)}&t=${encodeURIComponent(token)}` },
    ...docsForPrev(prev),
  ];
  const html = shell('Firma la tua proposta assicurativa',
    `<p>Gentile cliente,<br>per concludere la sottoscrizione della tua polizza con <b>With Us Assicurazioni</b>, conferma e firma la proposta qui sotto.</p>
     ${rigaProposta(prev)}
     ${docsListHtml(precDocs)}
     <p style="margin:18px 0 6px">Il tuo codice di firma (OTP) è:</p>
     <div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1b2a6b;background:#eef2ff;border-radius:12px;padding:14px;text-align:center">${otp}</div>
     <p style="color:#6b7488;font-size:13px">Valido ${OTP_TTL_MIN} minuti. Inseriscilo nella pagina di firma.</p>
     <div style="margin-top:18px"><a href="${link}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700">Apri la pagina di firma</a></div>`);
  const emailRes = await sendEmail(cli, 'Firma la tua proposta — With Us Assicurazioni', html);
  const smsRes = await sendSms(tel, `With Us: il tuo codice di firma è ${otp} (valido ${OTP_TTL_MIN} min). Apri ${link}`);
  // privacy già firmata dal cliente? (per la firma in presenza in-app)
  let privacyFirmata = false;
  if (dati.clienteId) { try { const a = await getAnag(dati.clienteId); privacyFirmata = !!(a && a.privacy_firma && a.privacy_firma.stato === 'firmata'); } catch (_) {} }
  return { ok: true, email: cli, telefono: tel, token, privacyFirmata, docs: precDocs, sms: smsRes && !smsRes.skipped ? 'inviato' : 'non inviato', emailRes };
}

// 1) L'operatore invia la richiesta di firma al cliente
signRouter.post('/request', async (req, res) => {
  try {
    const { preventivoId, email, telefono } = req.body || {};
    if (!preventivoId) return res.status(400).json({ error: 'preventivoId obbligatorio' });
    const out = await avviaFirmaCliente(preventivoId, { email, telefono });
    res.json(out);
  } catch (e) {
    const msg = e.message || 'Errore';
    const code = /non trovato/.test(msg) ? 404 : /email del cliente/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
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
    // La privacy si firma una volta sola a livello cliente: verifica se già firmata
    let privacyFirmata = false;
    const cid = prev.dati && prev.dati.clienteId;
    if (cid) { try { const a = await getAnag(cid); privacyFirmata = !!(a && a.privacy_firma && a.privacy_firma.stato === 'firmata'); } catch (_) {} }
    const docs = [
      { nome: 'Modulo Unico Precontrattuale (MUP)', url: `${SELF_URL}/sign/mup?id=${encodeURIComponent(prev.id)}&t=${encodeURIComponent(f.token)}` },
      ...docsForPrev(prev),
    ];
    if (f.stato === 'firmata') return res.json({ ok: true, stato: 'firmata', firmato_il: f.firmato_il, prodotto: prev.prodotto, cliente: prev.cliente, premio: prev.premio, privacyFirmata, docs });
    res.json({ ok: true, stato: f.stato, prodotto: prev.prodotto, cliente: prev.cliente, premio: prev.premio, email: f.email, privacyFirmata, docs });
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
       ${docsListHtml([{ nome: 'Modulo Unico Precontrattuale (MUP) firmato', url: `${SELF_URL}/sign/mup?id=${encodeURIComponent(prev.id)}&t=${encodeURIComponent(firma.token)}` }, ...docsForPrev(prev)])}
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

// ═══ PRIVACY del cliente — firmata UNA volta, a livello anagrafica (a priori) ══════
async function getAnag(id) {
  const rows = await sbGet(`quote_anagrafiche?id=eq.${encodeURIComponent(id)}&select=*`);
  return Array.isArray(rows) ? rows[0] : null;
}
async function setAnagPrivacy(id, privacy) {
  return sbPatch(`quote_anagrafiche?id=eq.${encodeURIComponent(id)}`, { privacy_firma: privacy });
}
function anagCliente(a, f) {
  return {
    nominativo: a.nominativo || ((a.cognome || '') + ' ' + (a.nome || '')).trim(),
    codice_fiscale: a.codice_fiscale || '', partita_iva: a.partita_iva || '',
    indirizzo: [a.indirizzo, a.civico].filter(Boolean).join(' '),
    cap: a.cap || '', comune: a.comune || '', provincia: a.provincia || '',
    email: a.email || (f && f.email) || '', telefono: a.cellulare || a.telefono || '',
  };
}

// Carica un documento (HTML/PDF) su Supabase Storage e ritorna l'URL pubblico
async function uploadDoc(path, content, contentType) {
  const key = srvKey();
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/documenti/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'content-type': contentType, 'x-upsert': 'true' },
    body: content,
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Storage: ' + (t || r.status)); }
  return `${SUPABASE_URL}/storage/v1/object/public/documenti/${path}`;
}
function siNo(v) { return v ? 'SÌ' : 'NO'; }
// Documento privacy (Mod. PR01) compilato e firmato — copia digitale stile PDF
function genPrivacyDocHtml(c, cons, firma) {
  const oggi = firma.firmato_il ? new Date(firma.firmato_il).toLocaleString('it-IT') : '';
  const dataBreve = firma.firmato_il ? new Date(firma.firmato_il).toLocaleDateString('it-IT') : '';
  const indir = [c.indirizzo, c.cap, c.comune, c.provincia ? '(' + c.provincia + ')' : ''].filter(Boolean).join(' ');
  const txn = firma.transazione || ('WU-' + sha((firma.token || '') + (firma.firmato_il || '')).slice(0, 12).toUpperCase());
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informativa Privacy firmata — ${esc(c.nominativo || '')}</title>
  <style>
  *{box-sizing:border-box} html,body{margin:0;background:#eceff4;color:#1d2433;font-family:Arial,Helvetica,sans-serif}
  .sheet{max-width:820px;margin:22px auto;background:#fff;border-radius:6px;box-shadow:0 6px 30px rgba(0,0,0,.12);padding:40px 46px}
  .toolbar{max-width:820px;margin:14px auto 0;text-align:right}
  .toolbar button{background:#1b2a6b;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
  .hd{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1b2a6b;padding-bottom:14px;margin-bottom:20px}
  .hd img{height:50px} .t{font-size:12px;color:#566}
  h1{font-size:19px;margin:4px 0 2px} .mod{font-size:11px;color:#889;letter-spacing:.5px}
  h2{font-size:14px;margin:20px 0 8px;color:#1b2a6b;text-transform:uppercase;letter-spacing:.4px}
  table.s{width:100%;border-collapse:collapse;margin:6px 0} table.s td{padding:8px 10px;border:1px solid #dde;font-size:13.5px}
  table.s td.lbl{color:#667;font-size:12px;width:38%;background:#f8f9fc}
  .cons{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:5px 0;padding:9px 12px;background:#f8f9fc;border:1px solid #eef;border-radius:7px;font-size:13px}
  .cons .v{font-weight:800;padding:2px 10px;border-radius:20px;font-size:12px}
  .cons .si{background:#e3f6ea;color:#1e7d46} .cons .no{background:#f0f1f5;color:#7a8194}
  .small{font-size:11.5px;color:#566;line-height:1.55}
  .signwrap{margin-top:38px;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
  .sign-meta{font-size:12.5px;color:#445}
  .signbox{width:360px;max-width:100%}
  .signname{font-family:'Brush Script MT','Segoe Script','Lucida Handwriting',cursive;font-size:22px;color:#11224d;text-align:center;line-height:1.1;padding:6px 0 5px;border-bottom:1px solid #555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .signlabel{font-size:11px;color:#778;text-transform:uppercase;letter-spacing:.5px;text-align:center;margin-top:5px}
  .signatt{margin-top:12px;font-size:11px;color:#1e7d46;background:#e8f7ee;border:1px solid #b6e6c8;border-radius:8px;padding:9px 11px;line-height:1.5}
  .ft{margin-top:22px;font-size:10.5px;color:#99a;text-align:center;border-top:1px solid #eef;padding-top:10px}
  @media print{html,body{background:#fff} .toolbar{display:none} .sheet{box-shadow:none;margin:0;max-width:none;padding:18px}}
  </style></head><body>
  <div class="toolbar"><button onclick="window.print()">⤓ Scarica / Stampa PDF</button></div>
  <div class="sheet">
    <div class="hd"><img src="https://quoto.withusassicurazioni.it/withus-logo.png" alt="With Us">
      <div><div class="t"><b>WITH US SOCIETA' COOPERATIVA</b> — Intermediario assicurativo</div>
      <div class="t">Vico Giunone 3, 91027 Paceco (TP) · RUI A000747484 del 14-03-2024 · amministrazione@withusassicurazioni.it</div></div></div>
    <h1>Scheda Cliente e Consenso al trattamento dei dati</h1>
    <div class="mod">Mod. PR01 · Reg. UE 2016/679 (GDPR)</div>
    <h2>Dati del contraente</h2>
    <table class="s">
     <tr><td class="lbl">Nome / Cognome o Denominazione</td><td><b>${esc(c.nominativo || '—')}</b></td></tr>
     <tr><td class="lbl">Codice fiscale / P.IVA</td><td>${esc(c.codice_fiscale || c.partita_iva || '—')}</td></tr>
     <tr><td class="lbl">Indirizzo</td><td>${esc(indir) || '—'}</td></tr>
     <tr><td class="lbl">Email</td><td>${esc(c.email || '—')}</td></tr>
     <tr><td class="lbl">Cellulare</td><td>${esc(c.telefono || '—')}</td></tr>
    </table>
    <h2>Consenso al trattamento (art. 7 GDPR)</h2>
    <p class="small">Il sottoscritto dichiara di aver ricevuto copia dell'informativa privacy (Mod. PR01), di averne preso visione, e:</p>
    ${[['Dati di categorie particolari per consulenza e distribuzione assicurativa', cons.categorie_particolari],
       ['Conservazione dei contratti consegnati per la valutazione delle esigenze', cons.conservazione],
       ['Marketing con strumenti tradizionali (posta, telefono)', cons.marketing_tradizionale],
       ['Marketing con strumenti elettronici (email, SMS, WhatsApp)', cons.marketing_elettronico],
       ['Comunicazione a soggetti terzi per finalità di marketing', cons.terzi]]
      .map(([t, v]) => `<div class="cons"><span>${t}</span><span class="v ${v ? 'si' : 'no'}">${siNo(v)}</span></div>`).join('')}
    <h2>Informativa (estratto artt. 13-14 GDPR)</h2>
    <p class="small">Titolare del trattamento: WITH US SOCIETA' COOPERATIVA, Vico Giunone 3, Paceco (TP), tel. 09231963896, email amministrazione@withusassicurazioni.it, PEC withus.coop@pec.it, RUI A000747484, soggetta a controllo IVASS. I dati sono trattati per adempimenti normativi, per l'attività di consulenza e intermediazione assicurativa e attività accessorie e — previo consenso — per finalità di marketing (basi giuridiche artt. 6 e 9 GDPR). Conservazione per la durata del rapporto e per i termini di legge (fino a 10 anni; 20 per i rami vita). L'interessato può esercitare i diritti di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità (artt. 15-22 GDPR) scrivendo al Titolare, e proporre reclamo al Garante (www.garanteprivacy.it). Il conferimento per le finalità a) e b) è necessario alla gestione del rapporto; per c) e d) è facoltativo.</p>
    <div class="signwrap">
      <div class="sign-meta">Luogo e data: <b>${esc(c.comune || '—')}, ${esc(dataBreve)}</b></div>
      <div class="signbox">
        <div class="signname">${esc(c.nominativo || '')}</div>
        <div class="signlabel">Il Contraente — firma</div>
        <div class="signatt"><b>✓ Firma Elettronica Avanzata</b> apposta dal contraente con codice OTP via ${esc(firma.canale || 'email')}${firma.ip ? (' · IP ' + esc(firma.ip)) : ''} il <b>${esc(oggi)}</b>.<br>Codice transazione: <b>${esc(txn)}</b> — ai sensi del Reg. eIDAS 910/2014 e del CAD.</div>
      </div>
    </div>
    <div class="ft">Documento generato elettronicamente da With Us · ${esc(txn)}</div>
  </div></body></html>`;
}

// ── MUP (Allegato 3) — identificazione dell'intermediario che ha fatto la pratica ─
function vesteDaRui(rui) {
  const r = String(rui || '').trim().toUpperCase();
  if (r.startsWith('A')) return "Responsabile dell'attività di intermediazione";
  if (r.startsWith('E')) return 'Collaboratore di intermediario';
  return '';
}
async function getCollaboratore(uid) {
  if (!uid) return null;
  // 1) Registro collaboratori QUOTO collegato per iam_id (dati completi: RUI, data, veste)
  try { const r = await sbGet(`quote_collaboratori?iam_id=eq.${encodeURIComponent(uid)}&select=*&limit=1`); if (Array.isArray(r) && r[0]) return r[0]; } catch (_) {}
  // 2) Profilo utente IAM (nome, cognome, RUI)
  let iu = null;
  try { const u = await sbGet(`iam_utenti?id=eq.${encodeURIComponent(uid)}&select=nome,cognome,email,rui`); if (Array.isArray(u) && u[0]) iu = u[0]; } catch (_) {}
  // 2b) Arricchisci dal registro collaboratori tramite email (per RUI/data/veste)
  if (iu && iu.email) {
    try {
      const r = await sbGet(`quote_collaboratori?email=ilike.${encodeURIComponent(iu.email)}&select=*&limit=1`);
      if (Array.isArray(r) && r[0]) return { ...r[0], nome: r[0].nome || iu.nome, cognome: r[0].cognome || iu.cognome, rui_numero: r[0].rui_numero || iu.rui };
    } catch (_) {}
  }
  if (iu) return { nome: iu.nome, cognome: iu.cognome, email: iu.email, rui_numero: iu.rui, rui_data: '', veste: '' };
  return null;
}
function genMupDocHtml(im, firma, cliente) {
  im = im || {}; firma = firma || {};
  const nome = (((im.cognome || '') + ' ' + (im.nome || '')).trim()) || im.nominativo || '—';
  const rui = [im.rui_numero, im.rui_data].filter(Boolean).join(' del ') || '—';
  const veste = im.veste || vesteDaRui(im.rui_numero) || '—';
  const firmata = firma.stato === 'firmata';
  const oggi = firma.firmato_il ? new Date(firma.firmato_il).toLocaleString('it-IT') : '';
  const dataBreve = firma.firmato_il ? new Date(firma.firmato_il).toLocaleDateString('it-IT') : new Date().toLocaleDateString('it-IT');
  const txn = firma.transazione || ('WU-' + sha((firma.token || '') + (firma.firmato_il || '')).slice(0, 12).toUpperCase());
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Modulo Unico Precontrattuale (MUP) — With Us</title>
  <style>
  *{box-sizing:border-box} html,body{margin:0;background:#eceff4;color:#1d2433;font-family:Arial,Helvetica,sans-serif}
  .sheet{max-width:820px;margin:22px auto;background:#fff;border-radius:6px;box-shadow:0 6px 30px rgba(0,0,0,.12);padding:40px 46px}
  .toolbar{max-width:820px;margin:14px auto 0;text-align:right}
  .toolbar button{background:#1b2a6b;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
  .hd{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1b2a6b;padding-bottom:14px;margin-bottom:20px}
  .hd img{height:50px} .t{font-size:12px;color:#566}
  h1{font-size:19px;margin:4px 0 2px} .mod{font-size:11px;color:#889;letter-spacing:.5px}
  h2{font-size:14px;margin:20px 0 8px;color:#1b2a6b}
  table.s{width:100%;border-collapse:collapse;margin:8px 0} table.s th,table.s td{padding:8px 10px;border:1px solid #dde;font-size:13px;text-align:left} table.s th{background:#1b2a6b;color:#fff;font-size:11.5px}
  .small{font-size:11.5px;color:#566;line-height:1.55} .pt{margin:8px 0;font-size:13px} .pt b{color:#1b2a6b}
  .signwrap{margin-top:28px;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
  .sign-meta{font-size:12.5px;color:#445}
  .signbox{width:360px;max-width:100%}
  .signname{font-family:'Brush Script MT','Segoe Script','Lucida Handwriting',cursive;font-size:22px;color:#11224d;text-align:center;line-height:1.1;padding:6px 0 5px;border-bottom:1px solid #555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .signlabel{font-size:11px;color:#778;text-transform:uppercase;letter-spacing:.5px;text-align:center;margin-top:5px}
  .signatt{margin-top:12px;font-size:11px;color:#1e7d46;background:#e8f7ee;border:1px solid #b6e6c8;border-radius:8px;padding:9px 11px;line-height:1.5}
  .ft{margin-top:22px;font-size:10.5px;color:#99a;text-align:center;border-top:1px solid #eef;padding-top:10px}
  @media print{html,body{background:#fff} .toolbar{display:none} .sheet{box-shadow:none;margin:0;max-width:none;padding:18px}}
  </style></head><body>
  <div class="toolbar"><button onclick="window.print()">⤓ Scarica / Stampa PDF</button></div>
  <div class="sheet">
    <div class="hd"><img src="https://quoto.withusassicurazioni.it/withus-logo.png" alt="With Us">
      <div><div class="t"><b>WITH US SOCIETA' COOPERATIVA</b> — Intermediario assicurativo</div>
      <div class="t">Vico Giunone 3, 91027 Paceco (TP) · RUI A000747484 del 14-03-2024</div></div></div>
    <h1>Modulo Unico Precontrattuale (MUP) per i prodotti assicurativi</h1>
    <div class="mod">Allegato 3 · art. 120-quater Codice delle Assicurazioni Private</div>
    <p class="small">Il distributore ha l'obbligo di consegnare/trasmettere al contraente il presente Modulo prima della sottoscrizione della proposta o del contratto di assicurazione.</p>
    <h2>Sezione I — Distributore che entra in contatto con il contraente</h2>
    <p class="small">Gli estremi identificativi e di iscrizione dell'intermediario possono essere verificati consultando il Registro Unico degli Intermediari (RUI) sul sito IVASS (www.ivass.it).</p>
    <table class="s"><tr><th>Cognome e Nome</th><th>Iscrizione RUI (n. e data)</th><th>Veste in cui opera</th></tr>
      <tr><td><b>${esc(nome)}</b></td><td>${esc(rui)}</td><td>${esc(veste)}</td></tr></table>
    <div class="pt"><b>c.</b> Sede legale dell'intermediario per cui distribuisce il contratto: VICO GIUNONE 3 — 91027 PACECO (TP).</div>
    <div class="pt"><b>d.</b> Recapito telefonico: 09231963896 · Email: amministrazione@withusassicurazioni.it · PEC: withus.coop@pec.it</div>
    <div class="pt"><b>e.</b> Sito internet: https://assicurazionetrapani.it/</div>
    <div class="pt"><b>f.</b> Istituto competente a vigilare sull'attività di distribuzione: IVASS — Istituto per la Vigilanza sulle Assicurazioni.</div>
    <div class="pt"><b>g.</b> L'intermediario per cui è svolta l'attività di distribuzione del contratto è: <b>WITH US SOCIETA' COOPERATIVA</b>, sede legale Vico Giunone 3 — 91027 Paceco (TP), iscrizione RUI <b>A000747484 del 14-03-2024, sezione A</b>.</div>
    <p class="small" style="margin-top:14px">L'elenco completo delle imprese di assicurazione con cui l'intermediario opera è disponibile su richiesta e presso i recapiti sopra indicati.</p>
    <h2>Ricevuta del contraente</h2>
    <p class="small">Il contraente dichiara di aver ricevuto il presente Modulo Unico Precontrattuale prima della sottoscrizione della proposta/contratto.</p>
    <div class="signwrap">
      <div class="sign-meta">Luogo e data: <b>${esc(dataBreve)}</b></div>
      <div class="signbox">
        <div class="signname">${esc(cliente || '')}</div>
        <div class="signlabel">Il Contraente — firma per ricevuta</div>
        ${firmata
          ? `<div class="signatt"><b>✓ Firma Elettronica Avanzata</b> apposta dal contraente con codice OTP via ${esc(firma.canale || 'email')}${firma.ip ? (' · IP ' + esc(firma.ip)) : ''} il <b>${esc(oggi)}</b>.<br>Codice transazione: <b>${esc(txn)}</b> — ai sensi del Reg. eIDAS 910/2014.</div>`
          : `<div class="signatt" style="color:#999;background:#f5f5f7;border-color:#eee">In attesa di firma del contraente.</div>`}
      </div>
    </div>
    <div class="ft">Documento generato elettronicamente da With Us — Modulo Unico Precontrattuale (Allegato 3)${firmata ? ' · ' + esc(txn) : ''}</div>
  </div></body></html>`;
}
// MUP del collaboratore della pratica — rigenerato al volo (validato col token firma)
publicSign.get('/mup', async (req, res) => {
  try {
    const { id, t } = req.query || {};
    const rows = await sbGet(`quote_preventivi?id=eq.${encodeURIComponent(id)}&select=id,cliente,creato_da,dati`);
    const prev = Array.isArray(rows) ? rows[0] : null;
    if (!prev) return res.status(404).send('Documento non trovato');
    const f = (prev.dati && prev.dati.firma) || null;
    if (!f || !t || f.token !== t) return res.status(403).send('Link non valido');
    const im = await getCollaboratore(prev.creato_da);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(genMupDocHtml(im || {}, f, prev.cliente));
  } catch (e) { res.status(500).send('Errore: ' + e.message); }
});

// Avvia la firma privacy a distanza del cliente (a livello anagrafica). Riutilizzabile
// dall'operatore (/privacy/request) e dallo shop online (landing lato cliente).
export async function avviaFirmaPrivacy(clienteId, { email, telefono } = {}) {
  if (!clienteId) throw new Error('clienteId obbligatorio');
  const a = await getAnag(clienteId);
  if (!a) throw new Error('cliente non trovato');
  const cli = email || a.email || '';
  const tel = telefono || a.cellulare || a.telefono || '';
  if (!cli) throw new Error('Manca l\'email del cliente: aggiungila prima di inviare la privacy.');
  const otp = genOtp(); const token = genToken();
  const privacy = { stato: 'inviata', otp_hash: sha(otp + ':' + token), scadenza: new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString(), token, email: cli, telefono: tel, inviata_il: new Date().toISOString(), tentativi: 0 };
  await setAnagPrivacy(clienteId, privacy);
  const link = `${APP_URL}/firma.html?tipo=privacy&id=${encodeURIComponent(clienteId)}&t=${encodeURIComponent(token)}`;
  const html = shell('Firma l\'informativa privacy',
    `<p>Gentile ${esc(a.nominativo || 'cliente')},<br>per completare la tua posizione con <b>With Us Assicurazioni</b>, ti chiediamo di firmare l'informativa privacy (Reg. UE 2016/679).</p>
     <p style="margin:18px 0 6px">Il tuo codice di firma (OTP) è:</p>
     <div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1b2a6b;background:#eef2ff;border-radius:12px;padding:14px;text-align:center">${otp}</div>
     <p style="color:#6b7488;font-size:13px">Valido ${OTP_TTL_MIN} minuti.</p>
     <div style="margin-top:18px"><a href="${link}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700">Apri e firma la privacy</a></div>`);
  const emailRes = await sendEmail(cli, 'Firma l\'informativa privacy — With Us Assicurazioni', html);
  const smsRes = await sendSms(tel, `With Us: codice firma privacy ${otp} (valido ${OTP_TTL_MIN} min). ${link}`);
  return { ok: true, email: cli, token, sms: smsRes && !smsRes.skipped ? 'inviato' : 'non inviato', emailRes };
}

// Operatore: invia la richiesta di firma privacy al cliente
signRouter.post('/privacy/request', async (req, res) => {
  try {
    const { clienteId, email, telefono } = req.body || {};
    const out = await avviaFirmaPrivacy(clienteId, { email, telefono });
    res.json(out);
  } catch (e) {
    const msg = e.message || 'Errore';
    const code = /obbligatorio/.test(msg) ? 400 : /non trovato/.test(msg) ? 404 : /email del cliente/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

// Operatore: stato privacy del cliente
signRouter.get('/privacy/status', async (req, res) => {
  try {
    const a = await getAnag(req.query.id);
    if (!a) return res.status(404).json({ error: 'non trovato' });
    const f = a.privacy_firma || null;
    res.json({ ok: true, privacy: f ? { stato: f.stato, inviata_il: f.inviata_il, firmato_il: f.firmato_il, email: f.email } : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Documento privacy firmato — rigenerato al volo (link nell'email e nei Documenti)
publicSign.get('/privacy/doc', async (req, res) => {
  try {
    const { id, t } = req.query || {};
    const a = await getAnag(id);
    if (!a) return res.status(404).send('Documento non trovato');
    const f = a.privacy_firma || null;
    if (!f || !t || f.token !== t) return res.status(403).send('Link non valido');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(genPrivacyDocHtml(anagCliente(a, f), f.consensi || {}, f));
  } catch (e) { res.status(500).send('Errore: ' + e.message); }
});

// Cliente: dati per la pagina di firma privacy
publicSign.get('/privacy/info', async (req, res) => {
  try {
    const { id, t } = req.query || {};
    const a = await getAnag(id);
    if (!a) return res.status(404).json({ error: 'non trovato' });
    const f = a.privacy_firma || null;
    if (!f || !t || f.token !== t) return res.status(403).json({ error: 'link non valido' });
    const cliente = anagCliente(a, f);
    if (f.stato === 'firmata') return res.json({ ok: true, stato: 'firmata', firmato_il: f.firmato_il, cliente });
    res.json({ ok: true, stato: f.stato, cliente });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cliente: verifica OTP e registra la firma privacy
publicSign.post('/privacy/verify', async (req, res) => {
  try {
    const { id, t, otp, consensi } = req.body || {};
    const a = await getAnag(id);
    if (!a) return res.status(404).json({ error: 'non trovato' });
    const f = a.privacy_firma || null;
    if (!f || !t || f.token !== t) return res.status(403).json({ error: 'link non valido' });
    if (f.stato === 'firmata') return res.json({ ok: true, gia_firmata: true });
    if (new Date(f.scadenza).getTime() < Date.now()) return res.status(410).json({ error: 'Codice scaduto. Richiedi un nuovo invio.' });
    if (sha(String(otp) + ':' + t) !== f.otp_hash) {
      await setAnagPrivacy(id, { ...f, tentativi: (f.tentativi || 0) + 1 });
      return res.status(401).json({ error: 'Codice OTP errato.' });
    }
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    const privacy = { ...f, stato: 'firmata', firmato_il: new Date().toISOString(), ip, canale: f.telefono ? 'email+sms' : 'email', consensi: consensi || {} };
    privacy.transazione = 'WU-' + sha(privacy.token + privacy.firmato_il).slice(0, 12).toUpperCase();
    delete privacy.otp_hash;
    // Documento privacy firmato: generato al volo dal backend (link sempre valido)
    privacy.doc_url = `${SELF_URL}/sign/privacy/doc?id=${encodeURIComponent(id)}&t=${encodeURIComponent(privacy.token)}`;
    const docUrl = privacy.doc_url;
    await setAnagPrivacy(id, privacy);
    try {
      await sendEmail(f.email, 'Conferma firma privacy — With Us', shell('Informativa privacy firmata',
        `<p>Abbiamo registrato la firma della tua informativa privacy il ${new Date(privacy.firmato_il).toLocaleString('it-IT')}.</p>
         ${docUrl ? `<div style="margin:14px 0"><a href="${docUrl}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:700">Apri il documento firmato</a></div>` : ''}
         <p style="font-size:13px;color:#3a4254">I tuoi dati personali sono trattati da With Us Soc. Coop. ai sensi del Reg. UE 2016/679 per la gestione del rapporto assicurativo e gli adempimenti di legge. Puoi esercitare i tuoi diritti (accesso, rettifica, cancellazione, ecc.) scrivendo a amministrazione@withusassicurazioni.it.</p>`));
    } catch (_) {}
    res.json({ ok: true, firmato_il: privacy.firmato_il, doc_url: docUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
