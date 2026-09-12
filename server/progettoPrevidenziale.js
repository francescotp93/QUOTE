// ── QUOTO · Il progetto pensione che compila il cliente ──────────────────────
/* Il consulente manda un link. Il cliente lo apre dal telefono, scrive quattro
   dati, vede una stima, e quella stima si attacca alla SUA scheda in
   portafoglio: il consulente la ritrova lì, come un preventivo.

   ── PERCHE' QUESTO FILE E' PIU' PRUDENTE DEGLI ALTRI ──────────────────────
   È l'unica porta di QUOTO che si apre SENZA che nessuno sia collegato.
   Dietro ci sono il nome di una persona, quanto guadagna e quando è nata.
   Le regole, in ordine di quanto costa sbagliarle:

   1. DUE CHIAVI, NON UNA. Il link non basta: chiede anche la data di nascita.
      Un link finisce in una chat di gruppo, in un inoltro, nella cronologia
      di un telefono prestato. Con una chiave sola, chiunque lo riceva legge
      i dati di quella persona.

   2. LA SECONDA CHIAVE SI DIFENDE. Una data di nascita sono poche decine di
      migliaia di combinazioni: provate da un programma, è questione di
      minuti. Dopo CINQUE tentativi sbagliati il link si blocca e va rifatto.
      Senza il blocco la seconda chiave non sarebbe una chiave, sarebbe un
      rallentamento — e varrebbe la pena non averla messa, invece di credere
      di averla.

   3. PRIMA DI APRIRE, NON SI DICE NIENTE. La pagina pubblica, finché la data
      di nascita non è giusta, non restituisce il nome del cliente: solo che
      il link esiste e chi è l'agenzia. Chi ha rubato il link non deve poter
      leggere nemmeno a chi appartiene.

   4. IL TOKEN NON SI SALVA. In tabella c'è solo la sua impronta SHA-256. Chi
      legge il database non può ricostruire nessun link. Stessa ragione per
      cui non si salvano le password in chiaro.

   5. IL CLIENTE NON SCEGLIE A CHI ATTACCARE IL PROGETTO. `anagrafica_id` non
      si legge MAI dal corpo della richiesta: è quello legato al token. Se
      arrivasse da fuori, chiunque abbia un link potrebbe scrivere sulla
      scheda di un altro cliente.

   ── QUELLO CHE IL CLIENTE VEDE, E QUELLO CHE NON VEDE ─────────────────────
   Vede una stima, con gli stessi avvisi della schermata del consulente. NON
   vede un foglio firmato né un PDF: finché i valori di tariffa sono
   segnaposto, «un foglio non si consegna a un cliente vero» (CODEX §4.1), e
   men che meno senza nessuno accanto che lo spieghi. */
import { Router } from 'express';
import crypto from 'node:crypto';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const APP_URL = (process.env.QUOTO_URL || 'https://quoto.withusassicurazioni.it').replace(/\/$/, '');
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'francesco.oddo199307@gmail.com').toLowerCase();
const STAFF_RUOLI = ['admin', 'master', 'top_master'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Quanto dura un invito. Trenta giorni: abbastanza perché il cliente ci torni
   con calma, poco abbastanza perché un link dimenticato in una chat non resti
   aperto per sempre. */
export const GIORNI_VALIDITA = 30;
/* Dopo quanti tentativi il link si chiude. Cinque è generoso per chi sbaglia
   a scrivere la propria data di nascita, e inutile per chi la sta indovinando. */
export const TENTATIVI_MAX = 5;
/* Quattro campi e una stima: qualche kilobyte. Cento volte tanto vuol dire
   che dentro è finito qualcos'altro, e si ferma qui. */
export const LIMITE_BYTE = 256 * 1024;

export function genToken() { return crypto.randomBytes(24).toString('base64url'); }
export function impronta(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
export function linkDi(token) { return APP_URL + '/progetto.html?t=' + encodeURIComponent(token); }

/* ── LA DATA DI NASCITA ────────────────────────────────────────────────────
   Il cliente la scrive come gli pare: 5/3/1980, 05-03-1980, 1980-03-05. Il
   database ce l'ha come `YYYY-MM-DD`. Confrontare le due stringhe così come
   sono vorrebbe dire rifiutare un cliente che ha scritto la data GIUSTA — e
   bruciargli un tentativo dei cinque. */
export function normalizzaData(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let a, me, g;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);          // 1980-03-05
  if (m) { a = +m[1]; me = +m[2]; g = +m[3]; }
  else {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);           // 05/03/1980
    if (!m) return null;
    g = +m[1]; me = +m[2]; a = +m[3];
  }
  /* UNA DATA IMPOSSIBILE NON E' UNA DATA. Senza questo controllo
     `00/00/0000` diventava «0000-00-00», e due valori spazzatura uguali
     COMBACIAVANO fra loro: bastava che in anagrafica ci fosse finita una
     data farlocca perche' il link si aprisse scrivendo la stessa farlocca.
     L'ha trovato una prova, non il ragionamento. */
  if (!(a >= 1900 && a <= 2100) || !(me >= 1 && me <= 12) || !(g >= 1 && g <= 31)) return null;
  const d = new Date(Date.UTC(a, me - 1, g));
  /* Il 31 febbraio: `Date` lo accetta e lo sposta al 3 marzo. Si controlla
     che sia rimasto quello che gli era stato chiesto. */
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== me - 1 || d.getUTCDate() !== g) return null;
  return String(a).padStart(4, '0') + '-' + String(me).padStart(2, '0') + '-' + String(g).padStart(2, '0');
}

