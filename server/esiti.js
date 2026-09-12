// ═══════════════════════════════════════════════════════════════════════════════
//  IL REGISTRO DEGLI ESITI DI QUOTAZIONE — una riga per compagnia, per tentativo
//
//  Fino a oggi il risultato di ogni quotazione arrivava al browser, restava in
//  un log in memoria (__RCA_LOG) e poi spariva. Quando un premio «non tornava»
//  con quello del portale, o una compagnia falliva, la sola strada era rifare il
//  preventivo a mano e guardare. Da qui in avanti ogni tentativo — riuscito o
//  no, scraper o tariffa — lascia una riga in `quote_quotazioni_esiti`, con i
//  parametri per riprodurlo e tutto quello che lo scraper ha detto di sé.
//
//  È anche lo strumento di collaudo: le correzioni agli scraper si provano
//  facendo preventivi veri, e la sera si leggono le righe del giorno.
//
//  DUE REGOLE, non negoziabili:
//   · niente dati del cliente: mai nome, cognome, codice fiscale, data di
//     nascita, indirizzo, email, telefono. La targa sì: è un dato dell'agenzia
//     nel suo archivio, e senza non si riproduce niente. Quello che arriva
//     dagli scraper passa da `diagnosticaPulita`, che toglie le chiavi
//     personali e le fotografie di pagina, a qualunque profondità.
//   · non deve MAI far fallire una quotazione. Ogni funzione qui dentro cattura
//     i propri errori, ha un tempo massimo, e in caso di guasto restituisce
//     null e scrive nel giornale. Un registro che rompe quello che registra è
//     peggio di nessun registro.
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const TABELLA = 'quote_quotazioni_esiti';
const TEMPO_MAX_MS = 6000;          // oltre, si rinuncia a scrivere: la quotazione non aspetta il registro
/* Quanto può pesare la diagnostica di una riga. Era 120 KB, ed era troppo: la
   prima quotazione HDI vera ne ha scritti 77 KB, quasi tutti cattura di rete
   del portale. Un registro da rileggere la sera non è un archivio di traffico.
   (revisione serale 11/09/2026) */
const LIMITE_DIAGNOSTICA = 32 * 1024;
const LIMITE_TESTO = 2000;          // una singola stringa: oltre, si tronca
const MAX_ELEMENTI = 60;            // una singola lista: oltre, si tiene il conto

export const ESITI = ['ok', 'errore', 'timeout', 'non_quotabile'];

/* Chiavi che NON entrano nel registro, a nessuna profondità. Tre famiglie:
   · i dati della persona (contraente, proprietario);
   · le fotografie di pagina degli scraper (dump, log, testo grezzo);
   · le CATTURE DI RETE del portale (api, sniff, har…) e i pezzi di una
     chiamata HTTP (body, headers, cookie, token).
   La terza famiglia è entrata l'11/09/2026, la sera del primo preventivo
   vero: la risposta HDI via browser porta con sé `api`, 106 chiamate del
   portale con i corpi serializzati, e in quattro di quei corpi c'era il
   codice fiscale del cliente, più nome, data di nascita e indirizzo. Nel
   registro non erano mai dovuti entrare.
   `targa` e `bersani` NON sono qui: la targa ha la sua colonna, e la targa
   Bersani serve a riprodurre il preventivo. */
const CHIAVI_VIETATE = /^(nome|cognome|nominativo|nome_completo|ragione_sociale|partita_iva|piva|cf|codice_fiscale|codicefiscale|nascita|data_nascita|datanascita|dob|sesso|email|indirizzo_email|telefono|cellulare|indirizzo|indirizzo_solo|indirizzo_completo|via|civico|civ|numero_civico|comune|citta|residenza|dataset_indirizzo|anagrafica|contraente|proprietario|intestatario|assicurato|dump|_dump|prevdump|log|raw|_text|html|screenshot|shot|api|apis|catture|cattura|sniff|har|network|traffico|richieste|body|payload|headers|cookie|cookies|token|authorization|password|pwd|totp|otp|segreto)$/i;

/* La rete di sicurezza, per quello che le chiavi non prendono. Un corpo di
   chiamata arriva spesso come STRINGA con dentro il JSON del portale: lì le
   chiavi non sono chiavi, sono testo, e la pulizia per nome non le vede. Qui
   si guarda il testo. */
const CF_NEL_TESTO = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g;
const EMAIL_NEL_TESTO = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
/* «"cognome":"ROSSI"» dentro una stringa: la chiave è vietata, quindi il
   valore si oscura lasciando la struttura leggibile a chi cerca un guasto. */
