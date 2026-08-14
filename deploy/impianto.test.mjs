// ═══════════════════════════════════════════════════════════════════════════════
//  Banco di prova dell'impianto — «nessuna compagnia puo' restare indietro»
//
//  PERCHE' ESISTE
//    Il 14 agosto 2026 tre scraper su dieci giravano male senza che nessuno lo
//    sapesse, per due errori muti nell'impianto:
//
//    1) deploy/bootstrap.sh teneva l'elenco delle compagnie scritto a mano
//       (SCRAPERS="italiana hdi groupama moto axa"). Chi ne aggiungeva una
//       aggiornava le cartelle e dimenticava questa riga: quello scraper partiva
//       lo stesso, ma senza la chiave di cifratura del Pannello Fonti, e rispondeva
//       «non ho credenziali» pur avendole. Nessun errore, nessun log: solo una
//       compagnia che non quota.
//
//    2) quotiamo-scraper.service leggeva EnvironmentFile=-/opt/withus-backend/.env,
//       un file che non esiste (quello vero e' server/.env). Il prefisso «-» dice a
//       systemd di tirare dritto in silenzio se il file manca.
//
//    Queste prove non guardano il codice che gira: guardano l'impianto che lo
//    accende. Sono le due cose che nessuno rilegge mai.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrap = fs.readFileSync(path.join(RADICE, 'deploy/bootstrap.sh'), 'utf8');

// Le compagnie vere: una cartella sotto scraper/ con un file <nome>-scraper.service.
const compagnie = fs.readdirSync(path.join(RADICE, 'scraper'))
  .filter(c => !c.startsWith('_'))
  .map(c => ({ c, dep: path.join(RADICE, 'scraper', c, 'deploy') }))
  .filter(x => fs.existsSync(x.dep) && fs.readdirSync(x.dep).some(f => f === x.c + '-scraper.service'))
  .map(x => x.c)
  .sort();

const prove = {};

// ── 1) L'elenco non e' scritto a mano ─────────────────────────────────────────
const rigaElenco = (bootstrap.match(/^SCRAPERS=.*$/m) || [''])[0];
prove['l\'elenco degli scraper non e\' una lista scritta a mano'] =
  !/^SCRAPERS="[a-z0-9 _-]+"/.test(rigaElenco.trim());
prove['l\'elenco si ricava dalle cartelle'] =
  /SCRAPERS=\$\([\s\S]{0,200}scraper\/\*\/deploy/.test(bootstrap);

// ── 2) Ogni compagnia riceve la chiave di cifratura ───────────────────────────
// Il ciclo che scrive i drop-in deve girare su TUTTO l'elenco, senza aggiunte a mano
// (era «for c in $SCRAPERS prima allianz», il segno che l'elenco era incompleto).
const cicloChiave = (bootstrap.match(/^for c in \$SCRAPERS[^;]*; do$/m) || [''])[0];
prove['il ciclo della chiave non ha compagnie aggiunte a mano'] =
  /^for c in \$SCRAPERS\s*;\s*do$/.test(cicloChiave.trim());

// ── 3) Nessun file di servizio punta a un .env che non esiste ─────────────────
// L'unico file d'ambiente del server e' server/.env. Chi ne indica un altro sta
// scrivendo un errore che systemd non segnalera' mai.
const ENV_BUONO = '/opt/withus-backend/server/.env';
const sbagliati = [];
for (const c of compagnie) {
  const f = path.join(RADICE, 'scraper', c, 'deploy', c + '-scraper.service');
  for (const riga of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = riga.match(/^EnvironmentFile=-?(.+)$/);
    if (m && m[1].trim() !== ENV_BUONO) sbagliati.push(c + ' → ' + m[1].trim());
  }
}
prove['nessun servizio legge un file d\'ambiente inesistente'] = sbagliati.length === 0;

// ── 4) L'impianto ricostruisce la macchina sul ramo giusto ────────────────────
prove['bootstrap punta al ramo main'] = /^BR=main\b/m.test(bootstrap);

// ── 5) La chiave non sta scritta nel repository ───────────────────────────────
prove['la chiave di cifratura non e\' scritta nel file'] =
  /^SECRET="\$\{FONTI_SECRET:-/m.test(bootstrap);

console.log('\ncompagnie trovate (' + compagnie.length + '):', compagnie.join(', '));
if (sbagliati.length) console.log('file d\'ambiente sbagliati:', sbagliati.join(' | '));
console.log('riga elenco:', rigaElenco.trim().slice(0, 100));

console.log('\n══ ESITI ══');
let ko = 0;
for (const [k, v] of Object.entries(prove)) { console.log((v ? '  ✅ ' : '  ❌ ') + k); if (!v) ko++; }
console.log(ko ? '\n' + ko + ' prove non reggono.' : '\nTutto regge.');
process.exit(ko ? 1 : 0);
