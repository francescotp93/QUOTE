// ═══════════════════════════════════════════════════════════════════════════════
//  CONVENZIONATI — dall'approvazione all'accesso
//
//  Quando lo staff approva una richiesta, questa parte fa tre cose in fila:
//    1. crea l'utenza vera (Supabase Auth) con la sua email;
//    2. genera una password provvisoria e la marca come da cambiare;
//    3. gliela manda per email, col link alla sua area riservata.
//
//  PERCHE' STA NEL BACKEND E NON NEL PANNELLO
//  Creare un utente richiede la chiave di servizio, quella che puo' tutto. Una
//  chiave del genere nel browser sarebbe leggibile da chiunque apra gli
//  strumenti per sviluppatori: da li' si creano utenti, si leggono tabelle, si
//  cambia qualunque cosa. Resta sul server, e il pannello chiede.
//
//  L'ASSOCIATO NON E' UN UTENTE IAM. Entra da un'altra porta e vede un'altra
//  cosa: non compare in iam_utenti, quindi il login di IAM lo rifiuta da se'.
//  Nei suoi metadati resta scritto che e' un associato e di quale convenzione.
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import crypto from 'crypto';
import { getBonificoCfg } from './shop.js';

export const convenzionatiRouter = Router();
/* Le rotte dell'associato: non passano dal cancello dello staff (chi le chiama
   di IAM non fa parte) ma non sono aperte a chiunque — ognuna ricontrolla, col
   suo accesso Supabase, quale riga ha il diritto di toccare. */
export const convenzionatiRouter_pubblicoAssociati = Router();

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
/* La chiave PUBBLICA (anon). Non e' un segreto — sta gia' in ogni pagina del
   sito — ma qui serve per un motivo preciso: per chiedere «chi e' questo?»
   presentando il token di una persona bisogna bussare come bussa una persona.
   Con la chiave di servizio quella stessa domanda viene rifiutata, ed e'
   esattamente cosa succedeva: un accesso valido si sentiva rispondere
   «accesso non valido o scaduto». */
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVranhybnNmcXhuZnh6cnRoZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzU4NjcsImV4cCI6MjA5NTAxMTg2N30.2OF2COAcLgM22xbmtqLWXgaDcVLtNh3AuX5MQ4_L02I';
const AREA_URL = (process.env.AREA_CONVENZIONATI_URL || 'https://quoto.withusassicurazioni.it/area.html').replace(/\/$/, '');
const NOTIFY_FROM = process.env.NOTIFY_FROM || 'noreply@withusassicurazioni.it';
const NOTIFY_NAME = process.env.NOTIFY_NAME || 'With Us Assicurazioni';
/* Casella PROPRIA, non quella degli intermediari. Sono due flussi diversi che
   guardano persone diverse: la casella intermediari riceve le pratiche dei
   collaboratori, questa le richieste di accesso dei convenzionati. Metterle
   insieme vuol dire che una delle due si perde in mezzo all'altra.
   «Le mail devono andare ad amministrazione» — Francesco, 02/09/2026. */
const STAFF_INBOX = process.env.CONVENZIONI_EMAIL || 'amministrazione@withusassicurazioni.it';
const IAM_URL = (process.env.IAM_URL || 'https://iam.withusassicurazioni.it').replace(/\/$/, '');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function srvKey() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return k;
}

/* ── LA PASSWORD PROVVISORIA ──────────────────────────────────────────────────
   Va letta da un'email, spesso dal telefono, e ribattuta a mano. Quindi:
   · niente caratteri che si confondono (0/O, 1/l/I): chi sbaglia a copiare
     pensa che l'accesso non funzioni, non che abbia letto male;
   · a gruppi separati da un trattino, che si leggono e si ridigitano meglio di
     dodici caratteri di fila;
   · presa da crypto, non da Math.random: una password che si puo' indovinare
     conoscendo l'ora in cui e' stata creata non e' una password.
   Restano 14 caratteri da un alfabeto di 31: abbastanza perche' provarle tutte
   non sia una strada, ed e' comunque da cambiare al primo accesso. */
const LETTERE = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const CIFRE = '23456789';
const ALFABETO = LETTERE + CIFRE;
export function passwordProvvisoria() {
  const scegli = (da) => da[crypto.randomBytes(1)[0] % da.length];
  const c = Array.from(crypto.randomBytes(12)).map((b) => ALFABETO[b % ALFABETO.length]);
  /* ALMENO UNA LETTERA E ALMENO UNA CIFRA, per costruzione.
     Senza questo, una password su qualche centinaio usciva di sole lettere —
     e il nostro stesso controllo l'avrebbe rifiutata al primo cambio. Generare
     una password che poi non accetteremmo e' il genere di assurdita' che si
     scopre in produzione, con la persona che ha in mano una cosa che non
     funziona. L'ha trovata una prova, non il campo. */
  const dove = (n) => crypto.randomBytes(1)[0] % n;
  if (!c.some((x) => CIFRE.includes(x))) c[dove(12)] = scegli(CIFRE);
  if (!c.some((x) => LETTERE.includes(x))) { let i = dove(12); while (CIFRE.includes(c[i]) && c.filter((x) => CIFRE.includes(x)).length === 1) i = dove(12); c[i] = scegli(LETTERE); }
  return `${c.slice(0, 4).join('')}-${c.slice(4, 8).join('')}-${c.slice(8, 12).join('')}`;
}

/* ── LE PASSWORD CHE NON SI ACCETTANO ─────────────────────────────────────────
   Il progetto non e' su piano Pro, quindi il controllo di Supabase contro le
   password finite nelle fughe di dati non si puo' accendere (provato il
   2 settembre 2026: «available on Pro Plans and up»). Questo non copre quella
   lista, ma copre quello che le persone scelgono DAVVERO quando devono
   inventare una password in fretta: il proprio nome, la propria email, il nome
   dell'agenzia, o una tastiera premuta in fila.
   Sta qui, in un posto solo, cosi' vale per il primo cambio e per ogni cambio
   successivo — e si puo' provare senza aprire un browser. */
const ORRORI = [
  'password', 'passw0rd', '123456', '12345678', '123456789', 'qwerty', 'qwertyuiop',
  'asdfgh', 'abc123', '111111', '000000', 'iloveyou', 'admin', 'welcome',
  'withus', 'withusassicurazioni', 'assicurazioni', 'polizza', 'convenzione',
];
export function passwordDebole(pw, { email = '', nome = '', cognome = '', minimo = 8 } = {}) {
  const p = String(pw || '');
  if (p.length < minimo) return `Serve almeno ${minimo} caratteri.`;
  const b = p.toLowerCase();
  if (ORRORI.some((x) => b === x || b.includes(x))) return 'Questa password è fra le più usate al mondo: chi prova a entrare parte da lì. Scegline un\'altra.';
  const parti = [String(email).split('@')[0], nome, cognome].map((x) => String(x || '').toLowerCase()).filter((x) => x.length >= 3);
  if (parti.some((x) => b.includes(x))) return 'La password non può contenere il tuo nome o la tua email: sono le prime cose che si provano.';
  if (/^(.)\1+$/.test(p)) return 'Un carattere solo ripetuto non è una password.';
  // Sequenze dritte sulla tastiera o nell'alfabeto (abcdefgh, 12345678, qwertyui).
  const seq = 'abcdefghijklmnopqrstuvwxyz0123456789qwertyuiopasdfghjklzxcvbnm';
  for (let i = 0; i + 5 <= seq.length; i++) {
    const p5 = seq.slice(i, i + 5);
    if (b.includes(p5) || b.includes([...p5].reverse().join(''))) return 'Contiene una sequenza di tasti consecutivi: è fra le prime che si provano.';
  }
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) return 'Metti almeno una lettera e un numero.';
  return null;   // va bene
}

// ── Supabase con la chiave di servizio ────────────────────────────────────────
async function sb(path, opz = {}) {
  const key = srvKey();
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    ...opz,
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json', ...(opz.headers || {}) },
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) {
    const err = new Error((d && (d.message || d.msg || d.error_description)) || `HTTP ${r.status}`);
    err.stato = r.status;
    throw err;
  }
  return d;
}

