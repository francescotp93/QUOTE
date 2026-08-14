// ═══════════════════════════════════════════════════════════════════════════════
//  Banco di prova della ricifratura — si tocca un archivio di segreti, quindi
//  ogni singola promessa dello script va verificata prima di lanciarlo sul vero.
//
//  Le promesse sono cinque:
//    1) senza --scrivi non tocca NIENTE (il file resta identico, byte per byte);
//    2) con --scrivi fa prima la copia di sicurezza;
//    3) i valori non cambiano: dopo la ricifratura si rileggono uguali a prima;
//    4) quello che era gia' sotto la chiave giusta non viene riscritto per niente;
//    5) quello che non si apre con nessuna chiave resta dov'e' e viene detto.
//
//  Nota: la prova scrive i suoi archivi in /tmp e non sfiora mai quello vero.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dir, 'fontiRicifra.mjs');
const STORE = '/tmp/fonti.ricifra.test.json';

const SEGRETO_NUOVO = 'chiave-attuale-di-prova';
const SEGRETO_VECCHIO = 'withus-fonti-vps-v1';        // la derivata storica
const chiaveDa = s => crypto.createHash('sha256').update(s).digest();
const K_NUOVA = chiaveDa(SEGRETO_NUOVO), K_VECCHIA = chiaveDa(SEGRETO_VECCHIO);

