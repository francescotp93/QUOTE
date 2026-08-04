// ═══════════════════════════════════════════════════════════════════════════════
//  MARKETING — il ponte fra IAM e Brevo (Blocco D)
//
//  Perché passa da qui e non dal browser: la chiave di Brevo è un segreto, e
//  index.html è un file pubblico servito a chiunque apra il sito. Se la chiave
//  finisse là, chiunque potrebbe inviare email a nome dell'agenzia. Resta nel
//  .env del VPS e non esce mai da questo processo.
//
//  Regola di Francesco, applicata qui e non solo nell'interfaccia:
//  BOZZA → CONFERMA → INVIO. Le campagne nascono sempre come bozza; l'invio è
//  una chiamata separata che deve dichiarare esplicitamente il numero di
//  destinatari che si aspetta. Se quel numero non corrisponde a quello vero,
//  l'invio si ferma: è la rete contro il "credevo fossero 30 e ne partono 2.252".
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';

const BREVO = 'https://api.brevo.com/v3';

function chiave() {
  const k = process.env.BREVO_API_KEY;
  if (!k) throw new Error('BREVO_API_KEY non configurata sul server.');
  return k;
}

async function brevo(percorso, opzioni = {}) {
  const r = await fetch(BREVO + percorso, {
    ...opzioni,
    headers: {
      'api-key': chiave(),
      'content-type': 'application/json',
      accept: 'application/json',
      ...(opzioni.headers || {})
    }
  });
  const testo = await r.text();
  let corpo = null;
  try { corpo = testo ? JSON.parse(testo) : null; } catch (e) { corpo = { raw: testo.slice(0, 300) }; }
  if (!r.ok) {
    const msg = (corpo && (corpo.message || corpo.code)) || ('HTTP ' + r.status);
    const err = new Error('Brevo: ' + msg);
    err.stato = r.status;
    throw err;
  }
  return corpo;
}

/* Chi può inviare. L'elenco arriva da Supabase (iam_utenti): solo chi ha ruolo
   admin/operatore può far partire una campagna. Leggere le liste è consentito a
   chiunque sia autenticato: vedere non è inviare. */
async function puoInviare(userId) {
  const url = process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key) return false;
  try {
    const r = await fetch(`${url}/rest/v1/iam_utenti?id=eq.${userId}&select=ruolo`, {
      headers: { apikey: key, authorization: 'Bearer ' + key }
    });
    const d = await r.json();
    const ruolo = (d && d[0] && d[0].ruolo) || '';
    return ['admin', 'operatore', 'top_master', 'master'].includes(String(ruolo).toLowerCase());
  } catch (e) { return false; }
}

export const marketingRouter = Router();

/* ── Liste: chi c'è e quanti sono ─────────────────────────────────────────── */
marketingRouter.get('/liste', async (req, res) => {
  try {
    const d = await brevo('/contacts/lists?limit=50&sort=desc');
    const liste = (d.lists || []).map(l => ({
      id: l.id, nome: l.name, contatti: l.uniqueSubscribers || 0, cartella: l.folderId
    })).filter(l => l.contatti > 0);
    res.json({ liste, totale: d.count || liste.length });
  } catch (e) { res.status(e.stato === 401 ? 502 : 500).json({ error: e.message }); }
});

