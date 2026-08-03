// ═══════════════════════════════════════════════════════════════════════════════
//  DIAGNOSI FONTI — perché AXA / Groupama / HDI chiedono il login di continuo?
//
//  Causa numero uno: la FONTI_SECRET del backend (che CIFRA le credenziali quando le
//  salvi nel Pannello Fonti) e quella degli scraper (che le DECIFRA per fare login da
//  soli) non combaciano. Se non combaciano, l'auto-relogin non parte e tocca a te.
//
//  Questo script NON rivela nessun segreto: stampa solo un'IMPRONTA della chiave
//  (hash) e dice se ogni credenziale salvata è decifrabile. Confronta l'impronta del
//  backend con quella di ogni scraper: se sono diverse, hai trovato il problema.
//
//  USO sul VPS (una riga per servizio, per leggere la SUA FONTI_SECRET reale):
//     sudo systemctl show withus-backend  -p Environment | tr ' ' '\n' | grep FONTI_SECRET
//     # …oppure lancialo dentro l'ambiente del servizio:
//     sudo -u root env $(sudo systemctl show axa-scraper -p Environment --value) \
//          node /opt/withus-backend/scraper/diagnosi-fonti.mjs
//
//  Più semplice: passa la chiave a mano (senza stamparla) e confronta le impronte:
//     FONTI_SECRET="$(...la chiave del backend...)"  node diagnosi-fonti.mjs
//     FONTI_SECRET="$(...la chiave axa...)"           node diagnosi-fonti.mjs
//  Le due impronte DEVONO essere identiche.
// ═══════════════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const STORE = process.env.FONTI_STORE || path.join(__dir, '../server/fonti.store.json');

// Stessa identica logica di fonti.js / axa / groupama / hdi.
const SECRET = process.env.FONTI_SECRET || ('withus-fonti-' + (process.env.HOSTNAME || 'vps') + '-v1');
const KEY = crypto.createHash('sha256').update(SECRET).digest();
// Impronta pubblica della chiave: hash della KEY derivata (NON la chiave, NON il segreto).
// Serve solo per il confronto backend↔scraper. Non permette di risalire al segreto.
const FINGERPRINT = crypto.createHash('sha256').update(KEY).digest('hex').slice(0, 12);
const usaFallback = !process.env.FONTI_SECRET;

function dec(blob) {
  if (!blob || !String(blob).startsWith('v1:')) return null;
  try {
    const raw = Buffer.from(String(blob).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

console.log('═══ DIAGNOSI FONTI ═══');
console.log('Store credenziali :', STORE);
console.log('FONTI_SECRET       :', usaFallback ? '⚠️  NON impostata → uso la chiave di ripiego (withus-fonti-<HOSTNAME>-v1)' : 'impostata (da env)');
console.log('Impronta chiave    :', FINGERPRINT, '  ← DEVE essere identica tra backend e scraper');
console.log('');

let store;
try { store = JSON.parse(fs.readFileSync(STORE, 'utf8')); }
catch (e) { console.log('❌ Impossibile leggere lo store:', e.message); process.exit(2); }

// Fonti "fisse" (chiavi dirette) + fonti "custom" (store.__custom)
const righe = [];
for (const [id, s] of Object.entries(store)) { if (id === '__custom' || !s || typeof s !== 'object') continue; righe.push([id, s]); }
for (const [id, s] of Object.entries(store.__custom || {})) righe.push([id, s]);

if (!righe.length) { console.log('Nessuna fonte salvata nello store.'); process.exit(0); }

let problemi = 0;
for (const [id, s] of righe) {
  const nome = s.nome || id;
  const hasUser = !!s.username, hasPass = !!s.password;
  if (!hasUser && !hasPass) { console.log(`• ${nome} (${id}): nessuna credenziale salvata — login manuale atteso.`); continue; }
  const u = dec(s.username), p = dec(s.password);
  const okU = hasUser ? (u !== null) : true;
  const okP = hasPass ? (p !== null) : true;
  if (okU && okP) {
    console.log(`✅ ${nome} (${id}): credenziali DECIFRABILI (utente "${(u || '').slice(0, 2)}…", password ${p ? 'ok' : '—'}).`);
  } else {
    problemi++;
    console.log(`❌ ${nome} (${id}): credenziali NON decifrabili con questa FONTI_SECRET → l'auto-relogin fallisce e devi loggarti a mano.`);
  }
}
console.log('');
if (problemi) {
  console.log(`⚠️  ${problemi} fonte/i non decifrabili. Causa quasi certa: FONTI_SECRET diversa tra backend e scraper.`);
  console.log('   FIX: fai in modo che backend e scraper usino la STESSA FONTI_SECRET (stessa impronta qui sopra),');
  console.log('   poi ri-salva le credenziali dal Pannello Fonti e riavvia gli scraper. Vedi docs/SCRAPER-MOTOR.md §4.');
  process.exit(1);
} else {
  console.log('✔  Tutte le credenziali salvate sono decifrabili con questa chiave.');
  console.log('   Se il login cade lo stesso, il problema NON è la FONTI_SECRET: guarda scadenza portale / OTP / keep-alive.');
}