const leggiAssociato = async (id) => {
  const r = await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(id)}&select=*,quote_convenzioni(nome,ente)`);
  return Array.isArray(r) ? r[0] : null;
};

async function inviaEmail(to, subject, html) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY non configurata');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: NOTIFY_FROM, name: NOTIFY_NAME }, to: [{ email: to }], subject, htmlContent: html }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Brevo: ' + (d.message || `HTTP ${r.status}`));
  return d;
}

export function emailCredenziali({ nome, convenzione, email, password, link }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0b1437,#1b2a6b);padding:20px 22px;text-align:center"><img src="https://quoto.withusassicurazioni.it/withus-logo-white.png" alt="With Us Assicurazioni" style="height:44px"></div>
  <div style="padding:24px;color:#2b3346;font-size:15px;line-height:1.6">
    <h2 style="margin:0 0 14px;font-size:19px;color:#1d2740">La tua area riservata è pronta</h2>
    <p>Ciao ${esc(nome)}, la richiesta di accesso per la convenzione <b>${esc(convenzione)}</b> è stata approvata.</p>
    <p style="margin:18px 0 6px">Entra con queste credenziali:</p>
    <div style="background:#eef2ff;border-radius:12px;padding:16px;margin:6px 0 14px">
      <div style="font-size:13px;color:#5a6b8c">Email</div>
      <div style="font-size:16px;font-weight:800;color:#1b2a6b;word-break:break-all">${esc(email)}</div>
      <div style="font-size:13px;color:#5a6b8c;margin-top:12px">Password provvisoria</div>
      <div style="font-size:24px;font-weight:900;letter-spacing:2px;color:#1b2a6b;font-family:monospace">${esc(password)}</div>
    </div>
    <p style="text-align:center;margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:12px">Entra nella tua area</a></p>
    <p style="color:#6b7488;font-size:13.5px">Al primo accesso ti verrà chiesto di <b>sceglierne una tua</b>: quella qui sopra serve solo per entrare la prima volta. Se non l'hai chiesta tu, ignora questo messaggio e avvisaci.</p>
  </div>
  <div style="padding:14px 24px;background:#f8f9fc;color:#8b93a7;font-size:12px">With Us Soc. Coop. · Email automatica, non rispondere a questo messaggio.</div>
</div>`;
}

/* Crea l'utenza se non c'e', oppure rimette una password nuova se c'e' gia'.
   Il secondo caso serve davvero: la mail va persa, finisce nello spam, la
   persona la cancella. Senza una via per rimandarla, l'unica strada sarebbe
   cancellare l'associato e rifare tutto. */
