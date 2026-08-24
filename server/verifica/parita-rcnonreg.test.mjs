// ═══════════════════════════════════════════════════════════════════════════════
//  PARITÀ — RC professionale non regolamentate
//
//  Il calcolo di questo prodotto era impastato col modulo a schermo: leggeva i
//  campi con getElementById e scriveva il risultato in innerHTML. E' stato
//  separato in tre — leggi, calcola, disegna — e la metà che calcola è uscita
//  in un modulo condiviso col backend.
//
//  L'aritmetica è stata spostata invariata, ma «invariata» va dimostrato, non
//  dichiarato: un premio che cambia di qualche euro non dà nessun errore, dà
//  una polizza a un prezzo storto.
//
//  Il confronto si fa così: la versione VECCHIA della pagina viene estratta
//  dalla storia e aperta in un browser senza schermo, si percorre la strada
//  dell'operatore e si legge il premio che stampa. La versione NUOVA si chiama
//  direttamente da Node. Stessi dati, stesso numero — su tutte le professioni
//  della tariffa.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { apriPreventivatore } from './banco-premi.mjs';

const RADICE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const richiedi = createRequire(import.meta.url);
const esiti = [];
const deve = (c, m) => { if (!c) throw new Error(m); };

const TARIFFA = JSON.parse(fs.readFileSync(path.join(RADICE, 'tariffe/rc_non_regolamentate.json'), 'utf8'));
const nuovo = richiedi(path.join(RADICE, 'tariffe/motore/rcnonreg.js'));

/* L'ultimo commit in cui il calcolo stava ancora dentro la pagina. Cercato
   nella storia e non fissato a mano: un riferimento scritto «HEAD» funziona
   una volta sola, e uno scritto a mano invecchia in silenzio. */
function commitDiRiferimento() {
  const righe = execSync('git log --format=%H -- index.html', { cwd: RADICE, encoding: 'utf8' }).trim().split('\n');
  for (const c of righe) {
    const n = execSync(`git show ${c}:index.html | grep -c "const netto=row&&row.p?row.p\\[mass\\]:null" || true`,
      { cwd: RADICE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
    if (Number(n) > 0) return c;
  }
  throw new Error('nessun commit contiene più il calcolo dentro la pagina');
}

async function premiDalVecchio(casi) {
  const dove = fs.mkdtempSync(path.join(os.tmpdir(), 'quoto-prima-'));
  execSync(`git archive ${commitDiRiferimento()} | tar -x -C ${JSON.stringify(dove)}`, { cwd: RADICE, stdio: 'pipe' });
  const q = await apriPreventivatore(dove);
  try {
    return await q.pagina.evaluate(async (casi) => {
      await renderRcprof();
      await rcpOpenNonReg();
      const out = [];
      for (const c of casi) {
        RCP.nrcat = c.categoria; RCP.prof = c.professione;
        const f = document.getElementById('rcp-fatt'); const m = document.getElementById('rcp-mass');
        f.value = String(c.fatturato);
        m.innerHTML = '<option value="' + c.massimale + '">x</option>';
        m.value = c.massimale;
        rcpComputeNR();
        out.push(RCP.quote ? { netto: RCP.quote.netto, lordo: RCP.quote.lordo, band: RCP.quote.band } : null);
      }
      return out;
    }, casi);
  } finally { await q.chiudi(); }
}

/* I casi: ogni categoria della tariffa, tre fatturati, tutti i massimali. */
function costruisciCasi() {
  const casi = [];
  for (const [codice, cat] of Object.entries(TARIFFA.categorie || {})) {
    for (const mass of (cat.massimali || [])) {
      for (const fatt of [30000, 150000, 900000]) {
        casi.push({ categoria: codice, professione: 'prova', massimale: mass, fatturato: fatt });
      }
    }
  }
  return casi;
}

console.log('\nPARITÀ — RC non regolamentate');
try {
  const casi = costruisciCasi();
  deve(casi.length > 20, 'troppi pochi casi: ' + casi.length);
  const vecchi = await premiDalVecchio(casi);
  const diversi = [];
  casi.forEach((c, i) => {
    const b = nuovo.calcolaRcNonReg(c, TARIFFA);
    const a = vecchi[i];
    const bb = b ? { netto: b.netto, lordo: b.lordo, band: b.band } : null;
    if (JSON.stringify(a) !== JSON.stringify(bb)) diversi.push({ c, vecchio: a, nuovo: bb });
  });
  if (diversi.length) {
    throw new Error(diversi.length + ' premi diversi su ' + casi.length + '. Primo: ' + JSON.stringify(diversi[0]).slice(0, 260));
  }
  esiti.push([true, 'stesso premio del preventivatore, su ogni combinazione', casi.length + ' casi, tutti identici']);
} catch (e) { esiti.push([false, 'stesso premio del preventivatore, su ogni combinazione', e.message]); }

try {
  const idx = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8');
  deve(!/const RC_LOAD\s*=/.test(idx), 'index.html ha ancora le costanti di caricamento e imposte');
  deve(!/function rcLordo\s*\(/.test(idx), 'index.html ha ancora la sua copia di rcLordo');
  deve(/tariffe\/motore\/rcnonreg\.js/.test(idx), 'la pagina non carica il modulo condiviso');
  esiti.push([true, 'il calcolo non è rimasto anche dentro la pagina', '']);
} catch (e) { esiti.push([false, 'il calcolo non è rimasto anche dentro la pagina', e.message]); }

try {
  const src = fs.readFileSync(path.join(RADICE, 'tariffe/motore/rcnonreg.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').trim();
  deve(/^\(function\s*\(/.test(src) && /\}\)\(\);?$/.test(src),
    'il modulo non è dentro un contenitore: le sue dichiarazioni diventerebbero globali della pagina');
  esiti.push([true, 'il modulo non sporca le variabili della pagina', '']);
} catch (e) { esiti.push([false, 'il modulo non sporca le variabili della pagina', e.message]); }

let ko = 0;
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n + (m ? ' — ' + m : '') : '  X   ' + n + ' — ' + m); if (!ok) ko++; }
console.log(`\nPARITÀ RC NON REGOLAMENTATE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
