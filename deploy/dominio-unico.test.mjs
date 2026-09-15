// ═══════════════════════════════════════════════════════════════════════════════
//  DOMINIO UNICO — il pacchetto Caddy che porta IAM e QUOTO sotto un indirizzo
//
//  Perché queste prove esistono. Il file deploy/caddy/iam.caddy lo applica
//  l'autopull sul VPS, da solo, senza che nessuno lo guardi: se nasconde un file
//  che il browser carica, il preventivatore si apre bianco in produzione; se
//  dimentica una cartella del backend, il sorgente del server torna pubblico
//  (com'era su GitHub Pages). E `deploy/TRASLOCO-OVH.md` proponeva di nascondere
//  /tariffe/motore/*: sono i motori di tariffa che la pagina carica con
//  <script src>. Sarebbe stato un rilascio verde con il quotatore rotto.
//
//  Qui non gira Caddy (il binario non si scarica dalla sessione web): si
//  controlla che il file dica le cose giuste e che lo script d'impianto abbia
//  tutte le reti — copia di sicurezza, validazione, rientro, verifica di api.
//  La validazione vera la fa lo script sul VPS, prima di ricaricare.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');
/* IAM_CADDY=<file> fa girare le prove su un altro file: e' la controprova. */
const caddy = process.env.IAM_CADDY ? fs.readFileSync(process.env.IAM_CADDY, 'utf8') : leggi('deploy/caddy/iam.caddy');
const setup = leggi('deploy/setup.d/20-dominio-unico-caddy.sh');
const autopull = leggi('deploy/autopull.sh');
const index = leggi('index.html');

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/* Le righe `path …` di un matcher nominato: l'elenco di cosa viene nascosto. */
function nascosti(nomeMatcher) {
  const i = caddy.indexOf('@' + nomeMatcher + ' {');
  deve(i >= 0, 'manca il matcher @' + nomeMatcher);
  const blocco = caddy.slice(i, caddy.indexOf('}', i));
  return [...blocco.matchAll(/^\s*path\s+(.+)$/gm)].flatMap(m => m[1].trim().split(/\s+/));
}
/* Un percorso combacia con una regola Caddy `path`? (prefisso con *, suffisso *.ext, esatto) */
function combacia(percorso, regola) {
  if (regola.endsWith('/*')) return percorso.startsWith(regola.slice(0, -1));
  if (regola.startsWith('*')) return percorso.endsWith(regola.slice(1));
  return percorso === regola;
}