async function creaOAggiornaUtenza(assoc) {
  const password = passwordProvvisoria();
  const meta = {
    ruolo: 'associato',
    convenzione_id: assoc.convenzione_id,
    nome: assoc.nome,
    cognome: assoc.cognome,
  };
  if (assoc.auth_user_id) {
    await sb(`/auth/v1/admin/users/${encodeURIComponent(assoc.auth_user_id)}`, {
      method: 'PUT',
      body: JSON.stringify({ password, user_metadata: meta }),
    });
    return { password, auth_user_id: assoc.auth_user_id, nuovo: false };
  }
  try {
    const u = await sb('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: assoc.email, password,
        // Confermata d'ufficio: l'indirizzo l'abbiamo gia' usato per mandargli
        // queste credenziali, e un secondo giro di conferma qui aggiungerebbe
        // solo un passaggio in cui ci si perde.
        email_confirm: true,
        user_metadata: meta,
      }),
    });
    return { password, auth_user_id: u.id, nuovo: true };
  } catch (e) {
    /* Quell'indirizzo ha gia' un'utenza: succede se la stessa persona e'
       associata a due convenzioni, o se e' gia' passata di qui. Si riusa
       invece di fallire — ma NON si tocca un'utenza che appartiene allo
       staff: sarebbe cambiare la password a un collega. */
    if (!/already|exist|registered|duplicate/i.test(e.message || '')) throw e;
    const trovati = await sb(`/auth/v1/admin/users?filter=${encodeURIComponent(assoc.email)}`);
    const u = (trovati && (trovati.users || trovati))?.find?.((x) => String(x.email || '').toLowerCase() === String(assoc.email).toLowerCase());
    if (!u) throw e;

    /* ⚠ IL 2 SETTEMBRE 2026 QUESTO PEZZO HA CAMBIATO LA PASSWORD A FRANCESCO.
       Si era iscritto alla convenzione con la sua email personale, che e' anche
       quella con cui entra in IAM. Il controllo era:

           if (suoRuolo && suoRuolo !== 'associato') rifiuta

       cioe' «rifiuta solo se so gia' che e' qualcun altro». Ma gli utenti che
       esistevano PRIMA di questo pezzo non hanno nessun ruolo nei metadati:
       il controllo non scattava, e la password veniva sovrascritta. Il difetto
       non era la regola, era il verso: chiedeva un motivo per fermarsi invece
       di chiedere un permesso per procedere.

       Adesso si procede SOLO se quell'utenza e' gia', esplicitamente, di un
       associato. In ogni altro caso — ruolo assente, ruolo diverso, oppure
       l'indirizzo appartiene a qualcuno dello staff — non si tocca niente e si
       dice cosa fare. Vale la pena rifiutare qualche caso legittimo: toccare
       la password di un collega non e' un inconveniente, e' chiuderlo fuori. */
    const staff = await sb(`/rest/v1/iam_utenti?email=eq.${encodeURIComponent(String(assoc.email).toLowerCase())}&select=email&limit=1`).catch(() => []);
    if (Array.isArray(staff) && staff.length) {
      const err = new Error('Questo indirizzo è già di una persona dell\'agenzia: aprirgli un accesso da associato gli cambierebbe la password con cui entra in IAM. Chiedigli un\'altra email.');
      err.stato = 409; throw err;
    }
    if ((u.user_metadata || {}).ruolo !== 'associato') {
      const err = new Error('Questo indirizzo ha già un accesso alla piattaforma che non risulta di un associato. Non lo tocco: verifica a mano di chi è, oppure usa un altro indirizzo.');
      err.stato = 409; throw err;
    }
    await sb(`/auth/v1/admin/users/${encodeURIComponent(u.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ password, user_metadata: { ...(u.user_metadata || {}), ...meta } }),
    });
    return { password, auth_user_id: u.id, nuovo: false };
  }
}

export function emailNuovaRichiesta({ nome, cognome, email, telefono, richiesta, convenzione, link }) {
  const riga = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7488;font-size:13px">${esc(k)}</td><td style="padding:4px 0;font-weight:700">${esc(v)}</td></tr>` : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0b1437,#1b2a6b);padding:20px 22px;text-align:center"><img src="https://quoto.withusassicurazioni.it/withus-logo-white.png" alt="With Us Assicurazioni" style="height:44px"></div>
  <div style="padding:24px;color:#2b3346;font-size:15px;line-height:1.6">
    <h2 style="margin:0 0 6px;font-size:19px;color:#1d2740">Nuova richiesta di accesso</h2>
    <p style="margin:0 0 16px;color:#6b7488">Convenzione <b>${esc(convenzione)}</b></p>
    <table style="border-collapse:collapse">
      ${riga('Nome', (cognome || '') + ' ' + (nome || ''))}
      ${riga('Email', email)}
      ${riga('Telefono', telefono)}
    </table>
    ${richiesta ? `<div style="margin-top:14px;background:#f5f7fc;border-radius:10px;padding:12px 14px"><div style="font-size:12.5px;color:#6b7488;margin-bottom:4px">Cosa chiede</div>${esc(richiesta)}</div>` : ''}
    <p style="text-align:center;margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;font-weight:800;padding:13px 26px;border-radius:12px">Apri le convenzioni</a></p>
    <p style="color:#6b7488;font-size:13px">Finché non la approvi, questa persona non ha nessun accesso.</p>
  </div>
  <div style="padding:14px 24px;background:#f8f9fc;color:#8b93a7;font-size:12px">With Us Soc. Coop. · Email automatica, non rispondere a questo messaggio.</div>
</div>`;
}

/* ── POST /convenzionati/iscrizione — PUBBLICA, dal modulo di iscrizione ───────
   Prima il modulo scriveva dritto sul database e nessuno lo sapeva: la
   richiesta restava li' finche' qualcuno non apriva il pannello per caso.
   «Cosi' si evitano sviste o attese» — Francesco, 02/09/2026.

   L'iscrizione e l'avviso sono un gesto solo, e in quest'ordine: se l'email non
   parte la richiesta resta comunque registrata (si vede nel pannello), mentre
   il contrario — avvisare di una richiesta che non e' stata salvata — manderebbe
   a cercare una riga che non esiste.

   Il token si verifica QUI: non si accettano iscrizioni su convenzioni chiuse,
   scadute o inventate, esattamente come faceva la protezione del database. */
export const convenzionatiPubblico = Router();
convenzionatiPubblico.post('/iscrizione', async (req, res) => {
  try {
    const b = req.body || {};
    const token = String(b.token || '').trim();
    const nome = String(b.nome || '').trim();
    const cognome = String(b.cognome || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    if (!token || !nome || !cognome || !email) return res.status(400).json({ error: 'Servono almeno nome, cognome ed email.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return res.status(400).json({ error: 'L\'indirizzo email non è valido.' });

    const trovate = await sb('/rest/v1/rpc/convenzione_pubblica', { method: 'POST', body: JSON.stringify({ p_token: token }) });
    const conv = Array.isArray(trovate) ? trovate[0] : null;
    if (!conv) return res.status(404).json({ error: 'Questo link non è attivo.' });

    try {
      await sb('/rest/v1/quote_convenzione_associati', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          convenzione_id: conv.id, nome, cognome, email,
          telefono: String(b.telefono || '').trim() || null,
          richiesta: String(b.richiesta || '').trim() || null,
        }),
      });
    } catch (e) {
      if (/duplicate|unique|assoc_una_iscrizione/i.test(e.message || '')) return res.status(409).json({ error: 'gia_iscritto' });
      throw e;
    }

    try {
      await inviaEmail(STAFF_INBOX, 'Nuova richiesta di accesso · ' + conv.nome,
        emailNuovaRichiesta({
          nome, cognome, email, telefono: b.telefono, richiesta: b.richiesta,
          convenzione: conv.nome, link: IAM_URL + '/?page=convenzioni',
        }));
    } catch (e) {
      // La richiesta e' salvata: il pannello la mostra comunque. Qui si perde
      // solo la spinta ad andarla a guardare, e va detto nel log del server.
      console.warn('[convenzionati] iscrizione salvata ma avviso allo staff non partito:', e.message);
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.stato || 500).json({ error: e.message || 'Errore imprevisto.' });
  }
});

// ── POST /convenzionati/associati/:id/approva ─────────────────────────────────
// Approva e apre l'accesso. `rinvia` rifà solo la password e la rimanda.
convenzionatiRouter.post('/associati/:id/approva', async (req, res) => {
  try {
    const assoc = await leggiAssociato(req.params.id);
    if (!assoc) return res.status(404).json({ error: 'Richiesta non trovata.' });
    const rinvia = !!(req.body && req.body.rinvia);
    if (assoc.stato === 'approvato' && !rinvia) {
      return res.status(409).json({ error: 'Questa richiesta è già approvata. Per rimandare le credenziali usa «Rimanda credenziali».' });
    }
    const conv = assoc.quote_convenzioni || {};
    const { password, auth_user_id } = await creaOAggiornaUtenza(assoc);

    /* PRIMA si scrive, POI si manda. Se l'email fallisce si puo' rimandare; se
       invece mandassimo prima e la scrittura fallisse, la persona avrebbe in
       mano una password che il sistema non sa di avere dato. */
    await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(assoc.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        stato: 'approvato', auth_user_id,
        deve_cambiare_password: true,
        credenziali_inviate_il: new Date().toISOString(),
        verificato_il: assoc.verificato_il || new Date().toISOString(),
        verificato_da: (req.user && req.user.id) || assoc.verificato_da || null,
      }),
    });

    try {
      await inviaEmail(assoc.email, 'La tua area riservata ' + (conv.nome || 'convenzionati') + ' è pronta',
        emailCredenziali({
          nome: assoc.nome, convenzione: conv.nome || 'convenzionati',
          email: assoc.email, password, link: AREA_URL,
        }));
    } catch (e) {
      /* L'accesso c'e' comunque: quello che manca e' l'avviso. Si dice
         esattamente questo, invece di far credere che sia fallito tutto. */
      return res.json({
        ok: true, email_inviata: false,
        avviso: 'Accesso creato, ma l\'email non è partita (' + (e.message || '') + '). Usa «Rimanda credenziali».',
      });
    }
    return res.json({ ok: true, email_inviata: true });
  } catch (e) {
    return res.status(e.stato || 500).json({ error: e.message || 'Errore imprevisto.' });
  }
});

/* ── DELETE /convenzionati/associati/:id — togliere davvero un associato ───────
   Cancellare la riga non basta: se resta l'utenza, quella persona continua a
   entrare nell'area riservata con la sua password. Un elenco che dice «non c'e'
   piu'» mentre l'accesso funziona ancora e' peggio di non avere il pulsante.

   Che cosa NON si cancella, e perche':
   · L'ANAGRAFICA resta. Quella persona puo' essere un cliente, con le sue
     polizze e la sua storia: toglierla dalla convenzione non vuol dire
     cancellarla dall'agenzia.
   · L'UTENZA SI CANCELLA SOLO SE E' DI UN ASSOCIATO. Stessa prudenza
     dell'approvazione, imparata a spese di Francesco il 2 settembre 2026: se
     quell'indirizzo appartiene a qualcuno dello staff, o a un'utenza che non
     risulta di un associato, non si tocca. Cancellare l'accesso di un collega
     e' molto peggio che lasciare in giro una riga di troppo. */
convenzionatiRouter.delete('/associati/:id', async (req, res) => {
  try {
    const assoc = await leggiAssociato(req.params.id);
    if (!assoc) return res.status(404).json({ error: 'Questo associato non c\'è (forse è già stato tolto).' });

    let accessoTolto = false, avviso = null;
    if (assoc.auth_user_id) {
      try {
        const u = await sb(`/auth/v1/admin/users/${encodeURIComponent(assoc.auth_user_id)}`);
        const staff = await sb(`/rest/v1/iam_utenti?email=eq.${encodeURIComponent(String(u.email || '').toLowerCase())}&select=email&limit=1`).catch(() => []);
        if (Array.isArray(staff) && staff.length) {
          avviso = 'Ho tolto l\'associato, ma NON il suo accesso: quell\'indirizzo è di una persona dell\'agenzia e cancellarlo l\'avrebbe chiusa fuori.';
        } else if ((u.user_metadata || {}).ruolo !== 'associato') {
          avviso = 'Ho tolto l\'associato, ma NON il suo accesso: quell\'utenza non risulta di un associato. Controllala a mano prima di cancellarla.';
        } else {
          await sb(`/auth/v1/admin/users/${encodeURIComponent(assoc.auth_user_id)}`, { method: 'DELETE' });
          accessoTolto = true;
        }
      } catch (e) {
        // L'utenza non c'e' piu': va benissimo, e' lo stato in cui volevamo arrivare.
        if (/not.?found|404/i.test(e.message || '')) accessoTolto = true;
        else avviso = 'Ho tolto l\'associato, ma il suo accesso non si è potuto cancellare (' + e.message + ').';
      }
    }

    /* Fuori anche dal gruppo della convenzione: se restasse dentro, le campagne
       continuerebbero a scrivergli come associato di un ente da cui l'abbiamo
       tolto. L'anagrafica invece resta dov'e'. */
    if (assoc.anagrafica_id) {
      const conv = await sb(`/rest/v1/quote_convenzioni?id=eq.${encodeURIComponent(assoc.convenzione_id)}&select=gruppo_id`).catch(() => []);
      const gruppoId = Array.isArray(conv) && conv[0] ? conv[0].gruppo_id : null;
      if (gruppoId) {
        await sb(`/rest/v1/quote_gruppi_membri?gruppo_id=eq.${encodeURIComponent(gruppoId)}&anagrafica_id=eq.${encodeURIComponent(assoc.anagrafica_id)}`,
          { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => {});
      }
    }

    await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(assoc.id)}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return res.json({ ok: true, accesso_tolto: accessoTolto, avviso });
  } catch (e) {
    return res.status(e.stato || 500).json({ error: e.message || 'Errore imprevisto.' });
  }
});

/* ══ L'AREA RISERVATA — le rotte che usa l'associato ═══════════════════════════
   Queste NON passano dal cancello dello staff: chi le chiama e' l'associato, che
   di IAM non fa parte. Si autentica col proprio accesso Supabase, e ogni rotta
   ricontrolla chi e' PRIMA di fare qualsiasi cosa: il fatto di avere un accesso
   valido non dice ancora quale riga si ha il diritto di toccare. */
async function chiEntra(req) {
  const h = String(req.headers.authorization || '');
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) { const e = new Error('Serve un accesso.'); e.stato = 401; throw e; }

  /* SI CHIEDE AL DATABASE, NON AL SERVIZIO DEGLI ACCESSI.
     Prima si domandava «chi e' questo?» a /auth/v1/user, e il 2 settembre 2026
     quella porta ha risposto 403 a un accesso perfettamente valido: l'associato
     era dentro, leggeva i suoi dati nel browser, e il nostro server gli diceva
     di rientrare.

     Qui si usa la stessa strada che nel browser funziona gia': si legge la
     tabella presentando il SUO token. Se la protezione restituisce una riga,
     due cose sono vere insieme — il token e' valido, e quella riga e' sua.
     Un giro solo invece di due, e nessuna porta in mezzo che possa dire di no
     per conto proprio.

     UNA RIGA SOLA, PERO'. Con il token di una persona dello staff la stessa
     lettura ne restituirebbe molte (lo staff le vede tutte): quello non e' un
     associato e da qui non deve passare. */
  let righe;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/quote_convenzione_associati?select=*,quote_convenzioni(nome,ente)&limit=2`,
      { headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + tok } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160));
    righe = await r.json();
  } catch (err) {
    console.warn('[convenzionati] accesso non riconosciuto:', err && err.message);
    const e = new Error('Accesso non valido o scaduto: rientra.'); e.stato = 401; throw e;
  }
  if (!Array.isArray(righe) || righe.length !== 1) {
    const e = new Error('Questo accesso non è abilitato all\'area riservata.'); e.stato = 403; throw e;
  }
  const assoc = righe[0];
  if (assoc.stato !== 'approvato') {
    const e = new Error('Questo accesso non è ancora abilitato: la richiesta non risulta approvata.'); e.stato = 403; throw e;
  }
  return { utente: { id: assoc.auth_user_id }, assoc };
}

