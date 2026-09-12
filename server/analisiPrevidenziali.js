// ── QUOTO · L'archivio delle analisi previdenziali ───────────────────────────
/* Ogni foglio che esce dalla stampante lascia qui la sua riga: chi l'ha fatto,
   per chi, con quale versione delle regole e con quali numeri di legge.

   IL MOTIVO NON E' L'ORDINE. E' che i parametri cambiano — per decreto, ogni
   due anni — e un'analisi stampata l'anno scorso non si puo' rifare uguale:
   i coefficienti di allora non ci sono piu' da nessuna parte. Se il cliente
   torna e chiede perche' il numero e' cambiato, o si mostra la scheda di quel
   giorno o si tira a indovinare davanti a un documento firmato.

   DUE REGOLE DI QUESTA PORTA:

   1. IL COLLABORATORE LO DICE IL TOKEN, NON IL BROWSER. `creato_da` si prende
      dal token verificato e da nessun'altra parte. Se arrivasse dal corpo
      della richiesta, chiunque potrebbe intestare i propri fogli a un altro —
      e un archivio che si puo' intestare a piacere non e' tracciabilita': e'
      una lista di nomi.
   2. IL SALVATAGGIO NON PUO' FERMARE LA STAMPA. Se questa porta e' chiusa il
      foglio esce lo stesso: e' in mano a un consulente seduto davanti a un
      cliente. Ma il consulente lo deve vedere, che non e' stato archiviato —
      il silenzio, qui, sarebbe la scelta peggiore. Quella parte sta nella
      schermata; qui si risponde con un errore chiaro. */
import { Router } from 'express';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Una scheda e' fatta di numeri e di poche righe di testo: qualche decina di
   migliaia di byte. Mezzo mega vuol dire che qualcosa non va — un oggetto del
   browser finito dentro per sbaglio — e va fermato qui, non nel database. */
export const LIMITE_BYTE = 512 * 1024;

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
}

/* La riga da scrivere, costruita a partire da quello che manda la schermata e
   da chi e' collegato. Pura: nessuna rete, cosi' le prove la controllano tutta. */
export function preparaRiga(corpo, utente) {
  const r = (corpo && corpo.riga) || null;
  if (!r || typeof r !== 'object') return { ok: false, errore: 'Manca la scheda dell\'analisi da archiviare.' };
  if (!utente || !UUID.test(String(utente.id || ''))) {
    return { ok: false, errore: 'Non riesco a capire chi sta salvando: rifai il collegamento.' };
  }
  /* La versione delle regole la scrive il motore che ha fatto il conto. Senza,
     la riga non serve a niente: fra un anno non si saprebbe con quale codice
     era stato calcolato, che e' esattamente la domanda per cui esiste. */
  if (!r.versione_motore || typeof r.versione_motore !== 'string') {
    return { ok: false, errore: 'La scheda non porta la versione delle regole di calcolo.' };
  }
  if (!r.risultato || typeof r.risultato !== 'object') return { ok: false, errore: 'La scheda non porta il risultato.' };
  if (!r.parametri_usati || typeof r.parametri_usati !== 'object') {
    return { ok: false, errore: 'La scheda non porta i parametri usati.' };
  }

  const riga = {
    /* MAI da `r.creato_da`: vedi la regola 1 in cima al file. */
    creato_da: utente.id,
    anagrafica_id: UUID.test(String(r.anagrafica_id || '')) ? r.anagrafica_id : null,
    titolo: String(r.titolo || 'Analisi previdenziale').trim().slice(0, 200),
    dati: r.dati && typeof r.dati === 'object' ? r.dati : {},
    obiettivo: r.obiettivo && typeof r.obiettivo === 'object' ? r.obiettivo : {},
    scelte: r.scelte && typeof r.scelte === 'object' ? r.scelte : {},
    risultato: r.risultato,
    parametri_usati: r.parametri_usati,
    versione_motore: r.versione_motore,
    nota: r.nota ? String(r.nota).slice(0, 2000) : null,
  };

  const peso = Buffer.byteLength(JSON.stringify(riga), 'utf8');
  if (peso > LIMITE_BYTE) {
    return { ok: false, errore: 'La scheda è troppo grande (' + Math.round(peso / 1024) + ' KB): non è stata archiviata.' };
  }
  return { ok: true, riga };
}

/* ── CHI VEDE COSA ────────────────────────────────────────────────────────
   Il backend usa la chiave di servizio, che SCAVALCA le RLS: la riservatezza
   non la garantiscono le policy del database, la garantisce questo codice.
   E' la stessa scelta, e lo stesso filtro, dei preventivi (server/preventivi.js):
   il collaboratore vede le proprie analisi, lo staff con ?scope=all le vede
   tutte. Averne due diverse sarebbe il modo piu' rapido perche' una delle due
   diventi sbagliata senza che nessuno se ne accorga. */
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase();
const STAFF_RUOLI = ['admin', 'master', 'top_master'];

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error('Supabase select: ' + (await r.text()).slice(0, 200));
  return r.json();
}

