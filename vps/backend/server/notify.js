// ── Notifiche email automatiche del flusso QUOTO (stati pratica + messaggi) ───────
// Invia via Brevo (già configurato) leggendo il preventivo da Supabase (service role).
// Eventi: nuova_richiesta | quotato | emessa | messaggio
import { Router } from 'express';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const STAFF_INBOX = process.env.STAFF_EMAIL || 'intermediari@withusassicurazioni.it';
const NOTIFY_FROM = process.env.NOTIFY_FROM || STAFF_INBOX;
const APP_URL = process.env.QUOTO_URL || 'https://quoto.withusassicurazioni.it';

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function wrap(title, body) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#3b5bfd,#2a45e0);color:#fff;padding:18px 22px;font-size:18px;font-weight:700">⚡ QUOTO</div>
    <div style="padding:22px 24px;color:#2b3346;font-size:15px;line-height:1.55">
      <h2 style="margin:0 0 12px;font-size:18px;color:#1d2740">${title}</h2>
      ${body}
      <div style="margin-top:22px"><a href="${APP_URL}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:700">Apri QUOTO</a></div>
    </div>
    <div style="padding:14px 24px;background:#f8f9fc;color:#8b93a7;font-size:12px">Notifica automatica del portale QUOTO. Non rispondere a questa email.</div>
    <div style="padding:12px 24px;background:#fbfbfd;color:#9aa1b3;font-size:10.5px;line-height:1.5;border-top:1px solid #eef"><b>ATTENZIONE: Privacy Policy - D.Lgs. 196/2003</b><br>Le informazioni contenute in questo messaggio di posta elettronica sono di carattere privato e confidenziale ed esclusivamente rivolte al destinatario sopra indicato. Nel caso aveste ricevuto questo messaggio di posta elettronica per errore, vi comunichiamo che ai sensi di Legge è vietato l'uso, la diffusione, distribuzione o riproduzione da parte di ogni altra persona. Siete pregati di segnalarlo immediatamente, rispondendo al mittente e distruggere quanto ricevuto (compresi i file allegati) senza farne copia o leggerne il contenuto. Grazie.</div>
  </div>`;
}

async function sbGet(path) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  return r.json().catch(() => []);
}
async function sendBrevo(to, subject, html) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY non configurata');
  const recipients = [...new Set((to || []).filter(Boolean))].map(e => ({ email: e }));
  if (!recipients.length) return { skipped: true };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: NOTIFY_FROM, name: 'QUOTO' }, to: recipients, subject, htmlContent: html }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Brevo: ' + (d.message || ('HTTP ' + r.status)));
  return d;
}

export const notifyRouter = Router();
notifyRouter.post('/', async (req, res) => {
  const { event, preventivoId, fromId, fromName, testo } = req.body || {};
  if (!event || !preventivoId) return res.status(400).json({ error: 'event e preventivoId obbligatori' });
  try {
    const rows = await sbGet(`quote_preventivi?id=eq.${encodeURIComponent(preventivoId)}&select=id,prodotto,cliente,premio,creato_da,creato_nome,dati`);
    const prev = Array.isArray(rows) ? rows[0] : null;
    if (!prev) return res.status(404).json({ error: 'preventivo non trovato' });

    const prodotto = prev.prodotto || 'Preventivo';
    const cliente = prev.cliente || '—';
    const datiP = prev.dati || {};
    const riga = `<p><b>Prodotto:</b> ${esc(prodotto)}<br><b>Cliente:</b> ${esc(cliente)}${prev.premio != null ? `<br><b>Premio:</b> € ${Number(prev.premio).toFixed(2)}` : ''}</p>`;
    const collabEmail = async () => {
      // I collaboratori sono censiti su IAM (tabella condivisa iam_utenti)
      const u = await sbGet(`iam_utenti?id=eq.${encodeURIComponent(prev.creato_da)}&select=email`);
      return (Array.isArray(u) && u[0] && u[0].email) ? [u[0].email] : [];
    };
    const clienteEmail = async () => {
      if (datiP.contatto && datiP.contatto.email) return [datiP.contatto.email];
      if (datiP.clienteId) {
        const a = await sbGet(`quote_anagrafiche?id=eq.${encodeURIComponent(datiP.clienteId)}&select=email`);
        if (Array.isArray(a) && a[0] && a[0].email) return [a[0].email];
      }
      return [];
    };

    let to = [], subject = '', html = '';
    if (event === 'nuova_richiesta') {
      to = [STAFF_INBOX];
      subject = 'Nuova richiesta di preventivo — ' + prodotto;
      html = wrap('Nuova richiesta di preventivo', `<p>Il collaboratore <b>${esc(prev.creato_nome || '—')}</b> ha inviato una nuova richiesta da esaminare.</p>${riga}`);
    } else if (event === 'presa_in_carico') {
      to = await collabEmail();
      subject = 'La tua richiesta è in lavorazione — ' + prodotto;
      html = wrap('Richiesta presa in carico', `<p>L'operatore ha preso in carico la tua richiesta e la sta lavorando. Riceverai un avviso quando la proposta sarà pronta.</p>${riga}`);
    } else if (event === 'quotato') {
      to = await collabEmail();
      subject = 'La tua proposta è pronta — ' + prodotto;
      html = wrap('Proposta pronta da emettere', `<p>L'operatore ha allegato la proposta con quotazione. Accedi a QUOTO per vederla e procedere con l'emissione dallo Storico.</p>${riga}`);
    } else if (event === 'emessa_cliente') {
      to = await clienteEmail();
      subject = 'La tua polizza è stata emessa — ' + prodotto;
      const polUrl = datiP.polizza_url || '';
      html = wrap('Polizza emessa',
        `<p>Gentile ${esc(cliente)},<br>la tua polizza <b>${esc(prodotto)}</b> è stata emessa. Grazie per aver scelto With Us Assicurazioni.</p>${riga}
         ${polUrl ? `<div style="margin-top:14px"><a href="${esc(polUrl)}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:700">Scarica la tua polizza</a></div>` : '<p style="color:#6b7488;font-size:13px">Riceverai a breve la documentazione di polizza.</p>'}`);
    } else if (event === 'emessa') {
      to = [STAFF_INBOX];
      subject = 'Polizza emessa — ' + prodotto;
      html = wrap('Polizza emessa', `<p><b>${esc(prev.creato_nome || '—')}</b> ha emesso la polizza.</p>${riga}`);
    } else if (event === 'messaggio') {
      to = (fromId && fromId === prev.creato_da) ? [STAFF_INBOX] : await collabEmail();
      subject = 'Nuovo messaggio — ' + prodotto;
      html = wrap('Nuovo messaggio sul preventivo',
        `<p><b>${esc(fromName || prev.creato_nome || '—')}</b> ti ha scritto un messaggio. Accedi a QUOTO per rispondere.</p>
         <blockquote style="border-left:3px solid #3b5bfd;margin:12px 0;padding:8px 14px;color:#3a4254;background:#f5f7ff;border-radius:0 8px 8px 0">${esc(testo || '')}</blockquote>${riga}`);
    } else {
      return res.status(400).json({ error: 'evento sconosciuto: ' + event });
    }

    const result = await sendBrevo(to, subject, html);
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
