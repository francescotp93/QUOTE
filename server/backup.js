// ═══════════════════════════════════════════════════════════════════════════════
//  Backup giornaliero (in-process) — esporta TUTTE le tabelle Supabase (REST, service
//  role: bypassa RLS) + i file di config cifrati, in backups/withus-AAAAMMGG-hhmm.tar.gz.
//  Gira da solo ogni giorno (default 03:30 ora server). Usa le stesse SUPABASE_URL /
//  SUPABASE_SERVICE_ROLE_KEY del backend: nessun servizio o credenziale extra.
//  Tiene gli ultimi BACKUP_KEEP archivi (default 14) e cancella i più vecchi.
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __dir = path.dirname(fileURLToPath(import.meta.url));      // .../server
const ROOT = path.join(__dir, '..');                            // repo root (/opt/withus-backend)
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/+$/, '');
const OUT = process.env.BACKUP_DIR || path.join(ROOT, 'backups');
const KEEP = parseInt(process.env.BACKUP_KEEP || '14', 10);
const HOUR = parseInt(process.env.BACKUP_HOUR || '3', 10);
const MIN = parseInt(process.env.BACKUP_MIN || '30', 10);
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'francesco.oddo199307@gmail.com').toLowerCase();

const log = (...a) => console.log(new Date().toISOString(), '[backup]', ...a);
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const pad = n => String(n).padStart(2, '0');
function stamp() { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; }

// Scopre l'elenco tabelle dall'OpenAPI di PostgREST (così nuove tabelle entrano da sole).
async function discoverTables() {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/', { headers: { apikey: key(), Authorization: 'Bearer ' + key() } });
    const j = await r.json();
    const defs = (j && (j.definitions || (j.components && j.components.schemas))) || {};
    const names = Object.keys(defs).filter(n => n && !/[.()]/.test(n));
    return names;
  } catch (e) { log('discover err:', e.message); return []; }
}

/* ── IL GIUDIZIO SU UN ARCHIVIO ───────────────────────────────────────────────
   Funzione pura: nessuna rete, nessun disco, quindi si puo' provare davvero.
   Serve perche' `runBackup` scriveva `✅ creato` in ogni caso e subito dopo
   ruotava, tenendo gli ultimi KEEP archivi. Non c'era, in nessun punto, un
   controllo che dentro ci fosse qualcosa: quattordici notti storte di fila e i
   backup veri sparivano tutti, ognuno sostituito da un ✅ nel registro. */
export function giudicaBackup(manifest, { conChiave } = {}) {
  const tabelle = (manifest && manifest.tabelle) || {};
  const nomi = Object.keys(tabelle);
  const fallite = nomi.filter(n => typeof tabelle[n] !== 'number');
  const righe = nomi.reduce((s, n) => s + (typeof tabelle[n] === 'number' ? tabelle[n] : 0), 0);
  const no = (motivo) => ({ attendibile: false, motivo, tabelle_fallite: fallite, righe });

  if (!conChiave) {
    return no('SUPABASE_SERVICE_ROLE_KEY assente: non e\' stata esportata nessuna tabella. '
      + 'Nell\'archivio ci sono solo i file di configurazione cifrati, che sono utili ma non sono l\'archivio clienti.');
  }
  if (!nomi.length) {
    return no('nessuna tabella esportata: l\'elenco delle tabelle e\' arrivato vuoto '
      + '(di solito vuol dire che la chiamata a PostgREST e\' fallita).');
  }
  if (fallite.length) {
    return no('non si e\' riusciti a leggere ' + fallite.length + ' tabelle su ' + nomi.length
      + ': ' + fallite.join(', ') + '. Una tabella saltata a meta\' e\' peggio di una assente, '
      + 'perche\' l\'archivio sembra completo.');
  }
  if (righe === 0) {
    return no('tutte le ' + nomi.length + ' tabelle risultano vuote: zero righe in tutto. '
      + 'E\' possibile, ma su questo archivio non ci si puo\' contare.');
  }
  return { attendibile: true, motivo: '', tabelle_fallite: [], righe };
}