export async function isStaff(req) {
  const email = ((req.user && req.user.email) || '').toLowerCase();
  if (email && SUPER_ADMIN_EMAIL && email === SUPER_ADMIN_EMAIL) return true;
  try {
    const u = await sbGet(`quote_utenti?id=eq.${encodeURIComponent(req.user.id)}&select=ruolo&limit=1`);
    return !!(u[0] && STAFF_RUOLI.includes(String(u[0].ruolo || '').toLowerCase()));
  } catch (_) { return false; }
}

/* Le colonne che servono per un ELENCO. Non si tira su `risultato` e
   `parametri_usati`: sono l'analisi intera, decine di KB per riga, e in un
   elenco non si guardano. Chi apre una scheda la chiede per id. */
export const COLONNE_ELENCO = 'id,creata_il,creato_da,anagrafica_id,titolo,dati,obiettivo,versione_motore,nota';

/* LE DUE DECISIONI CHE CONTANO, ESTRATTE E PURE. Dentro una rotta che parla
   con Supabase non si provano senza accendere mezzo mondo; qui si provano con
   una riga. E sono esattamente le due dove un errore non si vede: una query
   senza filtro mostra i clienti di un collega, e un controllo di proprieta'
   sbagliato li lascia aprire. */
export function parametriElenco(query, utenteId, staff) {
  const q = query || {};
  const scopeAll = !!staff && q.scope === 'all';
  const p = new URLSearchParams();
  p.set('select', COLONNE_ELENCO);
  p.set('order', 'creata_il.desc');
  p.set('limit', String(Math.min(Math.max(Number(q.limit) || 50, 1), 200)));
  /* IL FILTRO C'E' SEMPRE, tranne per lo staff che ha chiesto tutto. */
  if (!scopeAll) p.set('creato_da', 'eq.' + utenteId);
  if (q.anagrafica_id !== undefined) {
    const a = String(q.anagrafica_id || '');
    /* Un riferimento storto NON vale «tutte»: senza questo controllo la
       scheda di Mario mostrerebbe le analisi di chiunque. */
    if (!UUID.test(a)) return { ok: false, errore: 'Il riferimento anagrafica non è valido.' };
    p.set('anagrafica_id', 'eq.' + a);
  }
  return { ok: true, scopeAll, params: p };
}

export function puoVedere(riga, utenteId, staff) {
  if (!riga) return false;
  return riga.creato_da === utenteId || !!staff;
}

export const analisiPrevRouter = Router();

analisiPrevRouter.post('/', async (req, res) => {
  const p = preparaRiga(req.body, req.user);
  if (!p.ok) return res.status(400).json({ error: p.errore });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/quote_analisi_previdenziali`, {
      method: 'POST', headers: sbHeaders(), body: JSON.stringify(p.riga),
    });
    const testo = await r.text();
    if (!r.ok) throw new Error('Supabase insert: ' + testo.slice(0, 300));
    const scritte = JSON.parse(testo || '[]');
    res.json({ ok: true, id: (scritte[0] && scritte[0].id) || null, creata_il: (scritte[0] && scritte[0].creata_il) || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── L'ELENCO ─────────────────────────────────────────────────────────────
   `?anagrafica_id=<uuid>` e' il caso che serve alla scheda cliente: tutte le
   analisi fatte a quella persona, dalla piu' recente. Senza filtro torna le
   ultime dell'operatore.

   NIENTE `anagrafica_id` NON VALIDO TRATTATO COME «TUTTE». Se arrivasse una
   stringa storta e la si ignorasse, la scheda di Mario mostrerebbe le analisi
   di tutti: si rifiuta e si dice perche'. */
analisiPrevRouter.get('/', async (req, res) => {
  try {
    const staff = await isStaff(req);
    const q = parametriElenco(req.query, req.user.id, staff);
    if (!q.ok) return res.status(400).json({ error: q.errore });
    const righe = await sbGet(`quote_analisi_previdenziali?${q.params.toString()}`);
    res.json({ ok: true, staff, scope: q.scopeAll ? 'all' : 'own', items: righe });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── UNA SCHEDA INTERA ────────────────────────────────────────────────────
   Qui si tira su tutto, parametri di quel giorno compresi: e' il motivo per
   cui l'archivio esiste. Il controllo di proprieta' si fa DOPO aver letto la
   riga, sul suo `creato_da`: filtrare nella query e basta direbbe «non
   trovata» a chi non ha il permesso, che e' la risposta giusta per un id
   inesistente ma non per uno esistente e altrui. */
analisiPrevRouter.get('/:id', async (req, res) => {
  try {
    if (!UUID.test(String(req.params.id || ''))) return res.status(400).json({ error: 'Riferimento non valido.' });
    const righe = await sbGet(`quote_analisi_previdenziali?id=eq.${encodeURIComponent(req.params.id)}&select=*&limit=1`);
    const riga = righe[0];
    if (!riga) return res.status(404).json({ error: 'Analisi non trovata.' });
    if (!puoVedere(riga, req.user.id, await isStaff(req))) {
      return res.status(403).json({ error: 'Questa analisi è di un altro collaboratore.' });
    }
    res.json({ ok: true, item: riga });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