/* Il confronto è a tempo costante: due date che differiscono al primo
   carattere e due che differiscono all'ultimo devono metterci lo stesso.
   Su una porta pubblica con un numero chiuso di tentativi conta poco, ma
   costa una riga — e la riga che non si scrive è quella che poi manca. */
export function dateCombaciano(a, b) {
  const x = normalizzaData(a), y = normalizzaData(b);
  if (!x || !y) return false;
  const ba = Buffer.from(x), bb = Buffer.from(y);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ── LO STATO DI UN INVITO ─────────────────────────────────────────────────
   Pura: prende la riga e l'ora, dice se si può usare e perché no. Sta qui
   fuori dalle rotte perché è la funzione che decide chi entra, ed è l'unica
   che deve poter essere provata in tutti i suoi rami senza rete. */
export function statoInvito(riga, adesso) {
  const ora = adesso ? new Date(adesso).getTime() : Date.now();
  if (!riga) return { ok: false, codice: 404, motivo: 'Questo link non è valido.' };
  if (riga.revocato_il) return { ok: false, codice: 410, motivo: 'Questo link è stato annullato dal tuo consulente.' };
  if (riga.bloccato) {
    return { ok: false, codice: 423,
      motivo: 'Questo link è stato bloccato dopo troppi tentativi. Chiedi al tuo consulente di rimandartelo.' };
  }
  if (new Date(riga.scade_il).getTime() < ora) {
    return { ok: false, codice: 410, motivo: 'Questo link è scaduto. Chiedi al tuo consulente di rimandartelo.' };
  }
  return { ok: true, giaCompletato: !!riga.completato_il };
}

/* Cosa succede dopo un tentativo sbagliato. Pura, perché è la regola che
   trasforma la data di nascita in una chiave vera. */
export function dopoTentativoSbagliato(riga) {
  const tentativi = Math.max(0, Number(riga && riga.tentativi) || 0) + 1;
  const bloccato = tentativi >= TENTATIVI_MAX;
  return {
    tentativi,
    bloccato,
    restano: Math.max(0, TENTATIVI_MAX - tentativi),
    messaggio: bloccato
      ? 'Data di nascita non corrispondente. Il link è stato bloccato: chiedi al tuo consulente di rimandartelo.'
      : 'Data di nascita non corrispondente. Controlla e riprova.',
  };
}

/* ── QUELLO CHE IL CLIENTE MANDA ───────────────────────────────────────────
   Si accettano SOLO i campi del modulo, uno per uno, e con un intervallo
   plausibile. Non perché il cliente sia un nemico: perché quello che arriva
   da una porta aperta finisce in una scheda che il consulente leggerà come
   se fosse vera. */
export function preparaCompilazione(corpo) {
  const c = (corpo && corpo.dati) || null;
  if (!c || typeof c !== 'object') return { ok: false, errore: 'Mancano i dati del modulo.' };
  if (JSON.stringify(corpo).length > LIMITE_BYTE) return { ok: false, errore: 'Modulo troppo grande.' };

  const num = (v) => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));
  const lavori = ['dipendente', 'autonomo', 'professionista'];

  const eta = num(c.eta);
  if (eta === null || eta < 18 || eta > 75) return { ok: false, errore: 'L\'età deve stare fra 18 e 75 anni.' };
  const reddito = num(c.redditoMensile);
  if (reddito === null || reddito <= 0 || reddito > 100000) return { ok: false, errore: 'Il reddito mensile non è plausibile.' };
  const versamento = num(c.versamentoMensile);
  if (versamento === null || versamento < 0 || versamento > 100000) return { ok: false, errore: 'Il versamento mensile non è plausibile.' };
  const lavoro = lavori.indexOf(String(c.lavoro || '')) >= 0 ? String(c.lavoro) : null;
  if (!lavoro) return { ok: false, errore: 'Scegli il tipo di lavoro.' };

  /* L'età di inizio può mancare: è il caso «non lo so», che il motore tratta
     da sé con uno scenario prudenziale. Quello che NON può fare è essere
     incoerente in silenzio. */
  let inizio = num(c.etaInizioLavoro);
  if (inizio !== null && (inizio < 14 || inizio > eta)) inizio = null;

  const mens = num(c.mensilita);
  return {
    ok: true,
    dati: {
      eta, lavoro,
      redditoMensile: reddito,
      versamentoMensile: versamento,
      etaInizioLavoro: inizio,
      mensilita: mens !== null && mens >= 12 && mens <= 16 ? Math.round(mens) : null,
      baseReddito: c.baseReddito === 'lordo' ? 'lordo' : 'netto',
      compilatoDalCliente: true,
      compilatoIl: new Date().toISOString(),
    },
  };
}

