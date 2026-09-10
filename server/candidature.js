// ═══════════════════════════════════════════════════════════════════════════════
//  CANDIDATURE — il primo contatto di chi vuole collaborare con noi
//
//  Una sola pagina pubblica (candidatura.html) e due rotte. Chi compila lascia
//  i recapiti e finisce li': nessun account, nessuna credenziale, nessun
//  accesso a IAM. Nasce una riga in quote_collaboratori con stato 'candidato',
//  e da li' in poi decide una persona.
//
//  PERCHE' PASSA DAL SERVER E NON DRITTO AL DATABASE
//  La policy collab_insert richiede iam_is_admin(), e resta cosi'. Aprire un
//  insert anonimo su una tabella che contiene codici fiscali vorrebbe dire
//  regalare due cose insieme: lo spam e l'enumerazione (provare mille email
//  per scoprire chi c'e' dentro). Il modulo chiede, il server scrive.
//
//  LA PRESA D'ATTO DELL'INFORMATIVA, E PERCHE' SI RICONTROLLA QUI
//  La casella spuntata nel browser non prova niente: chiunque puo' mandare una
//  POST saltandola. Il controllo vero e' questo, e non si fida nemmeno della
//  versione che arriva dal modulo: testo e impronta si rileggono da
//  privacy_versioni, che nessuno puo' modificare (c'e' un trigger che ferma
//  anche la chiave di servizio). Cosi' quello che finisce in archivio non e'
//  «ha spuntato una casella» ma «gli e' stato mostrato ESATTAMENTE questo
//  testo», e lo si puo' dimostrare due anni dopo.
//
//  NON E' UN CONSENSO. L'esame della candidatura si fonda su misure
//  precontrattuali richieste dall'interessato (art. 6.1.b GDPR); la
//  conservazione per 24 mesi sul legittimo interesse (art. 6.1.f), con diritto
//  di opposizione. Chiamarlo consenso ci indebolirebbe: il consenso si revoca,
//  e ci obbligherebbe formalmente a smettere di valutare uno che si e'
//  proposto da solo.
//
//  QUI DENTRO NON C'E' EXPRESS, ed e' voluto: le rotte stanno in
//  candidatureRotte.js e questo file resta due funzioni che prendono una
//  richiesta e tornano { stato, dato }. Nel repository express non e' nemmeno
//  fra le dipendenze — le prove che lo importano non girano — e questa e'
//  l'unica rotta del backend aperta a chiunque: e' quella che deve avere le
//  prove, non quella che puo' permettersi di non averle. Stessa divisione di
//  hdiApi.js / hdiApiRoutes.js.
// ═══════════════════════════════════════════════════════════════════════════════
import { MITTENTE_NOME } from './mittente.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const STAFF_INBOX  = process.env.CANDIDATURE_EMAIL || process.env.CONVENZIONI_EMAIL || 'amministrazione@withusassicurazioni.it';
const NOTIFY_FROM  = process.env.NOTIFY_FROM || 'noreply@withusassicurazioni.it';
const MESI_CONSERVAZIONE = 24;

function srvKey() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return k;
}

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

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const testo = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

/* Da dietro il proxy l'indirizzo vero e' il PRIMO della catena: gli altri sono
   i passaggi intermedi. Serve a dimostrare da dove e' arrivata la presa d'atto,
   quindi si conserva insieme al resto e sparisce con la scheda. */
function ipDi(req) {
  const catena = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (catena || req.ip || '').slice(0, 45) || null;
}

/* UN FRENO, NON UNA SERRATURA. In memoria: su un ambiente che scala a piu'
   istanze vale per istanza, e chi ci tiene davvero lo aggira. Serve contro il
   modulo compilato cento volte di fila — quello che capita, non l'attacco
   mirato. Il freno vero, se un giorno servira', va davanti al server. */
const TENTATIVI = new Map();
const FINESTRA_MS = 60 * 60 * 1000;
const MAX_PER_IP = 6;
function troppiTentativi(ip) {
  if (!ip) return false;
  const ora = Date.now();
  const lista = (TENTATIVI.get(ip) || []).filter((t) => ora - t < FINESTRA_MS);
  lista.push(ora);
  TENTATIVI.set(ip, lista);
  if (TENTATIVI.size > 5000) TENTATIVI.clear();   // non cresce all'infinito
  return lista.length > MAX_PER_IP;
}