// POST /convenzionati/mia-password — il cambio password, anche il primo.
convenzionatiRouter_pubblicoAssociati.post('/mia-password', async (req, res) => {
  try {
    const { utente, assoc } = await chiEntra(req);
    const nuova = String((req.body || {}).password || '');
    /* La validazione sta QUI e non nel browser. Nel browser sarebbe un
       suggerimento: basta chiudere la pagina e chiamare il database per
       saltarla. Un posto solo decide che cos'e' una password accettabile. */
    const problema = passwordDebole(nuova, { email: assoc.email, nome: assoc.nome, cognome: assoc.cognome });
    if (problema) return res.status(400).json({ error: problema });
    await sb(`/auth/v1/admin/users/${encodeURIComponent(utente.id)}`, {
      method: 'PUT', body: JSON.stringify({ password: nuova }),
    });
    await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(assoc.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ deve_cambiare_password: false }),
    });
    return res.json({ ok: true });
  } catch (e) { return res.status(e.stato || 500).json({ error: e.message || 'Errore imprevisto.' }); }
});

/* ── I CONSENSI, CON L'OTP ────────────────────────────────────────────────────
   Il consenso si conferma con un codice mandato all'indirizzo della persona:
   e' la stessa forma della firma delle proposte, e serve a poter dire, anche
   fra due anni, che quel consenso l'ha dato QUELLA persona e non qualcuno
   seduto al suo computer.
   Del codice si conserva l'impronta, mai il codice: se un domani qualcuno
   legge il database non trova niente da riusare. */
const OTP_MIN = Number(process.env.OTP_TTL_MIN || 10);
const impronta = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

convenzionatiRouter_pubblicoAssociati.post('/mio-codice', async (req, res) => {
  try {
    const { assoc } = await chiEntra(req);
    const codice = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(assoc.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        otp_hash: impronta(codice + ':' + assoc.id),
        otp_scade_il: new Date(Date.now() + OTP_MIN * 60000).toISOString(),
      }),
    });
    await inviaEmail(assoc.email, 'Il tuo codice di conferma',
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0b1437,#1b2a6b);padding:20px;text-align:center"><img src="https://quoto.withusassicurazioni.it/withus-logo-white.png" alt="With Us Assicurazioni" style="height:40px"></div>
        <div style="padding:24px;color:#2b3346;font-size:15px;line-height:1.6">
          <p>Ciao ${esc(assoc.nome)}, ecco il codice per confermare i tuoi dati:</p>
          <div style="font-size:32px;font-weight:900;letter-spacing:10px;color:#1b2a6b;background:#eef2ff;border-radius:12px;padding:16px;text-align:center;margin:14px 0">${codice}</div>
          <p style="color:#6b7488;font-size:13.5px">Vale ${OTP_MIN} minuti. Se non lo hai chiesto tu, ignora questo messaggio.</p>
        </div>
      </div>`);
    return res.json({ ok: true, minuti: OTP_MIN });
  } catch (e) { return res.status(e.stato || 500).json({ error: e.message || 'Errore imprevisto.' }); }
});

/* ── DAL CONVENZIONATO AL GRUPPO ──────────────────────────────────────────────
   Quando l'associato conferma i suoi dati diventa un'anagrafica come tutte le
   altre ed entra nel gruppo della sua convenzione. Da li' le campagne lo
   raggiungono senza che nessuno costruisca liste a mano — «il che ci puo'
   permettere di fare campagne mirate su quel gruppo» (Francesco, 02/09/2026).

   TRE COSE DA NON SBAGLIARE, e ognuna e' gia' costata a qualcuno da qualche
   parte:

   1. L'ANAGRAFICA E' UNA SOLA. Si cerca per email PRIMA di crearne una: se una
      persona e' gia' cliente, o e' associata a due convenzioni, deve restare
      la stessa scheda. Due schede della stessa persona vogliono dire polizze
      attaccate a quella sbagliata — ed e' proprio quello che l'area riservata
      dovrebbe evitare.
   2. IL CONSENSO MARKETING E' QUELLO CHE HA DATO LUI. La spunta facoltativa
      dell'area riservata finisce in `consenso_marketing`, che e' esattamente
      il campo da cui le campagne decidono chi puo' ricevere: se scrivessimo
      `true` per comodita', manderemmo email commerciali a chi ha detto di no.
   3. IL GRUPPO SI CREA UNA VOLTA SOLA, alla prima conferma, e resta legato
      alla convenzione. */
/* IL TIPO DEL GRUPPO DI UNA CONVENZIONE.
   Sta in una costante e non scritto in mezzo al codice per un motivo preciso:
   il 2 settembre 2026 questo valore non era fra quelli che il database
   accettava, e l'aggancio falliva in silenzio mentre tutto il resto sembrava
   funzionare. Un valore che il database deve conoscere si tiene in un posto
   solo, dove si vede. */
const GRUPPO_CONVENZIONE = 'convenzione';

async function nelGruppoDellaConvenzione(assoc, conv, consensoMarketing) {
  // 1. L'anagrafica: prima si cerca, poi eventualmente si crea.
  const email = String(assoc.email || '').toLowerCase();
  let anagId = assoc.anagrafica_id || null;
  if (!anagId) {
    const trovate = await sb(`/rest/v1/quote_anagrafiche?email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
    anagId = Array.isArray(trovate) && trovate[0] ? trovate[0].id : null;
  }
  const campi = {
    nominativo: `${assoc.cognome} ${assoc.nome}`.trim(),
    cognome: assoc.cognome, nome: assoc.nome, email,
    telefono: assoc.telefono || null,
    consenso_marketing: !!consensoMarketing,
  };
  if (anagId) {
    /* Su un'anagrafica che esisteva gia' si aggiorna il consenso — e' la
       manifestazione di volonta' piu' recente — e si completano i recapiti
       mancanti, senza sovrascrivere quello che c'e' gia'. */
    await sb(`/rest/v1/quote_anagrafiche?id=eq.${encodeURIComponent(anagId)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ consenso_marketing: !!consensoMarketing }),
    });
  } else {
    const creata = await sb('/rest/v1/quote_anagrafiche', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify(campi),
    });
    anagId = (Array.isArray(creata) ? creata[0] : creata)?.id || null;
  }
  if (!anagId) return null;

  // 2. Il gruppo della convenzione: si crea alla prima conferma, non prima.
  let gruppoId = conv.gruppo_id || null;
  if (!gruppoId) {
    const g = await sb('/rest/v1/quote_gruppi', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        nome: 'Convenzione ' + (conv.nome || ''),
        tipo: GRUPPO_CONVENZIONE,
        note: 'Creato da solo: ci entrano gli associati che completano i dati nell\'area riservata.',
      }),
    });
    gruppoId = (Array.isArray(g) ? g[0] : g)?.id || null;
    if (gruppoId) {
      await sb(`/rest/v1/quote_convenzioni?id=eq.${encodeURIComponent(conv.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ gruppo_id: gruppoId }),
      });
    }
  }

  // 3. Dentro al gruppo. Se c'e' gia', non e' un errore: e' che ci era gia'.
  if (gruppoId) {
    try {
      await sb('/rest/v1/quote_gruppi_membri', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ gruppo_id: gruppoId, anagrafica_id: anagId, ruolo: 'associato' }),
      });
    } catch (e) { if (!/duplicate|unique|conflict/i.test(e.message || '')) throw e; }
  }
  return anagId;
}