// ── 1. il file e' fatto come deve ────────────────────────────────────────────
prova('il sito e\' iam.withusassicurazioni.it, con QUOTO sotto /nuovo-preventivo/ e IAM alla radice', () => {
  deve(/^iam\.withusassicurazioni\.it \{/m.test(caddy), 'manca il blocco del sito');
  deve(/handle_path \/nuovo-preventivo\/\* \{[\s\S]*?root \* \/opt\/withus-backend/.test(caddy), 'QUOTO non e\' servito da /opt/withus-backend sotto /nuovo-preventivo/');
  deve(/redir \/nuovo-preventivo \/nuovo-preventivo\/ 308/.test(caddy), 'senza la barra finale i percorsi relativi della pagina si perdono');
  deve(/handle \{[\s\S]*?root \* \/opt\/withus-iam/.test(caddy), 'IAM non e\' servito da /opt/withus-iam alla radice');
  const aperte = (caddy.match(/\{/g) || []).length, chiuse = (caddy.match(/\}/g) || []).length;
  deve(aperte === chiuse, 'graffe sbilanciate: ' + aperte + ' aperte, ' + chiuse + ' chiuse');
});

prova('il blocco api.withusassicurazioni.it non sta qui: resta nel Caddyfile scritto a mano', () => {
  deve(!/^api\.withusassicurazioni\.it/m.test(caddy), 'il file ridefinisce api.: due blocchi per lo stesso nome e Caddy non parte');
});

prova('i percorsi di servizio sono quelli che IAM gia\' inoltra (vercel.json)', () => {
  const riga = (caddy.match(/@servizi path (.+)/) || [])[1];
  deve(riga, 'manca il matcher @servizi');
  const qui = new Set(riga.trim().split(/\s+/));
  /* La fonte e' Agente-sospesi/vercel.json, se il repo gemello e' accanto;
     altrimenti l'elenco copiato da li' il 28/07/2026. */
  let attesi = ['/api', '/auth', '/backup', '/catalogo', '/crm', '/diag', '/firma-collab', '/fonti', '/health', '/l', '/lead', '/login', '/mail', '/marketing', '/moto', '/notify', '/pay', '/preventivi', '/products', '/public', '/scrape', '/shop', '/sign', '/user'];
  for (const c of ['/home/user/agente-sospesi/vercel.json', path.join(RADICE, '..', 'agente-sospesi', 'vercel.json')]) {
    if (fs.existsSync(c)) {
      const v = JSON.parse(fs.readFileSync(c, 'utf8'));
      attesi = [...new Set(v.routes.map(r => r.src.replace(/\/\(\.\*\)$/, '').replace(/\/$/, '')).filter(s => /^\/[a-z-]+$/.test(s) && s !== '/nuovo-preventivo'))];
      break;
    }
  }
  const mancanti = attesi.filter(p => !qui.has(p + '/*') && !qui.has(p));
  deve(mancanti.length === 0, 'percorsi di servizio non inoltrati al backend: ' + mancanti.join(', '));
  deve(/handle @servizi \{\s*reverse_proxy localhost:3000/.test(caddy), 'i servizi non vanno al backend sulla porta 3000');
  return attesi.length + ' percorsi, tutti verso il backend';
});

// ── 2. nascosto quello che va nascosto, e NIENTE di quello che il browser carica ──
prova('QUOTO: il sorgente del backend e la configurazione restano fuori', () => {
  const n = nascosti('sorgente_quoto');
  for (const dovuto of ['/server/*', '/scraper/*', '/supabase/*', '/deploy/*', '/config/*', '/node_modules/*', '/.git/*', '/.env', '/.env.*', '*.mjs', '/package.json', '/static-server.js'])
    deve(n.includes(dovuto), 'non nascosto: ' + dovuto);
  return n.length + ' regole';
});

prova('QUOTO: nessun file che index.html carica nel browser e\' nascosto (motori di tariffa compresi)', () => {
  const n = nascosti('sorgente_quoto');
  /* Tutto cio' che la pagina chiede con src=, href= o fetch('percorso relativo'). */
  const caricati = new Set();
  for (const m of index.matchAll(/(?:src|href)="([^"h][^"?]*)/g)) caricati.add('/' + m[1].replace(/^\.?\//, ''));
  for (const m of index.matchAll(/fetch\('([a-z][^'?]*)'/g)) caricati.add('/' + m[1]);
  deve(caricati.size > 10, 'ho letto solo ' + caricati.size + ' file caricati: la prova non starebbe guardando niente');
  const colpiti = [...caricati].filter(f => n.some(r => combacia(f, r)));
  deve(colpiti.length === 0, 'file che il browser carica e Caddy nasconderebbe: ' + colpiti.join(', '));
  deve([...caricati].some(f => f.startsWith('/tariffe/motore/')), 'index.html non carica piu\' i motori da tariffe/motore: la prova va aggiornata');
  deve(!n.some(r => r.startsWith('/tariffe')), 'una regola nasconde /tariffe: sono i motori e i premi che il browser scarica');
  return caricati.size + ' file caricati dalla pagina, nessuno nascosto';
});

prova('IAM: prove, migrazioni e configurazione Vercel restano fuori; index.html no', () => {
  const n = nascosti('sorgente_iam');
  for (const dovuto of ['/verifica/*', '/sql/*', '/.git/*', '/vercel.json', '/package.json', '*.mjs'])
    deve(n.includes(dovuto), 'non nascosto: ' + dovuto);
  for (const vivo of ['/index.html', '/withus-one.js', '/withus-one.css', '/analisi-bisogni.html', '/withus-logo-green.png'])
    deve(!n.some(r => combacia(vivo, r)), 'nascosto per errore: ' + vivo);
});

// ── 3. lo script d'impianto ha tutte le reti ─────────────────────────────────
prova('lo script fa la copia di sicurezza PRIMA di toccare il Caddyfile', () => {
  const iBak = setup.indexOf('cp -a "$CF" "$BAK"');
  const iScrive = setup.indexOf('>> "$CF"');
  deve(iBak > 0 && iScrive > iBak, 'si scrive nel Caddyfile prima di averne una copia');
  deve(/Caddyfile\.buona-/.test(setup) || /\$CF\.buona-/.test(setup), 'la copia non segue la convenzione Caddyfile.buona-<data> (REGISTRO-RICHIESTE.md)');
});

prova('lo script valida, ricarica, controlla api. e la configurazione in esecuzione — e rientra se uno fallisce', () => {
  for (const passo of ['caddy validate --config "$CF" --adapter caddyfile', 'systemctl reload caddy', 'api.withusassicurazioni.it/health', '127.0.0.1:2019/config/'])
    deve(setup.includes(passo), 'manca il passo: ' + passo);
  const rientri = (setup.match(/ripristina; exit 1/g) || []).length;
  deve(rientri >= 5, 'solo ' + rientri + ' punti di rientro: validazione, reload, stato, api, configurazione in esecuzione');
  deve(/ripristina\(\) \{[\s\S]*cp -a "\$BAK" "\$CF"[\s\S]*systemctl reload caddy/.test(setup), 'il rientro non rimette il Caddyfile di prima e non ricarica');
  /* Il PRIMO reload dello script e' quello dentro ripristina(): si guarda il
     reload del percorso normale, quello dentro `if ! systemctl reload caddy`. */
  deve(setup.indexOf('if ! systemctl reload caddy') > setup.indexOf('if ! caddy validate'), 'si ricarica prima di validare');
});

prova('lo script aggiunge UNA riga di import e non riscrive il blocco api.', () => {
  deve(/grep -qxF "\$IMPORT" "\$CF"/.test(setup), 'la riga di import non e\' idempotente: a ogni giro se ne aggiungerebbe una');
  deve(/IMPORT='import \/etc\/caddy\/withus\/\*\.caddy'/.test(setup), 'l\'import non punta a /etc/caddy/withus/*.caddy');
  deve(!/sed[^\n]*\$CF/.test(setup) && !/> "\$CF"/.test(setup.replace(/>> "\$CF"/g, '')), 'lo script riscrive o modifica il Caddyfile oltre ad aggiungere in fondo');
  deve(/\bexit 1\b/.test(setup) && /^exit 0$/m.test(setup), 'senza exit 1 nei fallimenti l\'autopull segnerebbe «fatto» un impianto non riuscito');
});

prova('l\'autopull ricarica i siti versionati solo se validano, e rimette quelli di prima se no', () => {
  const i = autopull.indexOf("grep -q '^deploy/caddy/'");
  deve(i > 0, 'l\'autopull non guarda deploy/caddy/');
  const blocco = autopull.slice(i, autopull.indexOf('rm -rf "$PRIMA"', i));
  deve(/caddy validate[^\n]*&& systemctl reload caddy/.test(blocco), 'il reload non e\' condizionato alla validazione');
  deve(/cp -a "\$PRIMA"\/\. \/etc\/caddy\/withus\//.test(blocco), 'in caso di errore non tornano i file di prima');
  deve(/\[ -d \/etc\/caddy\/withus \]/.test(blocco), 'l\'autopull agirebbe anche prima dell\'impianto');
  deve(autopull.indexOf("grep -q '^deploy/caddy/'") < autopull.indexOf('Script di primo impianto'), 'il blocco va prima degli script d\'impianto, dove CHANGED e\' ancora quello del giro');
});

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nDOMINIO UNICO — il pacchetto Caddy');
for (const { nome, fn } of esiti) {
  try { const d = fn(); console.log('  ok  ' + nome + (d ? ' — ' + d : '')); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + e.message); }
}
console.log(`\nDOMINIO UNICO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
