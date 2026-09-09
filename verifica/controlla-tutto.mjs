// ═════════════════════════════════════════════════════════════════════════════
//  BANCO UNICO DI QUOTO
//
//    npm test              tutte le prove offline, interfaccia compresa
//    npm run test:fast     tutte le prove offline tranne il browser
//    npm run test:ui       soltanto il collaudo Playwright dell'interfaccia
//    npm run test:live     collegamenti reali alle compagnie (esplicito)
//
//  Le prove ordinarie non chiamano produzione e non aprono i portali delle
//  compagnie. Il controllo live resta separato per non confondere un guasto
//  esterno o una sessione scaduta con una regressione del codice.
// ═════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOLO_UI = process.argv.includes('--solo-ui');
const CON_UI = SOLO_UI || process.argv.includes('--ui');
const RAPIDO = process.argv.includes('--fast');
const esiti = [];
const saltati = [];

const gruppi = [
  ['Impianto', 'deploy', /\.test\.mjs$/],
  ['Server', 'server', /\.test\.mjs$/],
  ['API e contratti', 'server/verifica', /\.test\.mjs$/],
  ['Scraper', 'scraper/verifica', /\.test\.mjs$/],
  ['Scocca With Us One', 'withus-one/verifica', /\.test\.mjs$/],
  ['Estensione Prima', 'prima-extension/verifica', /\.test\.mjs$/],
  ['Prima intermediari', 'prima-intermediari/test', /\.test\.js$/],
  ['Prima intermediari - schema', 'prima-intermediari/verifica', /\.test\.mjs$/],
];

function fileDelGruppo(cartella, filtro) {
  const dir = path.join(RADICE, cartella);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(nome => filtro.test(nome))
    .sort()
    .map(nome => path.join(cartella, nome));
}

function eseguiFile(file) {
  const sorgente = fs.readFileSync(path.join(RADICE, file), 'utf8');
  const usaBrowser = /(?:from\s+['"]playwright['"]|require\(['"]playwright['"]\))/.test(sorgente)
    || /banco-premi\.mjs/.test(sorgente);
  const provaLenta = file === 'server/verifica/fonti-vive.test.mjs';
  if (RAPIDO && (usaBrowser || provaLenta)) {
    saltati.push(file);
    console.log(`\n── ${file} (saltata nel giro rapido)`);
    return true;
  }
  console.log(`\n── ${file}`);
  const r = spawnSync(process.execPath, [path.join(RADICE, file)], {
    cwd: RADICE,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
    timeout: Number(process.env.TEST_TIMEOUT_MS || (RAPIDO ? 60000 : 300000)),
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  const ok = r.status === 0;
  esiti.push({ ok, nome: file, dettaglio: r.error ? r.error.message : (ok ? '' : `uscita ${r.status}`) });
  return ok;
}

async function portaLibera() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const porta = s.address().port;
      s.close(err => err ? reject(err) : resolve(porta));
    });
  });
}

function trovaIam() {
  const candidati = [
    process.env.IAM_REPO,
    path.resolve(RADICE, '../IAM'),
    path.resolve(RADICE, '../Agente-sospesi'),
    path.resolve(RADICE, '../agente-sospesi'),
  ].filter(Boolean);
  return candidati.find(p => fs.existsSync(path.join(p, 'index.html'))) || '';
}

async function eseguiUi() {
  console.log('\n════════ INTERFACCIA (PLAYWRIGHT) ════════');
  const porta = await portaLibera();
  const base = `http://127.0.0.1:${porta}`;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORTA: String(porta),
    QUOTO_TEST_BASE: base,
    IAM_REPO: trovaIam(),
  };
  const server = spawn(process.execPath, [path.join(RADICE, 'static-server.js')], {
    cwd: RADICE, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errServer = '';
  server.stderr.on('data', b => { errServer += String(b); });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server statico non partito entro 10 secondi')), 10000);
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`server statico terminato (${code}): ${errServer.trim()}`)); });
      server.stdout.on('data', b => {
        if (String(b).includes('[collaudo]')) { clearTimeout(timer); resolve(); }
      });
    });
    const r = spawnSync(process.execPath, [path.join(RADICE, 'ui-test.mjs')], {
      cwd: RADICE, encoding: 'utf8', env,
    });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    const ok = r.status === 0;
    esiti.push({ ok, nome: 'ui-test.mjs', dettaglio: r.error ? r.error.message : (ok ? '' : `uscita ${r.status}`) });
  } catch (e) {
    console.error('UI non eseguita:', e.message);
    esiti.push({ ok: false, nome: 'ui-test.mjs', dettaglio: e.message });
  } finally {
    server.kill('SIGTERM');
  }
}

if (!SOLO_UI) {
  for (const [titolo, cartella, filtro] of gruppi) {
    const files = fileDelGruppo(cartella, filtro);
    console.log(`\n════════ ${titolo.toUpperCase()} (${files.length}) ════════`);
    for (const file of files) eseguiFile(file);
  }
}

if (CON_UI) await eseguiUi();

const falliti = esiti.filter(e => !e.ok);
console.log('\n═══════════════════════════════════════════════════════');
console.log(falliti.length === 0
  ? `QUOTO: tutti i ${esiti.length} file di prova sono superati`
  : `QUOTO: ${falliti.length} file di prova falliti su ${esiti.length}`);
for (const e of falliti) console.log(`  X ${e.nome}${e.dettaglio ? ' — ' + e.dettaglio : ''}`);
if (saltati.length) console.log(`Giro rapido: ${saltati.length} prove lente/browser escluse; usa npm test per includerle.`);
if (!CON_UI && !RAPIDO) console.log('Nota: collaudo interfaccia escluso; usa npm test per includerlo.');
console.log('Nota: i collegamenti reali sono esclusi; usa npm run test:live solo quando serve.');
process.exit(falliti.length ? 1 : 0);