convenzionatiRouter_pubblicoAssociati.post('/miei-dati', async (req, res) => {
  try {
    const { assoc } = await chiEntra(req);
    const b = req.body || {};
    const codice = String(b.codice || '').trim();
    if (!codice) return res.status(400).json({ error: 'Serve il codice che ti abbiamo mandato per email.' });
    if (!assoc.otp_hash || !assoc.otp_scade_il) return res.status(400).json({ error: 'Nessun codice in attesa: premi «Mandami il codice».' });
    if (new Date(assoc.otp_scade_il).getTime() < Date.now()) return res.status(400).json({ error: 'Il codice è scaduto: chiedine uno nuovo.' });
    if (impronta(codice + ':' + assoc.id) !== assoc.otp_hash) return res.status(400).json({ error: 'Codice non corretto. Controlla l\'email e riprova.' });
    if (!b.privacy) return res.status(400).json({ error: 'Senza il consenso al trattamento dei dati non possiamo procedere.' });

    /* Il consenso si salva CON LA DATA E LA VERSIONE del testo su cui e' stato
       dato. Una spunta senza queste due cose, fra due anni, non dimostra
       niente: non si saprebbe ne' quando ne' su che cosa. */
    await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(assoc.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        nome: String(b.nome || assoc.nome).trim(),
        cognome: String(b.cognome || assoc.cognome).trim(),
        telefono: String(b.telefono || '').trim() || assoc.telefono,
        privacy_accettata_il: new Date().toISOString(),
        privacy_versione: String(b.versione_privacy || 'v1'),
        /* SI SCRIVE QUI, non solo sull'anagrafica creata subito dopo: se quel
           passo fallisce — il 2 settembre 2026 e' successo — il consenso e'
           stato dato ma non resta scritto da nessuna parte da cui riprenderlo,
           e su un consenso non si tira a indovinare. */
        marketing_accettato: !!b.marketing,
        otp_hash: null, otp_scade_il: null,   // usato una volta sola
        ultimo_accesso: new Date().toISOString(),
      }),
    });

    /* Da qui in poi e' un'anagrafica dell'agenzia, dentro al gruppo della sua
       convenzione. Se qualcosa va storto NON si annulla il consenso appena
       registrato: quello vale comunque, ed e' la cosa che conta. Si dice nel
       log e si va avanti — l'aggancio si potra' rifare. */
    try {
      /* Il gruppo si LEGGE dalla convenzione, non si presume assente: passando
         sempre «nessun gruppo» se ne sarebbe creato uno nuovo a ogni associato,
         e la convenzione avrebbe finito per avere venti gruppi da una persona
         l'uno — inutili per le campagne, che e' esattamente lo scopo. */
      const righeConv = await sb(`/rest/v1/quote_convenzioni?id=eq.${encodeURIComponent(assoc.convenzione_id)}&select=id,nome,gruppo_id`);
      const conv = (Array.isArray(righeConv) ? righeConv[0] : null) || { id: assoc.convenzione_id, nome: (assoc.quote_convenzioni || {}).nome, gruppo_id: null };
      const anagId = await nelGruppoDellaConvenzione(
        { ...assoc, nome: String(b.nome || assoc.nome).trim(), cognome: String(b.cognome || assoc.cognome).trim(), telefono: String(b.telefono || '').trim() || assoc.telefono },
        conv, !!b.marketing);
      if (anagId && !assoc.anagrafica_id) {
        await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(assoc.id)}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ anagrafica_id: anagId }),
        });
      }
    } catch (e) {
      console.warn('[convenzionati] dati confermati ma aggancio al gruppo non riuscito:', e.message);
    }
    return res.json({ ok: true });
  } catch (e) { return res.status(e.stato || 500).json({ error: e.message || 'Errore imprevisto.' }); }
});

/* ── LA RICHIESTA DI QUOTAZIONE ───────────────────────────────────────────────
   «Scegli» finiva in un avviso che diceva «lo stiamo completando». Da qui in
   poi finisce in una richiesta vera: arriva ad amministrazione, si vede nel
   pannello, e l'associato riceve la conferma che e' partita.

   QUALI DOMANDE FARE LE DECIDE IL PANNELLO, non questo file. Ogni prodotto
   porta con se' l'elenco dei campi da chiedere (targa, professione, indirizzo
   ...): cosi' un prodotto nuovo non ha bisogno di una riga di codice per
   chiedere una cosa diversa. Qui si controlla solo che i campi segnati come
   obbligatori siano stati riempiti — e si controlla QUI, non nel browser, dove
   sarebbe un suggerimento e non una regola.

   E SI SCARTA QUELLO CHE NON E' STATO CHIESTO: si tiene solo cio' che compare
   nell'elenco del prodotto. Senza, chiunque potrebbe spedire mezzo megabyte di
   roba a caso e ce la ritroveremmo salvata e stampata dentro un'email. */
const MAX_RISPOSTA = 500;

export function rispostePulite(campi, inviate) {
  const dentro = {}, mancano = [];
  for (const c of Array.isArray(campi) ? campi : []) {
    const k = String(c && c.k || '').trim();
    if (!k) continue;
    const v = String((inviate || {})[k] ?? '').trim().slice(0, MAX_RISPOSTA);
    if (v) dentro[k] = v;
    else if (c.obbligatorio) mancano.push(String(c.etichetta || k));
  }
  return { dentro, mancano };
}

export function emailRichiestaQuotazione({ prodotto, convenzione, nome, cognome, email, telefono, campi, risposte, note, decorrenza, link }) {
  const riga = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7488;font-size:13px;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;font-weight:700">${esc(v)}</td></tr>` : '';
  /* Le risposte si stampano NELL'ORDINE DELLE DOMANDE, con l'etichetta che ha
     visto l'associato. Una lista di chiavi tecniche in ordine sparso costringe
     chi legge a ricostruire che cosa gli era stato chiesto. */
  const dettagli = (Array.isArray(campi) ? campi : [])
    .map((c) => riga(c.etichetta || c.k, (risposte || {})[c.k])).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0b1437,#1b2a6b);padding:20px 22px;text-align:center"><img src="https://quoto.withusassicurazioni.it/withus-logo-white.png" alt="With Us Assicurazioni" style="height:44px"></div>
  <div style="padding:24px;color:#2b3346;font-size:15px;line-height:1.6">
    <h2 style="margin:0 0 6px;font-size:19px;color:#1d2740">Richiesta di quotazione</h2>
    <p style="margin:0 0 16px;color:#6b7488"><b>${esc(prodotto)}</b> · convenzione <b>${esc(convenzione)}</b></p>
    <table style="border-collapse:collapse">
      ${riga('Da', (cognome || '') + ' ' + (nome || ''))}
      ${riga('Email', email)}
      ${riga('Telefono', telefono)}
      ${riga('Decorrenza desiderata', decorrenza)}
    </table>
    ${dettagli ? `<div style="margin-top:16px;background:#f5f7fc;border-radius:10px;padding:12px 14px"><div style="font-size:12.5px;color:#6b7488;margin-bottom:6px">Quello che ha compilato</div><table style="border-collapse:collapse">${dettagli}</table></div>` : ''}
    ${note ? `<div style="margin-top:12px;background:#f5f7fc;border-radius:10px;padding:12px 14px"><div style="font-size:12.5px;color:#6b7488;margin-bottom:4px">Note</div>${esc(note)}</div>` : ''}
    <p style="text-align:center;margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;font-weight:800;padding:13px 26px;border-radius:12px">Apri le convenzioni</a></p>
  </div>
  <div style="padding:14px 24px;background:#f8f9fc;color:#8b93a7;font-size:12px">With Us Soc. Coop. · Email automatica, non rispondere a questo messaggio.</div>
</div>`;
}

export function emailRichiestaRicevuta({ nome, prodotto, convenzione }) {
  /* Serve a una cosa sola: togliere il dubbio «sara' partita?». Chi non riceve
     niente riprova, e ci ritroviamo la stessa richiesta tre volte. */
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0b1437,#1b2a6b);padding:20px 22px;text-align:center"><img src="https://quoto.withusassicurazioni.it/withus-logo-white.png" alt="With Us Assicurazioni" style="height:44px"></div>
  <div style="padding:24px;color:#2b3346;font-size:15px;line-height:1.6">
    <h2 style="margin:0 0 6px;font-size:19px;color:#1d2740">Abbiamo ricevuto la tua richiesta</h2>
    <p style="margin:0 0 14px">Ciao ${esc(nome || '')}, la tua richiesta per <b>${esc(prodotto)}</b> (convenzione ${esc(convenzione)}) è arrivata.</p>
    <p style="margin:0 0 14px">La prende in carico una persona dell'agenzia e ti risponde con il preventivo. Se nel frattempo ti serve qualcosa, scrivici o chiamaci: i contatti sono nella tua area riservata.</p>
    <p style="text-align:center;margin:22px 0"><a href="${esc(AREA_URL)}" style="display:inline-block;background:#3b5bfd;color:#fff;text-decoration:none;font-weight:800;padding:13px 26px;border-radius:12px">Vai alla tua area</a></p>
  </div>
  <div style="padding:14px 24px;background:#f8f9fc;color:#8b93a7;font-size:12px">With Us Soc. Coop. · Email automatica, non rispondere a questo messaggio.</div>
</div>`;
}