/* ── Supabase con la service role ─────────────────────────────────────────── */
function sbHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(extra || {}) };
}
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error('Supabase select: ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function sbInsert(tabella, riga) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}`, {
    method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify([riga]),
  });
  if (!r.ok) throw new Error('Supabase insert: ' + (await r.text()).slice(0, 200));
  return (await r.json())[0];
}
async function sbPatch(tabella, id, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error('Supabase patch: ' + (await r.text()).slice(0, 200));
  return (await r.json())[0];
}

async function isStaff(req) {
  const email = ((req.user && req.user.email) || '').toLowerCase();
  if (email && email === SUPER_ADMIN_EMAIL) return true;
  try {
    const u = await sbGet(`quote_utenti?id=eq.${encodeURIComponent(req.user.id)}&select=ruolo&limit=1`);
    return !!(u[0] && STAFF_RUOLI.includes(String(u[0].ruolo || '').toLowerCase()));
  } catch (_) { return false; }
}

const TABELLA = 'quote_progetti_previdenziali';
/* Le colonne che l'elenco può restituire: NON `token_hash`. Una `select=*` su
   questa tabella manderebbe al browser l'impronta di tutti i link vivi. */
export const COLONNE_ELENCO =
  'id,creato_il,creato_da,anagrafica_id,scade_il,revocato_il,aperto_il,completato_il,bloccato,tentativi,dati,esito,versione_motore';

/* ══ LA PORTA DEL CONSULENTE (sotto requireAuth) ═════════════════════════ */
export const progettiPrevRouter = Router();