const COPPIA_VIETATA = /("(?:nome|cognome|nominativo|ragione_?sociale|codice_?fiscale|cf|data_?(?:di_?)?nascita|dataNascita|email|telefono|cellulare|indirizzo|toponimo|civico|comune|citta)"\s*:\s*)"[^"]*"/gi;

export function pulisciTesto(s) {
  let t = String(s);
  /* Se la stringa è JSON, la si apre e la si ripulisce come un oggetto: così
     restano struttura e campi tecnici, e sparisce la persona. Se non si apre,
     si passa comunque dalle maschere qui sotto. */
  if (/^\s*[[{]/.test(t) && t.length <= LIMITE_DIAGNOSTICA) {
    try {
      const dentro = pulisci(JSON.parse(t), 1);
      t = JSON.stringify(dentro);
    } catch (_) { /* non era JSON: restano le maschere */ }
  }
  t = t.replace(COPPIA_VIETATA, '$1"[rimosso]"')
       .replace(CF_NEL_TESTO, '[cf]')
       .replace(EMAIL_NEL_TESTO, '[email]');
  return t.length > LIMITE_TESTO ? t.slice(0, LIMITE_TESTO) + '…[troncato]' : t;
}

function eOggetto(v) { return v !== null && typeof v === 'object'; }

/* Copia un valore togliendo le chiavi vietate, a qualunque profondità, e
   ripulendo anche il TESTO. Non modifica l'originale: quello continua a
   servire alla risposta verso il browser. */
export function pulisci(v, profondita = 0) {
  if (profondita > 12) return undefined;
  if (typeof v === 'string') return pulisciTesto(v);
  if (Array.isArray(v)) {
    const out = v.slice(0, MAX_ELEMENTI).map(x => pulisci(x, profondita + 1)).filter(x => x !== undefined);
    /* Una lista lunghissima è quasi sempre una cattura: si tiene il conto, non
       il contenuto. */
    if (v.length > MAX_ELEMENTI) out.push({ _troncato: v.length - MAX_ELEMENTI + ' elementi in più non registrati' });
    return out;
  }
  if (!eOggetto(v)) return v;
  const out = {};
  for (const k of Object.keys(v)) {
    if (CHIAVI_VIETATE.test(k)) continue;
    const p = pulisci(v[k], profondita + 1);
    if (p !== undefined) out[k] = p;
  }
  return out;
}

/* I parametri della richiesta, senza targa (ha la sua colonna) e senza dati
   personali. Serve a riprodurre il preventivo: guida, massimale,
   frazionamento, garanzie, situazione, Bersani… */
export function richiestaPulita(params) {
  if (!eOggetto(params)) return {};
  const r = pulisci(params);
  delete r.targa;
  return r;
}

/* Tutto quello che lo scraper ha risposto, meno il premio (ha la sua colonna),
   meno i dati personali e le fotografie. Se è troppo grande, si tiene solo
   l'elenco delle chiavi: un registro da leggere la sera non è un archivio di
   pagine HTML. */
export function diagnosticaPulita(d, extra) {
  if (!eOggetto(d) && !eOggetto(extra)) return null;
  const p = eOggetto(d) ? pulisci(d) : {};
  for (const k of ['premio_annuale_num', 'premio_totale_num', 'ok', 'esito_id']) delete p[k];
  /* Quello che sa la ROTTA e non sa lo scraper: per esempio, che il premio è
     arrivato dal browser perché la via diretta era caduta, e con quale motivo.
     Passa dalla stessa pulizia del resto. */
  if (eOggetto(extra)) Object.assign(p, pulisci(extra));
  const testo = JSON.stringify(p);
  if (testo && testo.length > LIMITE_DIAGNOSTICA) {
    return { troncata: true, byte: testo.length, chiavi: Object.keys(p) };
  }
  return p;
}

/* Il numero del premio, da qualunque forma lo dia lo scraper: numero, stringa
   italiana «1.234,56», oggetto {annuale:{totale}}. null se non c'è. */
export function numeroPremio(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (eOggetto(v)) return numeroPremio(v.premio_annuale_num ?? v.premio_totale_num ?? v.totale ?? v.premio_annuale ?? v.premio_totale ?? v.premio ?? (v.annuale && v.annuale.totale));
  const s = String(v).replace(/€/g, '').trim();
  const it = /^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s);
  const n = parseFloat(it ? s.replace(/\./g, '').replace(',', '.') : s);
  return isNaN(n) ? null : n;
}

/* Classifica il fallimento leggendo il messaggio: «timeout» quando il portale
   non ha risposto, «non_quotabile» quando ha risposto di no (targa non
   quotabile, veicolo già assicurato, dati insufficienti), «errore» per il
   resto. Una lista di `bloccanti` non vuota è sempre «non_quotabile». */
export function classificaErrore(messaggio, dettagli) {
  if (dettagli && Array.isArray(dettagli.bloccanti) && dettagli.bloccanti.length) return 'non_quotabile';
  const m = String(messaggio || '');
  /* «scaduto» al maschile e' il tempo (lock scaduto, tempo scaduto); «sessione
     scaduta» e' un'altra cosa: un login da rifare, cioe' un errore. */
  if (/timeout|abort|scaduto\b|tempo massimo|non ha risposto|troppo lungo|oltre \d+ ?s|\bTIMEOUT\b/i.test(m)) return 'timeout';
  if (/non quotabil|già assicurat|gia' assicurat|non emettibil|non calcolat|INVALID_INPUT|insufficient|inesistente|combinazione non|non present|non disponibile per|non ammess|non quota:/i.test(m)) return 'non_quotabile';
  return 'errore';
}

function sbHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(extra || {}) };
}