function chiudi(k, testo) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(String(testo), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function apri(k, blob) {
  try {
    const raw = Buffer.from(String(blob).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

// ── L'archivio di prova: la stessa mescolanza trovata in produzione ───────────
const VALORI = {
  allianzUser: 'utente.allianz@withus.it',
  allianzTotp: 'JBSWY3DPEHPK3PXP',                 // vecchia chiave, come in produzione
  primaUser: 'utente.prima',
  primaPass: 'pa$$w0rd con spazi e simboli àèì',
  postaPass: 'password-della-casella',
  rotto: 'v1:questo-non-si-apre-con-niente',
};
function archivioDiPartenza() {
  return {
    allianz: {
      username: chiudi(K_NUOVA, VALORI.allianzUser),      // gia' a posto
      totp: chiudi(K_VECCHIA, VALORI.allianzTotp),        // da ricifrare
      nome: 'Allianz',                                    // non cifrato: non si tocca
    },
    __custom: {
      'c-prima': {
        username: chiudi(K_VECCHIA, VALORI.primaUser),    // da ricifrare
        password: chiudi(K_VECCHIA, VALORI.primaPass),    // da ricifrare
        attiva: true,
      },
      'c-rotta': { password: VALORI.rotto },              // illeggibile
    },
    __caselle_mail: {                                     // annidato: deve arrivarci
      'info@withus.it': { pass: chiudi(K_VECCHIA, VALORI.postaPass) },
    },
  };
}

const ambiente = { ...process.env, FONTI_STORE: STORE, FONTI_SECRET: SEGRETO_NUOVO, HOSTNAME: 'vps' };
const lancia = (args) => execFileSync('node', [SCRIPT, ...args], { env: ambiente, encoding: 'utf8' });

const prove = {};

// ── 1) Senza --scrivi non tocca niente ───────────────────────────────────────
fs.writeFileSync(STORE, JSON.stringify(archivioDiPartenza(), null, 2));
const primaByte = fs.readFileSync(STORE);
const guarda = lancia([]);
prove['in sola lettura non tocca il file'] = fs.readFileSync(STORE).equals(primaByte);
prove['in sola lettura elenca i 4 campi da ricifrare'] = /da ricifrare \(4\)/.test(guarda);
prove['in sola lettura vede il campo illeggibile'] = /NON si aprono con nessuna chiave \(1\)/.test(guarda);
prove['non stampa mai un valore in chiaro'] =
  !Object.values(VALORI).some(v => v.length > 6 && guarda.includes(v));

// ── 2..5) Con --scrivi ───────────────────────────────────────────────────────
for (const f of fs.readdirSync('/tmp')) if (f.startsWith('fonti.ricifra.test.json.prima-di-')) fs.unlinkSync('/tmp/' + f);
const scritto = lancia(['--scrivi']);
const copie = fs.readdirSync('/tmp').filter(f => f.startsWith('fonti.ricifra.test.json.prima-di-'));
prove['fa una copia di sicurezza prima di scrivere'] = copie.length === 1;
prove['la copia e\' identica all\'originale di partenza'] =
  copie.length === 1 && fs.readFileSync('/tmp/' + copie[0]).equals(primaByte);

const dopo = JSON.parse(fs.readFileSync(STORE, 'utf8'));
prove['il TOTP di Allianz ora si apre con la chiave attuale'] =
  apri(K_NUOVA, dopo.allianz.totp) === VALORI.allianzTotp;
prove['utente e password di Prima si aprono e sono identici'] =
  apri(K_NUOVA, dopo.__custom['c-prima'].username) === VALORI.primaUser &&
  apri(K_NUOVA, dopo.__custom['c-prima'].password) === VALORI.primaPass;
prove['arriva anche alle password delle caselle mail'] =
  apri(K_NUOVA, dopo.__caselle_mail['info@withus.it'].pass) === VALORI.postaPass;

const partenza = JSON.parse(fs.readFileSync('/tmp/' + copie[0], 'utf8'));
prove['quello che era gia\' a posto non viene riscritto'] =
  dopo.allianz.username === partenza.allianz.username;
prove['i campi non cifrati restano intatti'] =
  dopo.allianz.nome === 'Allianz' && dopo.__custom['c-prima'].attiva === true;
prove['il campo illeggibile resta dov\'era'] =
  dopo.__custom['c-rotta'].password === VALORI.rotto;

// ── 6) Rilanciarlo non fa danni ──────────────────────────────────────────────
const dueByte = fs.readFileSync(STORE);
const secondo = lancia([]);
prove['un secondo giro non trova piu\' niente da fare'] =
  /Niente da fare/.test(secondo) && fs.readFileSync(STORE).equals(dueByte);

// ── 7) Senza la chiave del backend deve RIFIUTARSI di scrivere ───────────────
// E' la prova piu' importante: il canale comandi della VPS gira da root e NON ha
// FONTI_SECRET in ambiente. Se lo script non se ne accorgesse, prenderebbe per
// «attuale» la chiave vecchia e ricifrerebbe al contrario, rendendo illeggibile al
// backend anche quello che oggi funziona.
{
  fs.writeFileSync(STORE, JSON.stringify(archivioDiPartenza(), null, 2));
  const intatto = fs.readFileSync(STORE);
  const cieco = { ...process.env, FONTI_STORE: STORE, HOSTNAME: 'vps' };
  delete cieco.FONTI_SECRET;
  let uscita = 0, detto = '';
  try { execFileSync('node', [SCRIPT, '--scrivi'], { env: cieco, encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { uscita = e.status; detto = String(e.stderr || '') + String(e.stdout || ''); }
  prove['senza la chiave del backend si rifiuta di scrivere'] = uscita === 6;
  prove['rifiutandosi, non ha toccato il file'] = fs.readFileSync(STORE).equals(intatto);
  prove['spiega perche\' si e\' fermato'] = /non ho la chiave del backend/i.test(detto);
  // E deve saperla leggere da server/.env, come fa il backend.
  const envFinto = path.join(__dir, '.env');
  const cera = fs.existsSync(envFinto);
  if (!cera) {
    fs.writeFileSync(envFinto, 'FONTI_SECRET=' + SEGRETO_NUOVO + '\n');
    let ok = false;
    try { ok = /presa da: server\/\.env/.test(execFileSync('node', [SCRIPT], { env: cieco, encoding: 'utf8' })); } catch {}
    prove['in mancanza dell\'ambiente legge server/.env'] = ok;
    fs.unlinkSync(envFinto);
  } else {
    console.log('  (salto la prova su server/.env: qui ne esiste gia\' uno vero, non lo tocco)');
  }
  for (const f of fs.readdirSync('/tmp')) if (f.startsWith('fonti.ricifra.test.json.prima-di-')) fs.unlinkSync('/tmp/' + f);
}

console.log('\n══ ESITI ══');
let ko = 0;
for (const [k, v] of Object.entries(prove)) { console.log((v ? '  ✅ ' : '  ❌ ') + k); if (!v) ko++; }
console.log(ko ? '\n' + ko + ' promesse non mantenute.' : '\nTutte le promesse mantenute.');

try { fs.unlinkSync(STORE); } catch {}
for (const f of copie) { try { fs.unlinkSync('/tmp/' + f); } catch {} }
process.exit(ko ? 1 : 0);