// POST / — crea l'invito e restituisce il link (l'unica volta che esiste in chiaro)
progettiPrevRouter.post('/', async (req, res) => {
  try {
    const anagraficaId = String((req.body && req.body.anagrafica_id) || '');
    if (!UUID.test(anagraficaId)) return res.status(400).json({ error: 'Serve il cliente a cui mandare il link.' });

    const rows = await sbGet(`quote_anagrafiche?id=eq.${encodeURIComponent(anagraficaId)}&select=id,nominativo,data_nascita,tipo,cellulare,telefono&limit=1`);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'Cliente non trovato.' });
    /* SENZA DATA DI NASCITA NON SI MANDA NIENTE. È la seconda chiave: senza,
       il link avrebbe una serratura sola e chiunque lo riceva entrerebbe. Si
       dice cosa manca, invece di mandare un link più debole in silenzio. */
    if (!a.data_nascita) {
      return res.status(400).json({
        error: 'Questo cliente non ha la data di nascita in anagrafica: senza, il link non avrebbe la seconda chiave. Aggiungila e riprova.',
      });
    }
    if (a.tipo === 'giuridica') return res.status(400).json({ error: 'Il fondo pensione è di una persona: una società non può compilarlo.' });

    const token = genToken();
    const riga = await sbInsert(TABELLA, {
      anagrafica_id: anagraficaId,
      creato_da: req.user.id,                      // dal token verificato, mai dal corpo
      token_hash: impronta(token),
      scade_il: new Date(Date.now() + GIORNI_VALIDITA * 86400000).toISOString(),
    });
    res.status(201).json({
      ok: true,
      progetto: { id: riga.id, scade_il: riga.scade_il, anagrafica_id: anagraficaId },
      cliente: { nominativo: a.nominativo, telefono: a.cellulare || a.telefono || '' },
      link: linkDi(token),                         // solo adesso, e mai più
      giorni: GIORNI_VALIDITA,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET / — gli inviti, con la stessa doppia vista dei preventivi
progettiPrevRouter.get('/', async (req, res) => {
  try {
    const staff = await isStaff(req);
    const p = new URLSearchParams();
    p.set('select', COLONNE_ELENCO);
    p.set('order', 'creato_il.desc');
    p.set('limit', String(Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)));
    if (req.query.anagrafica_id && UUID.test(String(req.query.anagrafica_id))) {
      p.set('anagrafica_id', 'eq.' + req.query.anagrafica_id);
    }
    if (!(staff && req.query.scope === 'all')) p.set('creato_da', 'eq.' + req.user.id);
    res.json({ ok: true, staff, items: await sbGet(`${TABELLA}?${p.toString()}`) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id — revoca. Il link smette di funzionare subito.
progettiPrevRouter.delete('/:id', async (req, res) => {
  try {
    const rows = await sbGet(`${TABELLA}?id=eq.${encodeURIComponent(req.params.id)}&select=id,creato_da&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Invito non trovato.' });
    if (rows[0].creato_da !== req.user.id && !(await isStaff(req))) return res.status(403).json({ error: 'Non autorizzato.' });
    await sbPatch(TABELLA, req.params.id, { revocato_il: new Date().toISOString() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══ LA PORTA PUBBLICA (nessuno è collegato) ═════════════════════════════ */
export const progettiPrevPubblico = Router();

async function perToken(token) {
  if (!token || String(token).length < 20) return null;
  const rows = await sbGet(`${TABELLA}?token_hash=eq.${encodeURIComponent(impronta(token))}&select=*&limit=1`);
  return rows[0] || null;
}

/* GET /pubblico/:token — dice solo se il link è vivo e cosa serve per aprirlo.
   NIENTE nome del cliente: vedi la regola 3 in cima al file. */
progettiPrevPubblico.get('/pubblico/:token', async (req, res) => {
  try {
    const riga = await perToken(req.params.token);
    const st = statoInvito(riga);
    if (!st.ok) return res.status(st.codice).json({ error: st.motivo });
    if (!riga.aperto_il) await sbPatch(TABELLA, riga.id, { aperto_il: new Date().toISOString() });
    res.json({ ok: true, richiede: 'data_nascita', giaCompletato: st.giaCompletato });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /pubblico/:token/apri — la data di nascita. Se è giusta, e solo allora,
   torna il nome (per salutare il cliente e fargli capire che è suo). */
progettiPrevPubblico.post('/pubblico/:token/apri', async (req, res) => {
  try {
    const riga = await perToken(req.params.token);
    const st = statoInvito(riga);
    if (!st.ok) return res.status(st.codice).json({ error: st.motivo });

    const a = (await sbGet(`quote_anagrafiche?id=eq.${encodeURIComponent(riga.anagrafica_id)}&select=nominativo,nome,data_nascita,professione&limit=1`))[0];
    if (!a) return res.status(404).json({ error: 'Questo link non è più valido.' });

    if (!dateCombaciano(req.body && req.body.dataNascita, a.data_nascita)) {
      const d = dopoTentativoSbagliato(riga);
      await sbPatch(TABELLA, riga.id, { tentativi: d.tentativi, bloccato: d.bloccato });
      return res.status(401).json({ error: d.messaggio, restano: d.restano, bloccato: d.bloccato });
    }
    /* Indovinata la data, il contatore riparte: chi è entrato non deve
       trovarsi il link bloccato dai tentativi di prima. */
    if (riga.tentativi) await sbPatch(TABELLA, riga.id, { tentativi: 0 });

    res.json({
      ok: true,
      cliente: { nome: (a.nome || a.nominativo || '').split(' ')[0], nominativo: a.nominativo, professione: a.professione || '' },
      giaCompletato: st.giaCompletato,
      dati: riga.dati || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /pubblico/:token/salva — quello che il cliente ha scritto e la stima
   che ha visto. La data di nascita si richiede di nuovo: la richiesta di
   prima non lascia nessuna sessione, e senza ricontrollarla basterebbe il
   solo token per scrivere sulla scheda. */
progettiPrevPubblico.post('/pubblico/:token/salva', async (req, res) => {
  try {
    const riga = await perToken(req.params.token);
    const st = statoInvito(riga);
    if (!st.ok) return res.status(st.codice).json({ error: st.motivo });

    const a = (await sbGet(`quote_anagrafiche?id=eq.${encodeURIComponent(riga.anagrafica_id)}&select=data_nascita&limit=1`))[0];
    if (!a || !dateCombaciano(req.body && req.body.dataNascita, a.data_nascita)) {
      const d = dopoTentativoSbagliato(riga);
      await sbPatch(TABELLA, riga.id, { tentativi: d.tentativi, bloccato: d.bloccato });
      return res.status(401).json({ error: d.messaggio, restano: d.restano, bloccato: d.bloccato });
    }

    const p = preparaCompilazione(req.body);
    if (!p.ok) return res.status(400).json({ error: p.errore });

    await sbPatch(TABELLA, riga.id, {
      dati: p.dati,
      /* La stima è quella che il cliente HA VISTO: serve al consulente per
         sapere di cosa gli sta parlando quando richiama. Il conto buono lo
         rifà comunque il motore, dai dati. */
      esito: (req.body && req.body.esito && typeof req.body.esito === 'object') ? req.body.esito : null,
      versione_motore: String((req.body && req.body.versione_motore) || '') || null,
      completato_il: new Date().toISOString(),
      tentativi: 0,
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