async function conTempo(fn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TEMPO_MAX_MS);
  try { return await fn(ctrl.signal); } finally { clearTimeout(t); }
}

/* Chi ha chiesto il preventivo: il nome lo si legge da quote_utenti una volta
   e lo si tiene in memoria per un po'. Se non si trova, resta l'email del
   token: è quella dell'operatore, non del cliente. */
const nomi = new Map();
const TTL_NOMI = 10 * 60 * 1000;
export async function nomeOperatore(user) {
  if (!user || !user.id) return null;
  const c = nomi.get(user.id);
  if (c && Date.now() - c.t < TTL_NOMI) return c.nome;
  let nome = user.email || null;
  try {
    const rows = await conTempo(signal => fetch(`${SUPABASE_URL}/rest/v1/quote_utenti?id=eq.${encodeURIComponent(user.id)}&select=nome&limit=1`, { headers: sbHeaders(), signal }).then(r => r.ok ? r.json() : []));
    if (rows[0] && rows[0].nome) nome = rows[0].nome;
  } catch (_) {}
  nomi.set(user.id, { nome, t: Date.now() });
  return nome;
}

/* Il registro scrive su Supabase; nelle prove si sostituisce con una funzione
   che raccoglie le righe, così nessuna prova ha bisogno della rete. */