convenzionatiRouter_pubblicoAssociati.post('/richiesta', async (req, res) => {
  try {
    const { assoc } = await chiEntra(req);
    const b = req.body || {};

    /* Il prodotto si rilegge dal database, non si prende da quello che e'
       arrivato: nel browser il nome e i campi si cambiano in dieci secondi, e
       ci ritroveremmo a lavorare su una richiesta per un prodotto che non
       esiste o di un'altra convenzione. */
    const righe = await sb(`/rest/v1/quote_convenzione_prodotti?id=eq.${encodeURIComponent(String(b.prodotto_id || ''))}&select=*`);
    const prod = Array.isArray(righe) ? righe[0] : null;
    if (!prod || !prod.attivo || prod.convenzione_id !== assoc.convenzione_id) {
      return res.status(404).json({ error: 'Questo prodotto non è disponibile nella tua convenzione.' });
    }

    const { dentro, mancano } = rispostePulite(prod.campi, b.risposte);
    if (mancano.length) {
      return res.status(400).json({ error: 'Manca ancora: ' + mancano.join(', ') + '.' });
    }

    const nome = String(b.nome || assoc.nome || '').trim();
    const cognome = String(b.cognome || assoc.cognome || '').trim();
    const telefono = String(b.telefono || assoc.telefono || '').trim();
    const note = String(b.note || '').trim().slice(0, 2000) || null;
    /* Una data scritta storta non deve far fallire tutta la richiesta: si
       accetta solo se e' una data vera, altrimenti si lascia vuota e la si
       chiede a voce. */
    const dec = /^\d{4}-\d{2}-\d{2}$/.test(String(b.decorrenza || '')) ? String(b.decorrenza) : null;

    const conv = (assoc.quote_convenzioni || {}).nome || '';
    const creata = await sb('/rest/v1/quote_convenzione_richieste', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        associato_id: assoc.id, convenzione_id: assoc.convenzione_id,
        prodotto_id: prod.id, prodotto_nome: prod.nome,
        risposte: dentro, note, decorrenza: dec,
      }),
    });
    const rich = (Array.isArray(creata) ? creata[0] : creata) || {};

    /* Se i dati anagrafici sono cambiati mentre compilava, si tengono: e' il
       posto piu' naturale in cui una persona corregge il proprio numero. */
    if (telefono && telefono !== assoc.telefono) {
      try {
        await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(assoc.id)}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ telefono }),
        });
      } catch (e) { console.warn('[convenzionati] telefono non aggiornato:', e.message); }
    }

    /* Le email vengono DOPO il salvataggio e non lo annullano se falliscono:
       una richiesta salvata di cui non e' partito l'avviso si trova nel
       pannello; un avviso senza richiesta manda a cercare una riga che non
       esiste. */
    try {
      await inviaEmail(STAFF_INBOX, `Richiesta quotazione · ${prod.nome} · ${conv}`,
        emailRichiestaQuotazione({
          prodotto: prod.nome, convenzione: conv, nome, cognome, email: assoc.email, telefono,
          campi: prod.campi, risposte: dentro, note, decorrenza: dec,
          link: IAM_URL + '/?page=convenzioni',
        }));
    } catch (e) { console.warn('[convenzionati] avviso allo staff non partito:', e.message); }

    try {
      await inviaEmail(assoc.email, 'Abbiamo ricevuto la tua richiesta',
        emailRichiestaRicevuta({ nome, prodotto: prod.nome, convenzione: conv }));
    } catch (e) { console.warn('[convenzionati] conferma all\'associato non partita:', e.message); }

    return res.json({ ok: true, id: rich.id || null });
  } catch (e) { return res.status(e.stato || 500).json({ error: e.message || 'Errore imprevisto.' }); }
});

/* ── LE POLIZZE DELL'ASSOCIATO E IL RINNOVO ───────────────────────────────────
   «Il pagamento per i rinnovi dei prodotti che già ha con noi in scadenza, link
   attivo solo dopo nostro ok, perché ad esempio la polizza quell'anno è 200 e
   l'anno prossimo diventa 201€ o 199€» — Francesco, 02/09/2026.

   QUESTA REGOLA STA QUI E NON NEL BROWSER, e non e' un dettaglio: la pagina
   dell'area gira sul computer di chi la apre, e tutto quello che decide li' si
   puo' aggirare. Un link di pagamento con l'importo dell'anno scorso, o acceso
   prima che l'abbiamo guardato, e' un cliente che paga la cifra sbagliata.
   Quindi l'associato NON legge la tabella dei rinnovi: gli si consegna solo
   quello che puo' vedere, e a deciderlo e' una funzione sola.

   IL RINNOVO SPENTO NON ESISTE. Non si manda «attivo: false» lasciando alla
   pagina il compito di nascondere il pulsante: si manda `null`. Quello che non
   parte non si puo' mostrare per sbaglio. */
export function cosaVedeDelRinnovo(rin, coordinate) {
  if (!rin || rin.attivo !== true) return null;
  return {
    premio: rin.premio,
    scadenza: rin.scadenza || null,
    link: rin.link_pagamento || null,
    /* Le coordinate si allegano SOLO se quel rinnovo dice di pagare cosi'.
       Sono un dato dell'agenzia: non vanno consegnate a chi non deve farne
       niente. */
    bonifico: rin.bonifico ? (coordinate || null) : null,
    note: rin.note || null,
  };
}

async function coordinateBonifico() {
  /* NON SE NE FA UNA COPIA. Le coordinate dell'agenzia ci sono gia': stanno
     nelle impostazioni (chiave «bonifico»), si cambiano dal pannello alla voce
     «Metodi di pagamento», e le legge gia' il negozio. Un IBAN scritto in due
     posti e' un IBAN che, il giorno in cui cambia, resta sbagliato in uno dei
     due — e quel giorno il bonifico va a un conto che non e' piu' nostro. */
  try {
    const b = await getBonificoCfg();
    return (b && b.iban) ? b : null;
  } catch (e) {
    console.warn('[convenzionati] coordinate bonifico non lette:', e.message);
    return null;
  }
}