/* Solo questo nome e' un backup buono. La rotazione conta e cancella dentro
   QUESTO insieme: cosi' un archivio fallito non puo' occupare uno dei posti e
   spingerne fuori uno vero. Prima il filtro era `/^withus-.*\.tar\.gz$/`, che
   avrebbe preso dentro anche gli archivi falliti. */
const RE_BUONI = /^withus-\d{8}-\d{4}\.tar\.gz$/;
export function eArchivioBuono(nome) { return RE_BUONI.test(String(nome || '')); }
/* Chi guarda la cartella deve capirlo senza aprire niente. */
export function NOME_FALLITO(marca) { return `withus-FALLITO-${marca}.tar.gz`; }

async function dumpTable(dir, t) {
  const PAGE = 1000; const rows = [];
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(t)}?select=*`, {
      headers: { apikey: key(), Authorization: 'Bearer ' + key(), 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` },
    });
    /* Prima qui c'era `break`, e subito sotto si scriveva comunque `rows` —
       anche vuoto — restituendo la sua lunghezza. Cosi' una tabella che non si
       era riusciti a leggere finiva nel manifesto come `0`: ESATTAMENTE quello
       che scrive una tabella davvero vuota. E un fallimento alla seconda pagina
       su cinque salvava una tabella parziale dichiarandone il conteggio
       parziale come completo. Adesso un guasto e' un guasto: chi chiama lo
       registra come «errore: ...» e il backup non si dichiara riuscito. */
    if (!r.ok) throw new Error('HTTP ' + r.status + ' alla riga ' + from);
    const batch = await r.json();
    if (!Array.isArray(batch)) break;
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  fs.writeFileSync(path.join(dir, t + '.json'), JSON.stringify(rows));
  return rows.length;
}

function tar(archive, dir) {
  return new Promise((res, rej) => execFile('tar', ['-czf', archive, '-C', dir, '.'], e => e ? rej(e) : res()));
}

export async function runBackup() {
  fs.mkdirSync(OUT, { recursive: true });
  const work = path.join(OUT, '.tmp-' + stamp());
  fs.mkdirSync(work, { recursive: true });
  const manifest = { creato: new Date().toISOString(), supabase_url: SUPABASE_URL, tabelle: {}, file: [] };
  if (key()) {
    const tables = await discoverTables();
    log('esporto', tables.length, 'tabelle Supabase');
    for (const t of tables) {
      try { manifest.tabelle[t] = await dumpTable(work, t); } catch (e) { manifest.tabelle[t] = 'errore: ' + e.message; }
    }
  } else log('SUPABASE_SERVICE_ROLE_KEY assente: salvo solo i file locali');
  // file di configurazione critici (credenziali cifrate)
  for (const f of ['server/fonti.store.json', 'server/assistant.store.json']) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(work, path.basename(f))); manifest.file.push(f); }
  }
  /* Il giudizio si dà PRIMA di scrivere qualunque cosa, e finisce dentro al
     manifesto: chi aprirà l'archivio fra sei mesi deve trovarci scritto se era
     buono, senza doverlo dedurre. */
  const g = giudicaBackup(manifest, { conChiave: !!key() });
  manifest.attendibile = g.attendibile;
  manifest.motivo = g.motivo;
  manifest.righe_totali = g.righe;
  fs.writeFileSync(path.join(work, '_manifest.json'), JSON.stringify(manifest, null, 2));

  const marca = stamp();
  const archive = path.join(OUT, g.attendibile ? `withus-${marca}.tar.gz` : NOME_FALLITO(marca));
  await tar(archive, work);
  fs.rmSync(work, { recursive: true, force: true });
  const kb = Math.round(fs.statSync(archive).size / 1024);

  if (!g.attendibile) {
    /* NON si ruota. E' il punto di tutta la correzione: un archivio che non
       vale niente non deve poter cancellare quelli che valgono. L'archivio si
       scrive lo stesso, ma col nome che lo dichiara, cosi' resta da guardare
       per capire che cosa e' andato storto. */
    log('❌ BACKUP NON RIUSCITO —', g.motivo);
    log('   archivio incompleto salvato come', path.basename(archive), kb + 'KB');
    log('   i backup buoni NON sono stati toccati.');
    return { archive, kb, manifest, attendibile: false, motivo: g.motivo };
  }

  const buoni = fs.readdirSync(OUT).filter(eArchivioBuono).sort();
  for (const f of buoni.slice(0, Math.max(0, buoni.length - KEEP))) { fs.rmSync(path.join(OUT, f), { force: true }); log('rimosso vecchio', f); }
  log('✅ creato', path.basename(archive), kb + 'KB ·', g.righe, 'righe da',
    Object.keys(manifest.tabelle).length, 'tabelle · archivi tenuti:', Math.min(buoni.length, KEEP));
  return { archive, kb, manifest, attendibile: true, motivo: '' };
}

