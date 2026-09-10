// ═══════════════════════════════════════════════════════════════════════════════
//  «I MIEI DOCUMENTI» — chi puo' aprire il mandato di chi
//
//  Fino a oggi un documento firmato si apriva solo col token spedito per
//  email: chi ha il link, entra. Per una firma va bene — quel link e' la
//  busta — ma non per l'area riservata, dove il collaboratore ritrova i suoi
//  documenti mesi dopo, quando l'email non ce l'ha piu'.
//
//  La strada corta sarebbe portare il token dentro IAM. E' anche quella
//  sbagliata: lo stesso token apre la firma, e finirebbe nel DOM di una
//  pagina, negli appunti, in uno screenshot mandato all'ufficio. La rotta
//  nuova autorizza per IDENTITA' — conta chi sei, non che link possiedi — e
//  qui si prova che quella distinzione tiene.
//
//  Le tre cose che devono restare vere:
//
//    1. Il mandato di un altro non si apre. Mai, per nessuna via: nemmeno
//       quando le email combaciano, perche' due indirizzi uguali non provano
//       un'identita'.
//
//    2. La risposta e' sempre la stessa, «non trovato». Distinguere «non
//       esiste» da «non e' tuo» racconterebbe, un id alla volta, chi ha
//       firmato che cosa.
//
//    3. Il token non esce da qui. Ne' dalla rotta, ne' da iam_mie_firme():
//       se un giorno qualcuno lo aggiunge «per comodita'», questa prova cade.
// ═══════════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const esiti = [];
const prova = async (nome, fn) => {
  try { await fn(); esiti.push([true, nome, '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, m) => { if (!c) throw new Error(m); };

const { documentoMio } = await import('../firmeDati.js');

const IO   = 'u-rosalia';
const ALTRO = 'u-davide';
const MIO = { id: 'f1', tipo: 'mandato', utente_id: IO, email: 'r.militello@email.it', token: 'segretissimo' };

/* ── 1. il mandato di un altro ──────────────────────────────────────────── */

await prova('il mio mandato si apre', () => {
  deve(documentoMio(MIO, IO) === null, 'non riesco ad aprire un documento mio');
});

await prova('quello di un altro no', () => {
  deve(documentoMio(MIO, ALTRO), 'ho aperto il mandato di un\'altra persona');
});

await prova('e non basta avere la stessa email', () => {
  /* E' il ripiego che chiFirma() usa per AGGANCIARE una firma, e li' va bene:
     sbagliare l'aggancio lascia una riga in piu' allo staff. Qui no: qui
     decide chi legge il mandato di chi, e due indirizzi uguali non provano
     un'identita'. Se un giorno qualcuno ci mette un ripiego sull'email,
     questa prova cade. */
  const orfana = { id: 'f2', tipo: 'mandato', utente_id: null, email: 'r.militello@email.it' };
  deve(documentoMio(orfana, IO),
    'una firma senza utente_id si apre a chi ha la stessa email: non e\' una prova d\'identita\'');
});

await prova('senza accesso non si apre niente', () => {
  deve(documentoMio(MIO, null), 'un documento si apre anche senza sapere chi chiede');
  deve(documentoMio(MIO, undefined), 'un documento si apre con un utente indefinito');
  deve(documentoMio(MIO, ''), 'un documento si apre con un utente vuoto');
});

await prova('un id che non esiste non fa eccezione', () => {
  deve(documentoMio(null, IO), 'un documento inesistente non viene respinto');
  deve(documentoMio(undefined, IO), 'un documento indefinito non viene respinto');
});

/* ── 2. la risposta e' sempre la stessa ─────────────────────────────────── */

await prova('«non esiste» e «non e\' tuo» si rispondono allo stesso modo', () => {
  const inesistente = documentoMio(null, IO);
  const dellAltro   = documentoMio(MIO, ALTRO);
  const orfano      = documentoMio({ id: 'f3', utente_id: null }, IO);
  deve(inesistente === dellAltro && dellAltro === orfano,
    'le risposte si distinguono, e chi prova un id alla volta scopre chi ha firmato cosa: ' +
    [inesistente, dellAltro, orfano].join(' / '));
});

/* ── 3. il token non esce ───────────────────────────────────────────────── */

await prova('la rotta non chiede un token e non lo restituisce', () => {
  const fs = require('fs');
  const src = fs.readFileSync(new URL('../firmaCollab.js', import.meta.url), 'utf8');
  const da = src.indexOf("firmaCollabRouter.get('/mio/doc'");
  deve(da > 0, 'la rotta dell\'area riservata non esiste piu\'');
  const rotta = src.slice(da, src.indexOf('});', src.indexOf('} catch', da)) + 3);
  deve(/documentoMio\(f, req\.user/.test(rotta),
    'la rotta non controlla che il documento sia di chi lo chiede');
  deve(!/req\.query\.t\b/.test(rotta),
    'la rotta dell\'area riservata guarda ancora il token del link');
  deve(!/\btoken\b/.test(rotta), 'il token compare nella rotta: non deve uscire da qui');
  deve(/404/.test(rotta), 'un documento non proprio non risponde «non trovato»');
});

await prova('e sta dietro all\'accesso, non davanti', () => {
  /* publicFirmaCollab e' montato SENZA requireAuth: se la rotta finisse li',
     chiunque potrebbe aprire qualunque documento passando un id. */
  const fs = require('fs');
  const src = fs.readFileSync(new URL('../firmaCollab.js', import.meta.url), 'utf8');
  deve(!/publicFirmaCollab\.get\('\/mio/.test(src),
    'la rotta dell\'area riservata e\' finita sul router pubblico');
  const idx = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  deve(/app\.use\('\/firma-collab', requireAuth, firmaCollabRouter\)/.test(idx),
    'firmaCollabRouter non e\' piu\' dietro requireAuth: la rotta si aprirebbe a chiunque');
});

await prova('nemmeno l\'elenco porta fuori il token', () => {
  /* iam_mie_firme() e' la funzione da cui la pagina legge l'elenco. Gira nel
     database con auth.uid(), quindi non puo' tornare le righe di un altro
     nemmeno sbagliando una condizione — ma le COLONNE le sceglie chi la
     scrive, e `token` non deve esserci. */
  const fs = require('fs');
  const f = new URL('../../supabase/migrations/20260910_firme_area_riservata.sql', import.meta.url);
  const sql = fs.readFileSync(f, 'utf8');
  const da = sql.indexOf('create or replace function public.iam_mie_firme');
  deve(da > 0, 'la funzione dell\'elenco non e\' piu\' nel file di migrazione');
  const corpo = sql.slice(da, sql.indexOf('$$;', da));
  deve(!/\btoken\b/.test(corpo), 'iam_mie_firme() restituisce il token al browser');
  /* E che resti chiusa ad `anon`: `create or replace` rimette i permessi di
     partenza, quindi la revoca dev'essere nello stesso file della funzione. */
  deve(/revoke all on function public\.iam_mie_firme\(\) from public, anon/.test(sql),
    'ricaricando il file la funzione tornerebbe eseguibile da chiunque, anche senza accesso');
});

/* ── esecuzione ─────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' I miei documenti: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