convenzionatiRouter_pubblicoAssociati.post('/mie-polizze', async (req, res) => {
  try {
    let { assoc } = await chiEntra(req);
    /* SI RIPARA DA SOLO. Chi ha dato il consenso ma non ha un'anagrafica e'
       rimasto a meta' per un guasto nostro: il 2 settembre 2026 l'aggancio al
       gruppo falliva su un valore che il database non accettava, e la persona
       restava fuori senza accorgersene. Il commento in «miei-dati» diceva gia'
       «l'aggancio si potra' rifare»: ecco dove si rifa', alla prima visita,
       senza chiederle niente di nuovo. */
    if (!assoc.anagrafica_id && assoc.privacy_accettata_il) {
      try {
        const righeConv = await sb(`/rest/v1/quote_convenzioni?id=eq.${encodeURIComponent(assoc.convenzione_id)}&select=id,nome,gruppo_id`);
        const conv = (Array.isArray(righeConv) ? righeConv[0] : null)
          || { id: assoc.convenzione_id, nome: (assoc.quote_convenzioni || {}).nome, gruppo_id: null };
        const anagId = await nelGruppoDellaConvenzione(assoc, conv, !!assoc.marketing_accettato);
        if (anagId) {
          await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(assoc.id)}`, {
            method: 'PATCH', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ anagrafica_id: anagId }),
          });
          assoc = { ...assoc, anagrafica_id: anagId };
          console.log('[convenzionati] aggancio al gruppo recuperato per', assoc.email);
        }
      } catch (e) { console.warn('[convenzionati] recupero aggancio non riuscito:', e.message); }
    }
    /* Finche' non ha completato i dati anagrafici non e' ancora un cliente
       dell'agenzia: non c'e' niente da mostrare, e non e' un errore. */
    if (!assoc.anagrafica_id) return res.json({ polizze: [] });

    const pol = await sb(`/rest/v1/quote_polizze?cliente_id=eq.${encodeURIComponent(assoc.anagrafica_id)}`
      + '&select=id,numero_polizza,prodotto,compagnia,data_effetto,data_scadenza,premio_annuo,stato_pagamento,perfezionata'
      + '&order=data_scadenza.desc.nullslast&limit=100');
    const polizze = Array.isArray(pol) ? pol : [];
    if (!polizze.length) return res.json({ polizze: [] });

    const ids = polizze.map((p) => p.id);
    let rinnovi = [];
    try {
      rinnovi = await sb('/rest/v1/quote_rinnovi?polizza_id=in.(' + ids.map(encodeURIComponent).join(',') + ')&select=*');
    } catch (e) { console.warn('[convenzionati] rinnovi non letti:', e.message); }
    const perPolizza = new Map((Array.isArray(rinnovi) ? rinnovi : []).map((r) => [r.polizza_id, r]));

    /* Le coordinate si chiedono una volta sola, e solo se servono davvero a
       qualcuno di questi rinnovi. */
    const serveIban = (Array.isArray(rinnovi) ? rinnovi : []).some((r) => r.attivo && r.bonifico);
    const coord = serveIban ? await coordinateBonifico() : null;

    return res.json({
      polizze: polizze.map((p) => ({
        id: p.id,
        numero: p.numero_polizza || null,
        prodotto: p.prodotto || null,
        compagnia: p.compagnia || null,
        dal: p.data_effetto || null,
        al: p.data_scadenza || null,
        premio: p.premio_annuo,
        pagata: p.stato_pagamento === 'pagata' || p.stato_pagamento === 'incassata',
        rinnovo: cosaVedeDelRinnovo(perPolizza.get(p.id), coord),
      })),
    });
  } catch (e) { return res.status(e.stato || 500).json({ error: e.message || 'Errore imprevisto.' }); }
});

/* ── L'ANAGRAFICA DELL'ASSOCIATO ──────────────────────────────────────────────
   La compila lui, ma PASSA DA QUI. Non perche' non ci si fidi: perche' su
   quella riga ci sono anche cose che non sono sue — se e' un lead, chi e'
   l'intermediario, chi l'ha creata. Aprirla in scrittura dal browser vorrebbe
   dire aprirla tutta, e allora si sceglie: si elencano i campi che puo'
   toccare, e tutto il resto non si muove.

   COSA VUOL DIRE «COMPLETA». Non «tutti i campi pieni»: quelli che servono a
   fare un preventivo e a emettere. Senza codice fiscale e data di nascita non
   si quota, senza indirizzo non si emette, senza un numero non si richiama.
   Il resto e' un di piu' e non deve accendere nessun allarme. */
export const CAMPI_ANAGRAFICA = [
  { k: 'cognome',        et: 'Cognome',           serve: true },
  { k: 'nome',           et: 'Nome',              serve: true },
  { k: 'codice_fiscale', et: 'Codice fiscale',    serve: true },
  { k: 'data_nascita',   et: 'Data di nascita',   serve: true, tipo: 'data' },
  { k: 'indirizzo',      et: 'Indirizzo',         serve: true },
  { k: 'civico',         et: 'Civico',            serve: true },
  { k: 'cap',            et: 'CAP',               serve: true },
  { k: 'comune',         et: 'Comune',            serve: true },
  { k: 'provincia',      et: 'Provincia',         serve: true },
  { k: 'cellulare',      et: 'Cellulare',         serve: true },
  { k: 'email',          et: 'Email',             serve: true },
  { k: 'professione',    et: 'Professione',       serve: false },
  { k: 'partita_iva',    et: 'Partita IVA',       serve: false },
  { k: 'pec',            et: 'PEC',               serve: false },
];

export function cosaMancaAllAnagrafica(a) {
  /* Si restituiscono le ETICHETTE, non i nomi delle colonne: chi legge ha
     appena guardato un modulo dove c'era scritto «Codice fiscale», e
     «codice_fiscale» non lo riconosce come la stessa cosa. */
  return CAMPI_ANAGRAFICA
    .filter((c) => c.serve && !String((a || {})[c.k] ?? '').trim())
    .map((c) => c.et);
}

const CF_RE = /^[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/i;

export function anagraficaStorta(d) {
  /* Non si controlla tutto: si controllano le due cose che, sbagliate, fanno
     tornare indietro un preventivo — e si controllano solo SE sono state
     scritte, perche' «incompleto» e' un'altra cosa da «sbagliato». */
  const cf = String((d || {}).codice_fiscale || '').trim();
  if (cf && !CF_RE.test(cf)) return 'Il codice fiscale non sembra giusto: sono 16 caratteri, lettere e numeri.';
  const cap = String((d || {}).cap || '').trim();
  if (cap && !/^\d{5}$/.test(cap)) return 'Il CAP è di cinque cifre.';
  const em = String((d || {}).email || '').trim();
  if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return 'Quell\'indirizzo email non sembra giusto.';
  return null;
}

async function miaAnagrafica(assoc) {
  if (!assoc.anagrafica_id) return null;
  const r = await sb(`/rest/v1/quote_anagrafiche?id=eq.${encodeURIComponent(assoc.anagrafica_id)}&select=*`);
  return (Array.isArray(r) ? r[0] : null) || null;
}

/* Si consegna SOLO quello che puo' vedere e toccare. La riga intera contiene
   anche note interne dell'agenzia: non e' roba sua e non deve uscire. */
function anagraficaPulita(a) {
  const fuori = {};
  for (const c of CAMPI_ANAGRAFICA) fuori[c.k] = (a || {})[c.k] ?? null;
  return fuori;
}

/* ── QUANDO L'ANAGRAFICA ESISTE GIA' ──────────────────────────────────────────
   Il 2 settembre 2026 Francesco ha compilato i dati come associato e si e'
   sentito rispondere:

     duplicate key value violates unique constraint "idx_anag_cf_unico"

   Non era un guasto: era la verita'. Quella persona era GIA' nel sistema — con
   un'email diversa, e con quattro preventivi alle spalle. Noi le avevamo creato
   un'anagrafica nuova perche' al momento dell'iscrizione l'unica cosa che
   sapevamo era l'email, e quella non combaciava.

   IL CODICE FISCALE E' IL MOMENTO IN CUI SI SCOPRE. Prima non si poteva sapere;
   adesso si', ed e' li' che le due si uniscono — invece di fermare la persona
   davanti a un messaggio in inglese che non le dice niente.

   COSA VUOL DIRE UNIRE, e cosa NON vuol dire:
     · si RIEMPIONO i campi vuoti di quella che c'era gia';
     · non si SOVRASCRIVE mai un campo che l'agenzia aveva gia' riempito — su
       quella riga ci sono polizze e preventivi, e un indirizzo cambiato da
       fuori senza che nessuno lo guardi e' una polizza spedita altrove;
     · le differenze si SCRIVONO nelle note, perche' qualcuno le guardi: se una
       persona dice che il suo numero e' un altro, e' un'informazione, non un
       errore da buttare. */
export function campiDaColmare(esistente, nuovi, etichette) {
  const colma = {}, diverse = [];
  const et = (k) => ((etichette || []).find((c) => c.k === k) || {}).et || k;
  for (const k of Object.keys(nuovi || {})) {
    const nuovo = String(nuovi[k] ?? '').trim();
    if (!nuovo) continue;
    const vecchio = String((esistente || {})[k] ?? '').trim();
    if (!vecchio) { colma[k] = nuovi[k]; continue; }
    /* Uguale a meno di maiuscole e spazi non e' una differenza: segnalarla
       vorrebbe dire riempire le note di rumore, e poi non si legge piu' niente. */
    if (vecchio.toLowerCase().replace(/\s+/g, ' ') !== nuovo.toLowerCase().replace(/\s+/g, ' ')) {
      diverse.push(et(k) + ': noi «' + vecchio + '», lui «' + nuovo + '»');
    }
  }
  return { colma, diverse };
}

async function unisciAllAnagraficaEsistente(assoc, cf, dati) {
  const CF = String(cf || '').trim().toUpperCase();
  if (!CF) return null;
  const trovate = await sb(`/rest/v1/quote_anagrafiche?codice_fiscale=eq.${encodeURIComponent(CF)}&select=*&limit=2`);
  const altra = (Array.isArray(trovate) ? trovate : []).find((a) => a.id !== assoc.anagrafica_id);
  if (!altra) return null;

  const { colma, diverse } = campiDaColmare(altra, dati, CAMPI_ANAGRAFICA);
  if (diverse.length) {
    /* Si AGGIUNGE in fondo, non si riscrive: le note di un cliente sono di chi
       ci ha lavorato prima, e cancellarle per far posto a una nostra riga e'
       il modo piu' rapido per perdere qualcosa che serviva. */
    const oggi = new Date().toLocaleDateString('it-IT');
    colma.note = String(altra.note || '').trim()
      + (altra.note ? '\n\n' : '')
      + '[' + oggi + '] Dall\'area riservata l\'interessato ha indicato dati diversi dai nostri: '
      + diverse.join('; ') + '. Da verificare.';
  }
  if (Object.keys(colma).length) {
    await sb(`/rest/v1/quote_anagrafiche?id=eq.${encodeURIComponent(altra.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(colma) });
  }

  /* Il gruppo della convenzione seguiva l'anagrafica appena creata: senza
     spostarlo, la persona sparirebbe dal gruppo proprio mentre la si unisce. */
  const vecchia = assoc.anagrafica_id;
  if (vecchia) {
    try {
      const membri = await sb(`/rest/v1/quote_gruppi_membri?anagrafica_id=eq.${encodeURIComponent(vecchia)}&select=gruppo_id`);
      for (const m of (Array.isArray(membri) ? membri : [])) {
        try {
          await sb('/rest/v1/quote_gruppi_membri', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ gruppo_id: m.gruppo_id, anagrafica_id: altra.id, ruolo: 'associato' }) });
        } catch (e) { if (!/duplicate|unique|conflict/i.test(e.message || '')) throw e; }
      }
      await sb(`/rest/v1/quote_gruppi_membri?anagrafica_id=eq.${encodeURIComponent(vecchia)}`, { method: 'DELETE' });
    } catch (e) { console.warn('[convenzionati] gruppi non spostati:', e.message); }
  }

  await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(assoc.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ anagrafica_id: altra.id }) });

  /* LA VECCHIA SI CANCELLA SOLO SE NON CI PENDE NIENTE. Se qualcuno le avesse
     gia' attaccato una polizza o un preventivo, cancellarla vorrebbe dire
     perderli: in quel caso resta li', vuota, e non fa danno a nessuno. */
  if (vecchia) {
    try {
      const [pol, prev] = await Promise.all([
        sb(`/rest/v1/quote_polizze?cliente_id=eq.${encodeURIComponent(vecchia)}&select=id&limit=1`),
        sb(`/rest/v1/quote_preventivi?cliente_id=eq.${encodeURIComponent(vecchia)}&select=id&limit=1`),
      ]);
      if (!(pol || []).length && !(prev || []).length) {
        await sb(`/rest/v1/quote_anagrafiche?id=eq.${encodeURIComponent(vecchia)}`, { method: 'DELETE' });
      }
    } catch (e) { console.warn('[convenzionati] doppione non rimosso:', e.message); }
  }

  console.log('[convenzionati] anagrafica unita a quella gia\' in archivio:', assoc.email, '->', altra.id,
    diverse.length ? '(' + diverse.length + ' dati da verificare)' : '');
  return altra.id;
}

