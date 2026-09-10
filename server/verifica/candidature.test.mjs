// ═══════════════════════════════════════════════════════════════════════════════
//  CANDIDATURE — il modulo pubblico non e' una porta aperta
//
//  Questa rotta e' l'unica del backend che accetta scritture da chiunque, senza
//  nessun accesso. Le cose che devono restare vere sono quattro, e nessuna si
//  vede guardando la schermata:
//
//    1. La presa d'atto dell'informativa si ricontrolla QUI. La casella nel
//       browser non prova niente: chiunque puo' mandare una POST saltandola, e
//       si ritroverebbe in archivio una scheda senza che a quella persona sia
//       stato mostrato un bel niente.
//
//    2. L'impronta del testo la mette il SERVER, rileggendo privacy_versioni.
//       Se ci fidassimo della versione — o peggio dell'hash — che arriva dal
//       modulo, basterebbe una POST costruita a mano per far risultare in
//       archivio «ha letto la versione X» su un testo mai visto.
//
//    3. Chi c'e' gia' non genera una seconda scheda. Vale per un candidato che
//       ricompila e vale per uno in black list: la prima scheda porta la
//       storia, le note e — se c'e' — il motivo per cui era stata chiusa.
//
//    4. La risposta e' sempre la stessa. Dire «sei gia' in elenco» o «sei in
//       black list» racconterebbe a chiunque, provando un'email alla volta,
//       chi conosciamo e cosa ne pensiamo.
//
//  Le rotte girano davvero, con una fetch finta al posto di Supabase e di
//  Brevo: cosi' si prova il comportamento, non la forma del codice.
// ═══════════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const esiti = [];
const prova = async (nome, fn) => {
  try { await fn(); esiti.push([true, nome, '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, m) => { if (!c) throw new Error(m); };

const INFORMATIVA = { versione: '2026-09', hash: 'abc123hashvero', testo: 'Testo dell\'informativa.' };

/* Supabase e Brevo finti. Ogni chiamata resta registrata, cosi' si puo'
   chiedere non solo «cosa ha risposto» ma «cosa ha scritto, e dove». */
function banco({ esistente = null } = {}) {
  const scritte = [];
  globalThis.fetch = async (url, opz = {}) => {
    const u = String(url);
    const corpo = opz.body ? JSON.parse(opz.body) : null;
    scritte.push({ url: u, metodo: opz.method || 'GET', corpo });

    if (u.includes('api.brevo.com')) return { ok: true, json: async () => ({}) };
    if (u.includes('/rest/v1/privacy_versioni')) return { ok: true, json: async () => [INFORMATIVA] };
    if (u.includes('/rest/v1/quote_collaboratori?email=')) {
      return { ok: true, json: async () => (esistente ? [esistente] : []) };
    }
    if (u.includes('/rest/v1/quote_collaboratori_note')) return { ok: true, json: async () => ({}) };
    if (u.includes('/rest/v1/quote_collaboratori')) return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({}) };
  };
  return {
    scritte,
    candidatureScritte: () => scritte.filter(s => s.metodo === 'POST'
      && /\/rest\/v1\/quote_collaboratori(\?|$)/.test(s.url.split('?')[0] + (s.url.includes('?') ? '?' : ''))
      && s.corpo && s.corpo.stato === 'candidato'),
    noteScritte: () => scritte.filter(s => s.url.includes('quote_collaboratori_note')),
    emailMandate: () => scritte.filter(s => s.url.includes('api.brevo.com')),
  };
}

/* La logica si chiama direttamente: prende una richiesta e torna
   { stato, dato }. Nessun server da tirare su, nessun express da installare —
   ed e' il motivo per cui candidature.js non lo importa.

   OGNI CASO HA IL SUO INDIRIZZO. Il freno conta per IP e vale per l'intero
   processo: con un indirizzo solo, dalla settima prova in poi tutto tornava
   429 e le prove si rompevano a vicenda invece di provare quello che dicono.
   Il freno si prova a parte, apposta, in fondo. */
let contatoreIp = 0;
async function invia(corpo, ip) {
  const mio = ip || ('198.51.100.' + (++contatoreIp % 250));
  return creaCandidatura({ body: corpo, headers: { 'x-forwarded-for': mio + ', 10.0.0.1' }, ip: '10.0.0.1' });
}

const base = {
  nome: 'Mario', cognome: 'Rossi', email: 'Mario.Rossi@Email.IT', telefono: '333 1234567',
  comune: 'Paceco', provincia: 'tp', rui_stato: 'E', rui: 'e000123456',
  messaggio: 'Otto anni nei rami danni.', privacy: true, privacy_versione: '2026-09',
};

const originale = globalThis.fetch;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chiave-finta-per-la-prova';
process.env.BREVO_API_KEY = 'brevo-finta';

const { creaCandidatura, leggiInformativa } = await import('../candidature.js');

/* ── 1. la presa d'atto ─────────────────────────────────────────────────── */

await prova('senza la presa d\'atto la candidatura non nasce, e lo dice', async () => {
  const b = banco();
  const r = await invia({ ...base, privacy: false });
  deve(r.stato === 400, 'ha accettato una candidatura senza presa d\'atto: stato ' + r.stato);
  deve(r.dato.error === 'privacy_mancante', 'non dice perche\' ha rifiutato: ' + JSON.stringify(r.dato));
  deve(b.candidatureScritte().length === 0, 'ha scritto lo stesso una scheda');
});

await prova('e nemmeno se il campo manca del tutto', async () => {
  const b = banco();
  const senza = { ...base }; delete senza.privacy;
  const r = await invia(senza);
  deve(r.stato === 400, 'un campo assente e\' passato per una presa d\'atto');
  deve(b.candidatureScritte().length === 0, 'ha scritto lo stesso una scheda');
});

/* ── 2. l'impronta la mette il server ───────────────────────────────────── */

await prova('versione e impronta arrivano dall\'archivio, non dal modulo', async () => {
  const b = banco();
  /* Una POST costruita a mano che dichiara un'altra versione e prova a
     infilare un'impronta sua. */
  const r = await invia({
    ...base, privacy_versione: '1999-01', privacy_hash: 'impronta-inventata',
  });
  deve(r.stato === 200, 'ha rifiutato una candidatura buona: ' + JSON.stringify(r.dato));
  const scritta = b.candidatureScritte()[0];
  deve(scritta, 'non ha scritto nessuna scheda');
  deve(scritta.corpo.privacy_versione === INFORMATIVA.versione,
    'ha creduto alla versione dichiarata dal modulo: ' + scritta.corpo.privacy_versione);
  deve(scritta.corpo.privacy_hash === INFORMATIVA.hash,
    'ha creduto all\'impronta dichiarata dal modulo: ' + scritta.corpo.privacy_hash);
});

await prova('l\'indirizzo registrato e\' il primo della catena, non il proxy', async () => {
  const b = banco();
  await invia({ ...base, email: 'ip@prova.it' }, '203.0.113.9');
  const scritta = b.candidatureScritte()[0];
  deve(scritta.corpo.privacy_ip === '203.0.113.9',
    'ha registrato l\'indirizzo sbagliato: ' + scritta.corpo.privacy_ip);
});

/* ── 3. quello che finisce in archivio ──────────────────────────────────── */

await prova('la scheda nasce candidata, senza accesso e con la scadenza calcolata', async () => {
  const b = banco();
  await invia({ ...base, email: 'nuovo@prova.it' });
  const c = b.candidatureScritte()[0].corpo;
  deve(c.stato === 'candidato', 'lo stato non e\' «candidato»: ' + c.stato);
  deve(c.attivo === false, 'nasce gia\' attiva');
  deve(!('iam_id' in c) || !c.iam_id, 'e\' stata agganciata a un utente IAM');
  const contatto = new Date(c.contatto_il), fine = new Date(c.conservare_fino_al);
  const mesi = (fine.getFullYear() - contatto.getFullYear()) * 12 + (fine.getMonth() - contatto.getMonth());
  deve(mesi === 24, 'la conservazione non e\' di 24 mesi ma di ' + mesi);
});

await prova('email e sigla si normalizzano, il numero RUI si scrive maiuscolo', async () => {
  const b = banco();
  await invia({ ...base, email: 'MAIUSCOLO@Prova.IT' });
  const c = b.candidatureScritte()[0].corpo;
  deve(c.email === 'maiuscolo@prova.it', 'email non normalizzata: ' + c.email);
  deve(c.provincia === 'TP', 'sigla provincia non normalizzata: ' + c.provincia);
  deve(c.rui_numero === 'E000123456', 'numero RUI non normalizzato: ' + c.rui_numero);
});

await prova('chi non e\' iscritto non si porta dietro un numero RUI vuoto', async () => {
  const b = banco();
  await invia({ ...base, email: 'senza@prova.it', rui_stato: 'no', rui: '' });
  const c = b.candidatureScritte()[0].corpo;
  deve(c.rui_sezione === null, 'ha salvato una sezione per chi non e\' iscritto: ' + c.rui_sezione);
  deve(c.rui_numero === null, 'ha salvato un numero per chi non e\' iscritto: ' + c.rui_numero);
});

await prova('chi dice di essere iscritto senza dare il numero viene fermato', async () => {
  const b = banco();
  const r = await invia({ ...base, email: 'vuoto@prova.it', rui: '' });
  deve(r.stato === 400, 'ha accettato «sezione E» senza numero');
  deve(b.candidatureScritte().length === 0, 'ha scritto lo stesso');
});

await prova('il link di chi l\'ha generato resta attaccato alla scheda', async () => {
  const b = banco();
  await invia({ ...base, email: 'rif@prova.it', rif: 'r-militello' });
  deve(b.candidatureScritte()[0].corpo.fonte === 'sito:r-militello',
    'la fonte non dice chi ha portato chi: ' + b.candidatureScritte()[0].corpo.fonte);
});

await prova('e un rif inventato non ci porta dentro caratteri strani', async () => {
  const b = banco();
  await invia({ ...base, email: 'sporco@prova.it', rif: 'a<b>"c\'d;--' });
  const fonte = b.candidatureScritte()[0].corpo.fonte;
  deve(/^sito:[A-Za-z0-9._-]*$/.test(fonte), 'la fonte porta caratteri non ripuliti: ' + fonte);
});

/* ── 4. chi c'e' gia' ───────────────────────────────────────────────────── */

await prova('chi ha gia\' una scheda non ne genera una seconda', async () => {
  const b = banco({ esistente: { id: 'c1', stato: 'candidato', nome: 'Mario', cognome: 'Rossi' } });
  const r = await invia(base);
  deve(r.stato === 200, 'ha risposto con un errore: ' + JSON.stringify(r.dato));
  deve(b.candidatureScritte().length === 0, 'ha creato una seconda scheda per la stessa email');
  deve(b.noteScritte().length === 1, 'non ha lasciato una nota sulla scheda che c\'era gia\'');
});

await prova('vale anche per chi e\' in black list, e la risposta non cambia', async () => {
  const nera = banco({ esistente: { id: 'c9', stato: 'blacklist', nome: 'Pietro', cognome: 'C.' } });
  const rNera = await invia({ ...base, email: 'nera@prova.it' });
  deve(rNera.stato === 200, 'a chi e\' in black list risponde diversamente: ' + rNera.stato);
  deve(nera.candidatureScritte().length === 0, 'ha creato una scheda nuova per uno in black list');

  const pulito = banco();
  const rPulito = await invia({ ...base, email: 'pulita@prova.it' });
  deve(rPulito.stato === rNera.stato,
    'lo stato della risposta racconta chi e\' in black list: ' + rNera.stato + ' contro ' + rPulito.stato);
});

await prova('ma allo staff la differenza si dice', async () => {
  const b = banco({ esistente: { id: 'c9', stato: 'blacklist', nome: 'Pietro', cognome: 'C.' } });
  await invia({ ...base, email: 'nera2@prova.it' });
  const mail = b.emailMandate()[0];
  deve(mail, 'non ha avvisato nessuno');
  deve(/black ?list/i.test(JSON.stringify(mail.corpo)) || /già in elenco/i.test(JSON.stringify(mail.corpo)),
    'l\'avviso allo staff non dice che quella persona era gia\' in elenco');
});

/* ── 5. il freno ────────────────────────────────────────────────────────── */

await prova('lo stesso indirizzo non puo\' compilare il modulo all\'infinito', async () => {
  const b = banco();
  const ip = '192.0.2.77';
  let bloccate = 0, passate = 0;
  for (let i = 0; i < 9; i++) {
    const r = await invia({ ...base, email: 'raffica' + i + '@prova.it' }, ip);
    if (r.stato === 429) bloccate++; else passate++;
  }
  deve(passate > 0, 'ha bloccato anche il primo invio: il freno e\' diventato una serratura');
  deve(bloccate > 0, 'nove invii di fila dallo stesso indirizzo sono passati tutti');
  deve(b.candidatureScritte().length === passate,
    'ha scritto piu\' schede di quante ne ha accettate: ' + b.candidatureScritte().length + ' contro ' + passate);
});

await prova('ma il vicino di scrivania non ne paga le conseguenze', async () => {
  banco();
  const r = await invia({ ...base, email: 'altro@prova.it' }, '192.0.2.78');
  deve(r.stato === 200, 'un altro indirizzo e\' stato bloccato per colpa del primo: ' + r.stato);
});

/* ── 6. l'informativa ───────────────────────────────────────────────────── */

await prova('la rotta dell\'informativa serve la versione piu\' recente', async () => {
  const b = banco();
  const r = await leggiInformativa();
  deve(r.stato === 200, 'non risponde: ' + r.stato);
  deve(r.dato.versione === INFORMATIVA.versione, 'non serve la versione corrente');
  deve(r.dato.testo, 'non serve il testo: la pagina non avrebbe niente da mostrare');
  const letta = b.scritte.find(s => s.url.includes('privacy_versioni'));
  deve(/order=pubblicata_il\.desc/.test(letta.url), 'non chiede la piu\' recente');
  deve(/documento=eq\.informativa_candidature/.test(letta.url), 'non filtra per documento');
});

globalThis.fetch = originale;

/* ── esecuzione ─────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Candidature: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
