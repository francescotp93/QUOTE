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

export const convenzionatiRouter = Router();

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const AREA_URL = (process.env.AREA_CONVENZIONATI_URL || 'https://quoto.withusassicurazioni.it/area.html').replace(/\/$/, '');
const NOTIFY_FROM = process.env.NOTIFY_FROM || 'noreply@withusassicurazioni.it';
const NOTIFY_NAME = process.env.NOTIFY_NAME || 'With Us Assicurazioni';
const STAFF_INBOX = process.env.STAFF_EMAIL || 'intermediari@withusassicurazioni.it';
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
    const suoRuolo = (u.user_metadata || {}).ruolo;
    if (suoRuolo && suoRuolo !== 'associato') {
      const err = new Error('Questo indirizzo ha già un accesso alla piattaforma che non è quello di un associato. Va guardato a mano prima di procedere.');
      err.stato = 409;
      throw err;
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

export default convenzionatiRouter;
