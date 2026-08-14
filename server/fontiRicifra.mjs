// ═══════════════════════════════════════════════════════════════════════════════
//  RICIFRATURA DEL PANNELLO FONTI — rimettere tutto sotto una chiave sola
//
//  PERCHE' ESISTE
//    Il 14 agosto 2026 fonti.store.json e' risultato cifrato con DUE chiavi diverse.
//    Alcune credenziali con quella attuale del backend, altre con una piu' vecchia,
//    derivata dal nome della macchina ("withus-fonti-vps-v1"). Chi ha una chiave non
//    apre quello che ha scritto l'altra, e nessuno se ne accorge: il campo risulta
//    semplicemente vuoto. E' cosi' che il segreto TOTP di Allianz e' rimasto
//    invisibile allo scraper (auto-login fermo al 2FA Duo) e Prima ha risposto «non
//    ho credenziali» pur avendole nel pannello.
//
//  COSA FA
//    Cerca OGNI valore cifrato dentro lo store — a qualunque profondita', quindi
//    anche le password delle caselle mail e i proxy, non solo utente/password — e:
//      · se si apre con la chiave attuale, non lo tocca;
//      · se si apre con una delle chiavi vecchie, lo ricifra con quella attuale;
//      · se non si apre con nessuna, lo lascia stare e lo segnala.
//
//  COME SI USA
//    node server/fontiRicifra.mjs            → guarda e basta. NON scrive niente.
//    node server/fontiRicifra.mjs --scrivi   → fa prima una copia di sicurezza
//                                              (<store>.prima-di-ricifrare-<data>)
//                                              e poi scrive.
//
//  COSA NON FA MAI
//    Non stampa un solo valore in chiaro: dice il nome del campo, quale chiave lo
//    apre e quanto e' lungo. Niente di piu'.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const STORE = process.env.FONTI_STORE || path.join(__dir, 'fonti.store.json');
const SCRIVI = process.argv.includes('--scrivi');