convenzionatiRouter_pubblicoAssociati.post('/mia-anagrafica', async (req, res) => {
  try {
    const { assoc } = await chiEntra(req);
    const a = await miaAnagrafica(assoc);
    if (!a) return res.json({ anagrafica: null, manca: [] });
    return res.json({ anagrafica: anagraficaPulita(a), manca: cosaMancaAllAnagrafica(a) });
  } catch (e) { return res.status(e.stato || 500).json({ error: e.message || 'Errore imprevisto.' }); }
});

convenzionatiRouter_pubblicoAssociati.post('/salva-anagrafica', async (req, res) => {
  try {
    let { assoc } = await chiEntra(req);
    if (!assoc.anagrafica_id) {
      const e = new Error('I tuoi dati non sono ancora stati creati: riapri l\'area fra un minuto.');
      e.stato = 409; throw e;
    }
    const b = req.body || {};
    const storto = anagraficaStorta(b);
    if (storto) return res.status(400).json({ error: storto });

    /* SI COSTRUISCE DALL'ELENCO, non da quello che e' arrivato: cosi' un campo
       in piu' nella richiesta — «lead», «intermediario_id», «creato_da» — non
       ha nessuna strada per finire nella scrittura. */
    const dati = {};
    for (const c of CAMPI_ANAGRAFICA) {
      if (!(c.k in b)) continue;
      const v = String(b[c.k] ?? '').trim().slice(0, 200);
      if (c.tipo === 'data') dati[c.k] = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      else dati[c.k] = v || null;
    }
    if (!Object.keys(dati).length) return res.status(400).json({ error: 'Non c\'è niente da salvare.' });
    if (dati.codice_fiscale) dati.codice_fiscale = dati.codice_fiscale.toUpperCase();
    if (dati.provincia) dati.provincia = dati.provincia.toUpperCase().slice(0, 2);

    /* PRIMA DI SCRIVERE, SI GUARDA SE QUELLA PERSONA C'E' GIA'. Il codice
       fiscale e' il momento in cui si scopre: all'iscrizione sapevamo solo
       l'email, e se non combaciava le abbiamo creato una riga nuova. Se non lo
       facessimo qui, il database rifiuterebbe la scrittura con un messaggio in
       inglese e la persona resterebbe ferma davanti a un errore che non la
       riguarda — ed e' esattamente cosa e' successo il 2 settembre 2026. */
    if (dati.codice_fiscale) {
      try {
        const unita = await unisciAllAnagraficaEsistente(assoc, dati.codice_fiscale, dati);
        if (unita) {
          /* Da qui in poi si lavora su quella vera, e le sue polizze e i suoi
             preventivi diventano suoi anche nell'area — senza fare niente. */
          assoc = { ...assoc, anagrafica_id: unita };
          const dopo = await miaAnagrafica(assoc);
          return res.json({ ok: true, unita: true, anagrafica: anagraficaPulita(dopo), manca: cosaMancaAllAnagrafica(dopo) });
        }
      } catch (e) {
        console.warn('[convenzionati] unione anagrafiche non riuscita:', e.message);
        const err = new Error('Questo codice fiscale risulta già nel nostro archivio e non siamo riusciti a unire le due schede: scrivici, ci pensiamo noi.');
        err.stato = 409; throw err;
      }
    }
    /* Il nominativo si tiene allineato a nome e cognome: e' quello che si legge
       in tutte le altre schermate, e se resta indietro l'anagrafica sembra di
       un'altra persona. */
    if (dati.cognome || dati.nome) {
      const a = await miaAnagrafica(assoc);
      dati.nominativo = `${dati.cognome ?? (a || {}).cognome ?? ''} ${dati.nome ?? (a || {}).nome ?? ''}`.trim() || (a || {}).nominativo;
    }

    await sb(`/rest/v1/quote_anagrafiche?id=eq.${encodeURIComponent(assoc.anagrafica_id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(dati),
    });
    const dopo = await miaAnagrafica(assoc);
    return res.json({ ok: true, anagrafica: anagraficaPulita(dopo), manca: cosaMancaAllAnagrafica(dopo) });
  } catch (e) { return res.status(e.stato || 500).json({ error: e.message || 'Errore imprevisto.' }); }
});

/* ── CHI C'E' ADESSO ──────────────────────────────────────────────────────────
   «Dammi un contatore per utenti online in quel momento e quanti utenti sono
   entrati» — Francesco, 02/09/2026.

   UNA RIGA PER PERSONA, NON UNA PER VISITA. Quello che serve sapere e' «c'e'
   adesso?» e «quante volte e' venuto?»: un registro di ogni battito sarebbe
   migliaia di righe al giorno per dire due numeri, e fra un anno sarebbe un
   archivio da svuotare.

   E UN ACCESSO NON E' UN BATTITO. L'area manda un segnale ogni minuto: contarli
   tutti vorrebbe dire che chi resta aperto mezz'ora e' entrato trenta volte. Si
   conta un accesso nuovo solo quando fra un battito e l'altro e' passato piu'
   del silenzio qui sotto — cioe' quando se n'era andato davvero. */
const SILENZIO_MIN = Number(process.env.PRESENZA_SILENZIO_MIN || 30);

export function eUnAccessoNuovo(ultimoPing, adesso, silenzioMin) {
  if (!ultimoPing) return true;                 // la prima volta in assoluto
  const t = new Date(ultimoPing).getTime();
  if (!Number.isFinite(t)) return true;         // una data storta non deve far perdere l'accesso
  const minuti = ((adesso instanceof Date ? adesso.getTime() : Number(adesso)) - t) / 60000;
  return minuti >= (silenzioMin == null ? 30 : silenzioMin);
}

convenzionatiRouter_pubblicoAssociati.post('/sono-qui', async (req, res) => {
  try {
    const { assoc } = await chiEntra(req);
    const adesso = new Date();
    let riga = null;
    try {
      const r = await sb(`/rest/v1/quote_presenze?associato_id=eq.${encodeURIComponent(assoc.id)}&select=*`);
      riga = Array.isArray(r) ? r[0] : null;
    } catch (e) { /* se non si riesce a leggere si riparte da zero: e' un contatore */ }

    const nuovo = eUnAccessoNuovo(riga && riga.ultimo_ping, adesso, SILENZIO_MIN);
    const campi = {
      associato_id: assoc.id, convenzione_id: assoc.convenzione_id,
      ultimo_ping: adesso.toISOString(),
    };
    if (nuovo) {
      campi.ultimo_accesso = adesso.toISOString();
      campi.accessi = ((riga && riga.accessi) || 0) + 1;
    }
    if (!riga) { campi.primo_accesso = adesso.toISOString(); campi.accessi = 1; }

    await sb('/rest/v1/quote_presenze', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(campi),
    });
    /* Si tiene aggiornato anche l'ultimo accesso sulla riga dell'associato: e'
       li' che lo cerca chi guarda la scheda della convenzione, e due posti che
       dicono cose diverse sono peggio di uno solo. */
    if (nuovo) {
      try {
        await sb(`/rest/v1/quote_convenzione_associati?id=eq.${encodeURIComponent(assoc.id)}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ ultimo_accesso: adesso.toISOString() }),
        });
      } catch (e) { /* il contatore ha gia' fatto il suo lavoro */ }
    }
    /* Non si risponde niente di utile di proposito: e' un battito, e la pagina
       non deve sapere chi altro c'e'. */
    return res.json({ ok: true });
  } catch (e) {
    /* UN BATTITO CHE NON RIESCE NON DEVE FAR VEDERE UN ERRORE A NESSUNO: chi
       sta guardando le sue polizze non c'entra niente con il nostro contatore.
       Si dice ok lo stesso, e il motivo resta nel log. */
    if (e.stato === 401 || e.stato === 403) return res.status(e.stato).json({ error: e.message });
    console.warn('[convenzionati] presenza non registrata:', e.message);
    return res.json({ ok: true });
  }
});

export default convenzionatiRouter;