let scrivi = async (riga) => {
  const r = await conTempo(signal => fetch(`${SUPABASE_URL}/rest/v1/${TABELLA}`, {
    method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify([riga]), signal,
  }));
  if (!r.ok) throw new Error('Supabase insert: ' + (await r.text()).slice(0, 200));
  const rows = await r.json();
  return rows[0] && rows[0].id != null ? rows[0].id : null;
};
let aggiorna = async (id, body) => {
  const r = await conTempo(signal => fetch(`${SUPABASE_URL}/rest/v1/${TABELLA}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(body), signal,
  }));
  if (!r.ok) throw new Error('Supabase patch: ' + (await r.text()).slice(0, 200));
  return (await r.json())[0] || null;
};
export function _perLeProve(finto) {
  if (finto && finto.scrivi) scrivi = finto.scrivi;
  if (finto && finto.aggiorna) aggiorna = finto.aggiorna;
}

/* Costruisce la riga a partire da quello che la rotta sa. È separata dalla
   scrittura per poterla provare senza rete. */
export function preparaRiga(e) {
  const d = e.risposta;
  let esito = e.esito;
  const premio = e.premio != null ? numeroPremio(e.premio) : numeroPremio(d);
  if (!esito) esito = (premio != null && premio > 0 && !e.errore) ? 'ok' : classificaErrore(e.errore, d);
  if (!ESITI.includes(esito)) esito = 'errore';
  const fonte = e.fonte || (d && (d.fonte_premio || d.via)) || null;
  return {
    utente_id: (e.utente && e.utente.id) || null,
    utente_nome: e.utente_nome || null,
    modulo: e.modulo || null,
    prodotto: e.prodotto || (d && d.prodotto) || null,
    compagnia: e.compagnia || (d && d.compagnia) || null,
    linea: e.linea || null,
    targa: e.targa ? String(e.targa).toUpperCase().trim() : null,
    richiesta: richiestaPulita(e.richiesta),
    esito,
    premio: esito === 'ok' ? premio : (premio != null && premio > 0 ? premio : null),
    fonte: fonte ? String(fonte).replace(/^mii\/.*$/, 'mii') : null,
    durata_ms: e.durata_ms != null ? Math.max(0, Math.round(e.durata_ms)) : null,
    errore: e.errore ? String(e.errore).slice(0, 1000) : null,
    diagnostica: diagnosticaPulita(d, e.diagnostica_extra),
  };
}

/* La funzione che le rotte chiamano. Non lancia mai; restituisce l'id della
   riga (da rimandare al browser come `esito_id`) oppure null. Chi non vuole
   aspettare non fa `await`: la scrittura va avanti da sola. */
export async function registraEsito(e) {
  try {
    const riga = preparaRiga(e || {});
    if (!riga.utente_nome && e && e.utente) riga.utente_nome = await nomeOperatore(e.utente);
    const id = await scrivi(riga);
    return id;
  } catch (err) {
    try { console.log('[esiti] riga non scritta: ' + String(err && err.message || err).slice(0, 200)); } catch (_) {}
    return null;
  }
}

/* Misura la durata attorno a una chiamata e registra l'esito, qualunque cosa
   succeda. `fn` restituisce la risposta dello scraper; se lancia, l'errore
   viene registrato e poi rilanciato: la rotta decide cosa dirne al browser.
   `dati(risposta)` permette alla rotta di aggiungere compagnia/prodotto/errore
   letti dalla risposta. Restituisce { risposta, esito_id }. */
export async function conEsito(base, fn, dati) {
  const t0 = Date.now();
  let risposta, errore;
  try { risposta = await fn(); }
  catch (e) { errore = e; }
  const extra = (() => { try { return dati ? (dati(risposta, errore) || {}) : {}; } catch (_) { return {}; } })();
  const esito_id = await registraEsito(Object.assign({}, base, {
    risposta, durata_ms: Date.now() - t0,
    errore: errore ? String(errore && errore.message || errore) : (extra.errore || (risposta && !risposta.ok ? (risposta.error || 'risposta senza premio') : null)),
  }, extra));
  if (errore) throw errore;
  return { risposta, esito_id };
}

/* ── LA SEGNALAZIONE DELL'OPERATORE ──────────────────────────────────────────
   «Il premio non torna? Segnala»: l'operatore scrive il premio letto sul
   portale e una nota. Si aggiornano solo questi campi, mai gli altri: la riga
   dello scraper resta quella che era, e la revisione serale confronta i due
   numeri. Il nome di chi segnala viene dal token, non dal corpo. */
export function validaSegnalazione(body) {
  const b = body || {};
  const premio = b.premio_portale == null || b.premio_portale === '' ? null : numeroPremio(b.premio_portale);
  if (b.premio_portale != null && b.premio_portale !== '' && premio == null) return { errore: 'Il premio del portale non è un numero: scrivi ad esempio 412,50.' };
  if (premio != null && (premio < 0 || premio > 100000)) return { errore: 'Il premio del portale non è plausibile.' };
  const nota = b.nota_operatore == null ? null : String(b.nota_operatore).trim().slice(0, 2000) || null;
  if (premio == null && !nota) return { errore: 'Serve almeno il premio letto sul portale o una nota.' };
  return { premio_portale: premio, nota_operatore: nota };
}

export async function segnala(id, body, utenteNome) {
  const v = validaSegnalazione(body);
  if (v.errore) return { ok: false, stato: 400, errore: v.errore };
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, stato: 400, errore: 'Identificativo dell\'esito non valido.' };
  try {
    const riga = await aggiorna(n, {
      premio_portale: v.premio_portale, nota_operatore: v.nota_operatore,
      segnalato_il: new Date().toISOString(), segnalato_da: utenteNome || null,
    });
    if (!riga) return { ok: false, stato: 404, errore: 'Esito non trovato: la quotazione è troppo vecchia o l\'identificativo è sbagliato.' };
    return { ok: true, stato: 200, esito: { id: riga.id, premio_portale: riga.premio_portale, nota_operatore: riga.nota_operatore, segnalato_il: riga.segnalato_il } };
  } catch (e) {
    return { ok: false, stato: 502, errore: 'Segnalazione non salvata: ' + String(e && e.message || e).slice(0, 160) };
  }
}

/* Il router per QUOTO (dietro requireAuth in index.js):
     POST /esiti/:id/segnalazione   { premio_portale, nota_operatore }
   POST e non PATCH: il CORS del backend ammette GET/POST/PUT/DELETE, e
   aggiungere un metodo per una rotta sola avrebbe toccato una riga che
   protegge tutte le altre. */
export const esitiRouter = Router();
esitiRouter.post('/:id/segnalazione', async (req, res) => {
  const nome = await nomeOperatore(req.user);
  const r = await segnala(req.params.id, req.body, nome);
  if (!r.ok) return res.status(r.stato).json({ error: r.errore });
  res.json({ ok: true, esito: r.esito });
});