function msToNext() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), HOUR, MIN, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}
export function startBackupScheduler() {
  const schedule = () => {
    const ms = msToNext();
    log('prossimo backup tra', Math.round(ms / 3600000 * 10) / 10, 'ore', `(${pad(HOUR)}:${pad(MIN)})`);
    setTimeout(async () => {
      try {
        const r = await runBackup();
        /* Un backup notturno che non e' riuscito deve gridare nel registro, non
           scivolare via: e' l'unico posto da cui ci si accorge del problema
           prima del giorno in cui il backup serve davvero. */
        if (!r.attendibile) log('⚠️  ATTENZIONE: il backup di stanotte NON e\' utilizzabile —', r.motivo);
      } catch (e) { log('❌ backup non eseguito:', e.message); }
      schedule();
    }, ms);
  };
  schedule();
}

// ── Endpoint Super Admin: stato + esecuzione manuale ───────────────────────────
export const backupRouter = Router();
backupRouter.use((req, res, next) => {
  if ((req.user && req.user.email) !== SUPER_ADMIN_EMAIL) return res.status(403).json({ error: 'Riservato al Super Admin.' });
  next();
});
backupRouter.get('/status', (req, res) => {
  try {
    const all = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter(f => /^withus-.*\.tar\.gz$/.test(f)).sort().reverse() : [];
    const scheda = f => { const s = fs.statSync(path.join(OUT, f)); return { file: f, kb: Math.round(s.size / 1024), il: s.mtime }; };
    /* Buoni e falliti separati: un elenco unico faceva sembrare che ci fossero
       quattordici copie anche quando erano quattordici gusci vuoti. */
    const buoni = all.filter(eArchivioBuono).map(scheda);
    const falliti = all.filter(f => !eArchivioBuono(f)).map(scheda);
    res.json({
      ok: true, backups: buoni, falliti,
      utilizzabili: buoni.length,
      ultimo_utilizzabile: buoni[0] ? buoni[0].il : null,
      ogni_giorno: `${pad(HOUR)}:${pad(MIN)}`, prossimo_tra_ore: Math.round(msToNext() / 3600000 * 10) / 10,
    });
  } catch (e) { res.json({ ok: true, backups: [], errore: e.message }); }
});
backupRouter.post('/run', async (req, res) => {
  try {
    const r = await runBackup();
    const corpo = {
      ok: r.attendibile, file: path.basename(r.archive), kb: r.kb,
      righe_totali: r.manifest.righe_totali, tabelle: r.manifest.tabelle,
    };
    /* `ok:true` con dentro il nulla era la bugia da cui nasceva tutto. Un
       backup che non si puo' usare esce come guasto, non come risultato. */
    if (!r.attendibile) return res.status(500).json({ ...corpo, error: r.motivo, motivo: r.motivo });
    res.json(corpo);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