/* ── Mittenti verificati: da qui si scelgono, non si scrivono a mano ──────── */
marketingRouter.get('/mittenti', async (req, res) => {
  try {
    const d = await brevo('/senders');
    res.json({ mittenti: (d.senders || []).map(s => ({ id: s.id, nome: s.name, email: s.email, attivo: !!s.active })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Campagne già fatte, con i risultati ──────────────────────────────────── */
marketingRouter.get('/campagne', async (req, res) => {
  try {
    const d = await brevo('/emailCampaigns?limit=30&sort=desc&statistics=globalStats');
    const campagne = (d.campaigns || []).map(c => {
      const s = (c.statistics && c.statistics.globalStats) || {};
      return {
        id: c.id, nome: c.name, oggetto: c.subject, stato: c.status,
        creata: c.createdAt, inviata: c.sentDate,
        inviate: s.sent || 0, aperte: s.uniqueViews || 0, click: s.uniqueClicks || 0,
        disiscritti: s.unsubscriptions || 0, errori: s.hardBounces || 0
      };
    });
    res.json({ campagne });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Creazione: SEMPRE come bozza ─────────────────────────────────────────── */
marketingRouter.post('/campagna', async (req, res) => {
  const b = req.body || {};
  const nome = String(b.nome || '').trim();
  const oggetto = String(b.oggetto || '').trim();
  const contenuto = String(b.contenuto || '').trim();
  const liste = Array.isArray(b.liste) ? b.liste.map(Number).filter(Boolean) : [];
  const mittente = b.mittente || {};

  if (!nome || !oggetto || !contenuto) return res.status(400).json({ error: 'Servono nome, oggetto e contenuto.' });
  if (!liste.length) return res.status(400).json({ error: 'Serve almeno una lista di destinatari.' });
  if (!mittente.email) return res.status(400).json({ error: 'Serve un mittente verificato.' });
  if (!await puoInviare(req.user.id)) return res.status(403).json({ error: 'Non hai i permessi per creare campagne.' });

  try {
    const d = await brevo('/emailCampaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: nome,
        subject: oggetto,
        sender: { name: mittente.nome || 'With Us Assicurazioni', email: mittente.email },
        htmlContent: contenuto,
        recipients: { listIds: liste }
        // nessuno scheduledAt: la campagna nasce in bozza e resta ferma
      })
    });
    res.json({ ok: true, id: d.id, stato: 'bozza' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Prova: si manda a sé stessi prima di mandarla a duemila persone ──────── */
marketingRouter.post('/campagna/:id/prova', async (req, res) => {
  const dest = Array.isArray(req.body?.destinatari) ? req.body.destinatari.filter(Boolean) : [];
  if (!dest.length) return res.status(400).json({ error: 'Serve almeno un indirizzo di prova.' });
  if (dest.length > 5) return res.status(400).json({ error: 'La prova va a massimo 5 indirizzi.' });
  try {
    await brevo(`/emailCampaigns/${encodeURIComponent(req.params.id)}/sendTest`, {
      method: 'POST', body: JSON.stringify({ emailTo: dest })
    });
    res.json({ ok: true, inviate: dest.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Invio vero ───────────────────────────────────────────────────────────────
   Due protezioni, entrambe volute:
   1. `conferma` deve valere esattamente 'INVIA': un click accidentale non basta;
   2. `destinatari_attesi` deve corrispondere al numero vero di iscritti alle
      liste della campagna. Se qualcuno ha cambiato la lista nel frattempo, o se
      chi invia ha in mente un numero diverso da quello reale, l'invio si ferma
      e lo dice. È la rete contro il "credevo fossero 30".                     */
marketingRouter.post('/campagna/:id/invia', async (req, res) => {
  const b = req.body || {};
  if (b.conferma !== 'INVIA') return res.status(400).json({ error: 'Invio non confermato.' });
  if (!await puoInviare(req.user.id)) return res.status(403).json({ error: 'Non hai i permessi per inviare campagne.' });

  try {
    const c = await brevo(`/emailCampaigns/${encodeURIComponent(req.params.id)}`);
    if (c.status === 'sent') return res.status(409).json({ error: 'Questa campagna è già stata inviata.' });

    const listIds = (c.recipients && c.recipients.lists) || (c.recipients && c.recipients.listIds) || [];
    let veri = 0;
    for (const id of listIds) {
      try { const l = await brevo('/contacts/lists/' + id); veri += (l.uniqueSubscribers || 0); }
      catch (e) { /* una lista non leggibile non deve bloccare il conteggio */ }
    }
    const attesi = Number(b.destinatari_attesi);
    if (!Number.isFinite(attesi) || attesi !== veri) {
      return res.status(409).json({
        error: 'I destinatari non corrispondono: la campagna ne ha ' + veri + ', ne erano stati confermati ' + (b.destinatari_attesi ?? '—') + '. Ricontrolla prima di inviare.',
        destinatari_reali: veri
      });
    }

    await brevo(`/emailCampaigns/${encodeURIComponent(req.params.id)}/sendNow`, { method: 'POST' });
    console.log('[marketing] campagna ' + req.params.id + ' inviata a ' + veri + ' destinatari da ' + req.user.email);
    res.json({ ok: true, inviata: true, destinatari: veri });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default marketingRouter;