/* ── GET /candidature/informativa ─────────────────────────────────────────────
   La versione corrente si RICAVA: la piu' recente per documento. Non c'e' una
   colonna «corrente» perche' andrebbe spenta sulla riga vecchia, e le righe
   pubblicate non si toccano piu'.
   La pagina mostra QUESTO testo, non una copia scritta nel suo HTML: cosi' il
   testo mostrato e quello archiviato non possono divergere. */
export async function leggiInformativa() {
  try {
    const r = await sb('/rest/v1/privacy_versioni?documento=eq.informativa_candidature'
      + '&select=versione,testo,hash,pubblicata_il&order=pubblicata_il.desc&limit=1');
    const v = Array.isArray(r) ? r[0] : null;
    if (!v) return { stato: 503, dato: { error: 'informativa_mancante' } };
    return { stato: 200, dato: v };
  } catch (e) {
    return { stato: 500, dato: { error: e.message } };
  }
}

/* ── POST /candidature ────────────────────────────────────────────────────────
   Sempre la stessa risposta a chi compila, qualunque cosa troviamo dall'altra
   parte. Rispondere «sei gia' in elenco» o «sei in black list» direbbe a
   chiunque, provando un'email alla volta, chi conosciamo e cosa ne pensiamo. */
export async function creaCandidatura(req) {
  try {
    const b = req.body || {};
    const ip = ipDi(req);
    if (troppiTentativi(ip)) return { stato: 429, dato: { error: 'troppe_richieste' } };

    const nome     = testo(b.nome, 80);
    const cognome  = testo(b.cognome, 80);
    const email    = testo(b.email, 120).toLowerCase();
    const telefono = testo(b.telefono, 30);
    const citta    = testo(b.comune, 80);
    const provincia= testo(b.provincia, 4).toUpperCase();
    const sezione  = testo(b.rui_stato, 10);        // 'E' | 'altra' | 'no'
    const rui      = testo(b.rui, 30).toUpperCase();
    const messaggio= testo(b.messaggio, 500);

    if (!nome || !cognome || !email || !telefono || !citta) {
      return { stato: 400, dato: { error: 'Servono nome, cognome, email, telefono e comune.' } };
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
      return { stato: 400, dato: { error: 'L\'indirizzo email non è valido.' } };
    }
    if (!['E', 'altra', 'no'].includes(sezione)) {
      return { stato: 400, dato: { error: 'Dicci se sei iscritto al RUI.' } };
    }
    if (sezione !== 'no' && !rui) {
      return { stato: 400, dato: { error: 'Serve il numero di iscrizione RUI.' } };
    }

    /* LA PRESA D'ATTO, RICONTROLLATA QUI. Senza, una POST diretta creerebbe una
       scheda senza che a quella persona sia stato mostrato niente. */
    if (b.privacy !== true) return { stato: 400, dato: { error: 'privacy_mancante' } };

    /* E la versione si rilegge dall'archivio: quella che arriva dal modulo dice
       solo COSA sostiene di aver visto. L'impronta la mettiamo noi. */
    const vers = await sb('/rest/v1/privacy_versioni?documento=eq.informativa_candidature'
      + '&select=versione,hash&order=pubblicata_il.desc&limit=1');
    const informativa = Array.isArray(vers) ? vers[0] : null;
    if (!informativa) return { stato: 503, dato: { error: 'informativa_mancante' } };

    /* GIA' IN ELENCO, O IN BLACK LIST. In entrambi i casi non nasce una seconda
       scheda: la prima porta la storia, le note e — se c'e' — il motivo per cui
       era stata chiusa. Allo staff lo diciamo, a chi compila no. */
    const esistenti = await sb('/rest/v1/quote_collaboratori?email=eq.' + encodeURIComponent(email)
      + '&select=id,stato,nome,cognome&limit=1');
    const gia = Array.isArray(esistenti) ? esistenti[0] : null;

    const oggi = new Date();
    const scadenza = new Date(oggi);
    scadenza.setMonth(scadenza.getMonth() + MESI_CONSERVAZIONE);
    const iso = (d) => d.toISOString().slice(0, 10);

    /* Chi ha generato il link. Da IAM esce come ?r=<codice>: cosi' si vede chi
       ha portato chi, senza chiedere niente a chi compila. */
    const rif = testo(b.rif, 40).replace(/[^A-Za-z0-9._-]/g, '');

    if (gia) {
      /* La nota resta attaccata alla scheda che c'e' gia': e' li' che qualcuno
         andra' a leggere, non in una riga nuova. */
      await sb('/rest/v1/quote_collaboratori_note', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          collaboratore_id: gia.id,
          autore_nome: 'Modulo pubblico',
          testo: 'Ha compilato di nuovo il modulo di candidatura il ' + iso(oggi)
               + (rif ? ' (link di ' + rif + ')' : '')
               + '. Scheda già presente con stato «' + (gia.stato || '—') + '»: non ne è stata creata un\'altra.'
               + (messaggio ? '\n\nHa scritto: ' + messaggio : ''),
        }),
      }).catch(() => {});

      await avvisaStaff({ nome: gia.nome || nome, cognome: gia.cognome || cognome, email, telefono,
                          citta, provincia, sezione, rui, messaggio, rif,
                          nota: 'Attenzione: è già in elenco con stato «' + (gia.stato || '—') + '». Non è stata creata una seconda scheda.' });
      return { stato: 200, dato: { ok: true, gia_inviata: true } };
    }

    await sb('/rest/v1/quote_collaboratori', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        nome, cognome, email, telefono,
        citta, provincia: provincia || null,
        stato: 'candidato',
        rui_sezione: sezione === 'no' ? null : sezione,
        rui_numero: sezione === 'no' ? null : rui,
        messaggio: messaggio || null,
        fonte: rif ? 'sito:' + rif : 'sito',
        contatto_il: iso(oggi),
        conservare_fino_al: iso(scadenza),
        privacy_versione: informativa.versione,
        privacy_hash: informativa.hash,
        privacy_accettata_il: oggi.toISOString(),
        privacy_ip: ip,
        attivo: false,
      }),
    });

    /* L'avviso viene DOPO: se la posta non parte la candidatura resta comunque
       registrata e si vede in IAM. Il contrario — avvisare di una scheda che
       non e' stata salvata — manderebbe a cercare una riga che non esiste. */
    await avvisaStaff({ nome, cognome, email, telefono, citta, provincia, sezione, rui, messaggio, rif });

    return { stato: 200, dato: { ok: true } };
  } catch (e) {
    console.warn('candidature:', e.message || e);
    return { stato: 500, dato: { error: 'Non sono riuscito a registrare la candidatura.' } };
  }
}

