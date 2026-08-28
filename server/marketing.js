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
import { membriGruppo, membriSegmento, sincronizza, sbGet, sbPatch, sbPost, sbDelete } from './marketingDestinatari.js';

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

/* Il token di chi ha fatto la richiesta. Le letture su Supabase viaggiano con
   questo e non con la chiave di servizio: cosi' la Row Level Security vale anche
   dal server, e nessuno sincronizza un gruppo che non potrebbe vedere. */
function tokenUtente(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
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

/* ── Gruppi di anagrafiche: quanti sono e quanti sono davvero contattabili ──
   Tre numeri e non uno. «12 membri» non dice niente a chi deve decidere se
   mandare una campagna: quello che conta è quanti hanno un indirizzo E il
   consenso. Gli altri due numeri dicono cosa fare per recuperarli. */
marketingRouter.get('/gruppi', async (req, res) => {
  try {
    const tok = tokenUtente(req);
    const gruppi = await sbGet(tok, 'quote_gruppi?select=id,nome,tipo,note,brevo_list_id,brevo_sync_il&order=nome.asc');
    const out = [];
    for (const g of gruppi || []) {
      const m = await membriGruppo(tok, g.id);
      out.push({
        id: g.id, nome: g.nome, tipo: g.tipo || 'altro',
        membri: m.totale, contattabili: m.contattabili.length,
        senza_email: m.senzaEmail.length, senza_consenso: m.senzaConsenso.length,
        sincronizzato_il: g.brevo_sync_il
      });
    }
    res.json({ gruppi: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Segmenti: filtri salvati ─────────────────────────────────────────────────
   Il conteggio si rifà ogni volta che si apre la pagina, di proposito: un
   segmento che mostra il numero del giorno in cui è stato creato è una bugia
   che invecchia da sola. */
marketingRouter.get('/segmenti', async (req, res) => {
  try {
    const tok = tokenUtente(req);
    const segm = await sbGet(tok, 'quote_segmenti?select=*&order=nome.asc');
    const out = [];
    for (const sg of segm || []) {
      let conta = { totale: 0, contattabili: [], senzaEmail: [], senzaConsenso: [] };
      try { conta = await membriSegmento(tok, sg.filtri); } catch (e) { /* un filtro rotto non deve svuotare la pagina */ }
      out.push({
        id: sg.id, nome: sg.nome, descrizione: sg.descrizione, filtri: sg.filtri,
        membri: conta.totale, contattabili: conta.contattabili.length,
        senza_email: conta.senzaEmail.length, senza_consenso: conta.senzaConsenso.length,
        sincronizzato_il: sg.brevo_sync_il
      });
    }
    res.json({ segmenti: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

marketingRouter.post('/segmento', async (req, res) => {
  const b = req.body || {};
  const nome = String(b.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Il segmento ha bisogno di un nome.' });
  if (!b.filtri || !Object.keys(b.filtri).length) return res.status(400).json({ error: 'Un segmento senza filtri sarebbe tutta la rubrica.' });
  try {
    const tok = tokenUtente(req);
    const r = await sbPost(tok, 'quote_segmenti', {
      nome, descrizione: b.descrizione || null, filtri: b.filtri, creato_da: req.user.id
    });
    res.json({ ok: true, id: (r[0] || {}).id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

marketingRouter.delete('/segmento/:id', async (req, res) => {
  try {
    await sbDelete(tokenUtente(req), 'quote_segmenti?id=eq.' + encodeURIComponent(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Anteprima: chi riceverebbe, prima di creare qualsiasi cosa ───────────────
   Restituisce anche i primi nomi. Vedere «Rossi Mario, Rossi Anna» prima di
   premere è quello che ferma l'invio sbagliato: un numero da solo non lo fa. */
marketingRouter.post('/anteprima', async (req, res) => {
  const b = req.body || {};
  try {
    const tok = tokenUtente(req);
    const m = b.tipo === 'segmento'
      ? await membriSegmento(tok, b.filtri || (await sbGet(tok, 'quote_segmenti?id=eq.' + encodeURIComponent(b.id) + '&select=filtri'))[0]?.filtri)
      : await membriGruppo(tok, b.id);
    res.json({
      membri: m.totale,
      contattabili: m.contattabili.length,
      senza_email: m.senzaEmail.length,
      senza_consenso: m.senzaConsenso.length,
      esempi: m.contattabili.slice(0, 8).map(a => a.nominativo),
      esclusi: [...m.senzaEmail, ...m.senzaConsenso].slice(0, 8).map(a => ({
        nominativo: a.nominativo, motivo: a.email ? 'consenso mancante' : 'email mancante'
      }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Sincronizzazione verso Brevo ─────────────────────────────────────────────
   Un gruppo (o un segmento) = una lista Brevo, sempre la stessa. Si aggiornano
   gli iscritti e si tolgono quelli che non ne fanno più parte. */
async function listaPer(tok, tipo, id) {
  const tabella = tipo === 'segmento' ? 'quote_segmenti' : 'quote_gruppi';
  const righe = await sbGet(tok, `${tabella}?id=eq.${encodeURIComponent(id)}&select=id,nome,brevo_list_id` + (tipo === 'segmento' ? ',filtri' : ''));
  const riga = righe[0];
  if (!riga) throw new Error('Destinatario non trovato (o non hai i permessi per vederlo).');

  const m = tipo === 'segmento' ? await membriSegmento(tok, riga.filtri) : await membriGruppo(tok, id);
  if (!m.contattabili.length) {
    throw new Error(`«${riga.nome}» non ha nessun destinatario contattabile: `
      + `${m.senzaEmail.length} senza email, ${m.senzaConsenso.length} senza consenso marketing.`);
  }

  const etichetta = (tipo === 'segmento' ? 'IAM · Segmento ' : 'IAM · Gruppo ') + riga.nome;
  const esito = await sincronizza({ nomeLista: etichetta, listIdEsistente: riga.brevo_list_id, contattabili: m.contattabili });

  await sbPatch(tok, `${tabella}?id=eq.${encodeURIComponent(id)}`, {
    brevo_list_id: esito.listId, brevo_sync_il: new Date().toISOString()
  });
  return { ...esito, nome: riga.nome, contattabili: m.contattabili.length };
}

marketingRouter.post('/sincronizza', async (req, res) => {
  const b = req.body || {};
  if (!b.id) return res.status(400).json({ error: 'Serve l\'identificativo del gruppo o del segmento.' });
  if (!await puoInviare(req.user.id)) return res.status(403).json({ error: 'Non hai i permessi per preparare le liste.' });
  try { res.json({ ok: true, ...(await listaPer(tokenUtente(req), b.tipo, b.id)) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Creazione: SEMPRE come bozza ─────────────────────────────────────────────
   I destinatari possono arrivare da tre parti — liste Brevo già esistenti,
   gruppi di anagrafiche, segmenti — ma a Brevo si consegnano sempre come liste:
   gruppi e segmenti vengono risolti e sincronizzati qui, un attimo prima. Così
   la campagna parte su chi c'è ADESSO, non su chi c'era quando il gruppo è
   stato creato. */
marketingRouter.post('/campagna', async (req, res) => {
  const b = req.body || {};
  const nome = String(b.nome || '').trim();
  const oggetto = String(b.oggetto || '').trim();
  const contenuto = String(b.contenuto || '').trim();
  const liste = Array.isArray(b.liste) ? b.liste.map(Number).filter(Boolean) : [];
  const gruppi = Array.isArray(b.gruppi) ? b.gruppi.filter(Boolean) : [];
  const segmenti = Array.isArray(b.segmenti) ? b.segmenti.filter(Boolean) : [];
  const mittente = b.mittente || {};

  if (!nome || !oggetto || !contenuto) return res.status(400).json({ error: 'Servono nome, oggetto e contenuto.' });
  if (!liste.length && !gruppi.length && !segmenti.length) return res.status(400).json({ error: 'Serve almeno un destinatario: una lista, un gruppo o un segmento.' });
  if (!mittente.email) return res.status(400).json({ error: 'Serve un mittente verificato.' });
  if (!await puoInviare(req.user.id)) return res.status(403).json({ error: 'Non hai i permessi per creare campagne.' });

  try {
    const tok = tokenUtente(req);
    const tutte = [...liste];
    const preparate = [];

    for (const g of gruppi) { const e = await listaPer(tok, 'gruppo', g); tutte.push(e.listId); preparate.push(e); }
    for (const sg of segmenti) { const e = await listaPer(tok, 'segmento', sg); tutte.push(e.listId); preparate.push(e); }

    const listIds = [...new Set(tutte)];
    const d = await brevo('/emailCampaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: nome,
        subject: oggetto,
        sender: { name: mittente.nome || 'With Us Assicurazioni', email: mittente.email },
        htmlContent: contenuto,
        recipients: { listIds }
        // nessuno scheduledAt: la campagna nasce in bozza e resta ferma
      })
    });
    res.json({ ok: true, id: d.id, stato: 'bozza', liste: listIds, preparate });
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

/* ── Quanti sono davvero, adesso ──────────────────────────────────────────────
   Serve prima di chiedere conferma: il numero mostrato nella domanda dev'essere
   quello di ADESSO, non quello di quando la bozza è stata creata — nel
   frattempo una lista può essere cresciuta.

   Prima questo conteggio non c'era e l'interfaccia lo ricavava chiamando
   l'invio con una parola d'ordine finta («CONTROLLO») e leggendo il numero
   dentro il messaggio d'errore. Non funzionava — l'errore restituito era
   «Invio non confermato», che il numero non ce l'ha — e comunque contare
   chiedendo di inviare è un modo per farsi male il giorno che qualcuno cambia
   l'ordine dei controlli. */
marketingRouter.get('/campagna/:id/destinatari', async (req, res) => {
  try {
    const c = await brevo(`/emailCampaigns/${encodeURIComponent(req.params.id)}`);
    const listIds = (c.recipients && (c.recipients.lists || c.recipients.listIds)) || [];
    let veri = 0;
    const liste = [];
    for (const id of listIds) {
      const l = await brevo('/contacts/lists/' + (typeof id === 'object' ? id.id : id));
      veri += (l.uniqueSubscribers || 0);
      liste.push({ id: l.id, nome: l.name, contatti: l.uniqueSubscribers || 0 });
    }
    res.json({ destinatari: veri, liste, stato: c.status });
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
      try { const l = await brevo('/contacts/lists/' + (typeof id === 'object' ? id.id : id)); veri += (l.uniqueSubscribers || 0); }
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