// ── Le chiavi ─────────────────────────────────────────────────────────────────
// Quella attuale e' quella del BACKEND, e va presa da dove la prende lui. Attenzione,
// qui c'e' la trappola piu' pericolosa di tutto lo script: chi lo lancia a mano (o dal
// canale comandi, che gira da root) NON ha FONTI_SECRET in ambiente. Senza questa
// lettura lo script prenderebbe per «attuale» proprio la chiave vecchia e ricifrerebbe
// tutto AL CONTRARIO, rendendo illeggibile al backend anche quello che oggi funziona.
// Percio': prima l'ambiente, poi server/.env — lo stesso file che carica il backend —
// e se non si trova ne' l'uno ne' l'altro lo script si rifiuta di scrivere.
function segretoDaEnvFile() {
  try {
    const t = fs.readFileSync(path.join(__dir, '.env'), 'utf8');
    const m = t.match(/^\s*FONTI_SECRET\s*=\s*(.*)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}
const daAmbiente = process.env.FONTI_SECRET || '';
const daFile = daAmbiente ? '' : segretoDaEnvFile();
const ORIGINE = daAmbiente ? 'ambiente' : (daFile ? 'server/.env' : 'RIPIEGO DERIVATO');
const SEGRETO_ORA = daAmbiente || daFile || ('withus-fonti-' + (process.env.HOSTNAME || 'vps') + '-v1');
const SEGRETI_VECCHI = [
  'withus-fonti-vps-v1',
  'withus-fonti-' + (process.env.HOSTNAME || 'vps') + '-v1',
  process.env.FONTI_SECRET_VECCHIA || '',
].filter(Boolean);

const chiaveDa = s => crypto.createHash('sha256').update(s).digest();
const impronta = k => crypto.createHash('sha256').update(k).digest('hex').slice(0, 12);
const CHIAVE_ORA = chiaveDa(SEGRETO_ORA);
// Solo le chiavi vecchie DAVVERO diverse da quella attuale: altrimenti si
// riscriverebbe un campo per rimetterci dentro la stessa identica cosa.
const CHIAVI_VECCHIE = [...new Set(SEGRETI_VECCHI.map(chiaveDa).map(k => k.toString('base64')))]
  .map(b => Buffer.from(b, 'base64'))
  .filter(k => !k.equals(CHIAVE_ORA));

function apri(chiave, blob) {
  if (!chiave || typeof blob !== 'string' || !blob.startsWith('v1:')) return null;
  try {
    const raw = Buffer.from(blob.slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', chiave, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}
function chiudi(chiave, testo) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chiave, iv);
  const ct = Buffer.concat([c.update(String(testo), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

// ── Passeggiata su tutto lo store ─────────────────────────────────────────────
// Generica di proposito: i campi cifrati non sono solo username/password, ci sono
// anche il TOTP, il codice, il proxy e le password delle caselle di posta. Un elenco
// scritto a mano ne avrebbe dimenticato qualcuno — ed e' esattamente il tipo di
// dimenticanza che ha creato il problema che questo script viene a riparare.
const esito = { gia_a_posto: [], ricifrati: [], illeggibili: [] };

function passeggia(nodo, strada) {
  if (!nodo || typeof nodo !== 'object') return;
  for (const [k, v] of Object.entries(nodo)) {
    const dove = strada ? strada + '.' + k : k;
    if (typeof v === 'string' && v.startsWith('v1:')) {
      const conAttuale = apri(CHIAVE_ORA, v);
      if (conAttuale !== null) { esito.gia_a_posto.push(dove); continue; }
      let riaperto = null;
      for (const kv of CHIAVI_VECCHIE) { riaperto = apri(kv, v); if (riaperto !== null) break; }
      if (riaperto === null) { esito.illeggibili.push(dove); continue; }
      nodo[k] = chiudi(CHIAVE_ORA, riaperto);
      esito.ricifrati.push({ dove, caratteri: riaperto.length });
    } else if (v && typeof v === 'object') {
      passeggia(v, dove);
    }
  }
}

// ── Esecuzione ────────────────────────────────────────────────────────────────
let store;
try { store = JSON.parse(fs.readFileSync(STORE, 'utf8')); }
catch (e) { console.error('Non riesco a leggere ' + STORE + ': ' + e.message); process.exit(2); }

console.log('archivio     : ' + STORE);
console.log('chiave ora   : ' + impronta(CHIAVE_ORA) + '  (presa da: ' + ORIGINE + ')');
console.log('chiavi prima : ' + (CHIAVI_VECCHIE.map(impronta).join(', ') || '(nessuna diversa da quella attuale)'));
console.log('modo         : ' + (SCRIVI ? 'SCRITTURA' : 'solo lettura (nessun file toccato)'));
console.log('');

// Il controllo piu' importante, e va fatto QUI: prima di guardare qualunque cosa.
// Se manca la chiave del backend, la chiave «attuale» coincide con quella vecchia, non
// resta nessuna chiave alternativa da provare e lo script direbbe tranquillamente
// «niente da fare: e' gia' tutto sotto la stessa chiave». Sarebbe una frase falsa, ed
// e' peggio di un errore: chi la legge chiude il problema credendolo risolto.
if (ORIGINE === 'RIPIEGO DERIVATO') {
  console.error('MI FERMO: non ho la chiave del backend.');
  console.error('Ne\' FONTI_SECRET in ambiente, ne\' una riga FONTI_SECRET= in ' + path.join(__dir, '.env') + '.');
  console.error('Senza quella non posso dire niente di sensato su questo archivio: con la sola');
  console.error('chiave di ripiego ogni campo scritto dal backend risulterebbe «illeggibile»,');
  console.error('e scrivere significherebbe ricifrare al contrario.');
  console.error('Lancialo dalla cartella del backend, dove server/.env esiste.');
  process.exit(6);
}

passeggia(store, '');

console.log('gia\' a posto (' + esito.gia_a_posto.length + '):');
for (const d of esito.gia_a_posto) console.log('    · ' + d);
console.log('\nda ricifrare (' + esito.ricifrati.length + '):');
for (const r of esito.ricifrati) console.log('    → ' + r.dove + '   (' + r.caratteri + ' caratteri)');
if (esito.illeggibili.length) {
  console.log('\nNON si aprono con nessuna chiave (' + esito.illeggibili.length + ') — vanno reinseriti dal pannello:');
  for (const d of esito.illeggibili) console.log('    ✗ ' + d);
}

if (!esito.ricifrati.length) {
  console.log('\nNiente da fare: e\' gia\' tutto sotto la stessa chiave.');
  process.exit(0);
}
if (!SCRIVI) {
  console.log('\nNessun file e\' stato toccato. Per applicare: node server/fontiRicifra.mjs --scrivi');
  process.exit(0);
}

// Copia di sicurezza PRIMA di scrivere. Se questa non riesce, non si scrive: meglio
// non fare niente che restare senza la via del ritorno.
const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const copia = STORE + '.prima-di-ricifrare-' + marca;
try { fs.copyFileSync(STORE, copia); }
catch (e) { console.error('\nCopia di sicurezza non riuscita (' + e.message + '): non scrivo niente.'); process.exit(3); }
console.log('\ncopia di sicurezza: ' + copia);

try { fs.writeFileSync(STORE, JSON.stringify(store, null, 2), { mode: 0o600 }); }
catch (e) { console.error('Scrittura non riuscita: ' + e.message + '\nL\'originale e\' intatto in ' + copia); process.exit(4); }

// Ricontrollo su quello che c'e' davvero su disco: dire «fatto» senza rileggere
// significa fidarsi, e qui non ci si fida.
const riletto = JSON.parse(fs.readFileSync(STORE, 'utf8'));
let restano = 0;
(function conta(n) {
  if (!n || typeof n !== 'object') return;
  for (const v of Object.values(n)) {
    if (typeof v === 'string' && v.startsWith('v1:')) { if (apri(CHIAVE_ORA, v) === null) restano++; }
    else if (v && typeof v === 'object') conta(v);
  }
})(riletto);

console.log('ricifrati   : ' + esito.ricifrati.length);
console.log('ancora illeggibili con la chiave attuale: ' + restano +
  (restano === esito.illeggibili.length ? ' (sono quelli che non si aprivano con nessuna chiave)' : ' ← ATTENZIONE, non torna'));
process.exit(restano === esito.illeggibili.length ? 0 : 5);