async function avvisaStaff(d) {
  try {
    const key = process.env.BREVO_API_KEY;
    if (!key) return;
    const riga = (et, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7488">${esc(et)}</td><td style="padding:4px 0;font-weight:700">${esc(v)}</td></tr>` : '';
    const sezione = d.sezione === 'E' ? 'Sezione E · ' + d.rui
                  : d.sezione === 'altra' ? 'Altra sezione · ' + d.rui
                  : 'Non ancora iscritto';
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden">
  <div style="background:#02984e;padding:18px 22px"><img src="https://quoto.withusassicurazioni.it/withus-logo-white.png" alt="With Us" style="height:34px"></div>
  <div style="padding:22px;color:#2b3346;font-size:15px;line-height:1.6">
    <h2 style="margin:0 0 14px;font-size:18px;color:#1d2740">Nuova candidatura</h2>
    ${d.nota ? `<div style="background:#fdf6e3;border-left:3px solid #b8860b;padding:10px 13px;margin:0 0 14px;font-size:13.5px">${esc(d.nota)}</div>` : ''}
    <table style="font-size:14px;border-collapse:collapse">
      ${riga('Nome', d.nome + ' ' + d.cognome)}
      ${riga('Email', d.email)}
      ${riga('Telefono', d.telefono)}
      ${riga('Comune', d.citta + (d.provincia ? ' (' + d.provincia + ')' : ''))}
      ${riga('RUI', sezione)}
      ${riga('Link di', d.rif)}
    </table>
    ${d.messaggio ? `<div style="background:#f4f6f8;border-left:3px solid #dde3e9;padding:12px 14px;margin-top:16px;font-size:13.5px;font-style:italic">«${esc(d.messaggio)}»</div>` : ''}
    <p style="margin-top:20px"><a href="https://iam.withusassicurazioni.it" style="background:#02984e;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">Aprila in IAM</a></p>
  </div>
</div>`;
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: NOTIFY_FROM, name: MITTENTE_NOME },
        to: [{ email: STAFF_INBOX }],
        subject: 'Nuova candidatura · ' + d.nome + ' ' + d.cognome,
        htmlContent: html,
      }),
    });
  } catch (e) {
    console.warn('candidature/avviso:', e.message || e);
  }
}
