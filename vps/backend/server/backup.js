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

async function dumpTable(dir, t) {
  const PAGE = 1000; const rows = [];
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(t)}?select=*`, {
      headers: { apikey: key(), Authorization: 'Bearer ' + key(), 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` },
    });
    if (!r.ok) { log('tabella', t, '→', r.status, '(salto)'); break; }
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
  fs.writeFileSync(path.join(work, '_manifest.json'), JSON.stringify(manifest, null, 2));
  const archive = path.join(OUT, `withus-${stamp()}.tar.gz`);
  await tar(archive, work);
  fs.rmSync(work, { recursive: true, force: true });
  const all = fs.readdirSync(OUT).filter(f => /^withus-.*\.tar\.gz$/.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP))) { fs.rmSync(path.join(OUT, f), { force: true }); log('rimosso vecchio', f); }
  const kb = Math.round(fs.statSync(archive).size / 1024);
  log('✅ creato', path.basename(archive), kb + 'KB · archivi tenuti:', Math.min(all.length, KEEP));
  return { archive, kb, manifest };
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
    setTimeout(async () => { try { await runBackup(); } catch (e) { log('errore:', e.message); } schedule(); }, ms);
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
    const list = all.map(f => { const s = fs.statSync(path.join(OUT, f)); return { file: f, kb: Math.round(s.size / 1024), il: s.mtime }; });
    res.json({ ok: true, backups: list, ogni_giorno: `${pad(HOUR)}:${pad(MIN)}`, prossimo_tra_ore: Math.round(msToNext() / 3600000 * 10) / 10 });
  } catch (e) { res.json({ ok: true, backups: [], errore: e.message }); }
});
backupRouter.post('/run', async (req, res) => {
  try { const r = await runBackup(); res.json({ ok: true, file: path.basename(r.archive), kb: r.kb, tabelle: r.manifest.tabelle }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
