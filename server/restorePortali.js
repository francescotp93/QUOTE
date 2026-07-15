// ═══ RIPRISTINO TEMPORANEO portali Fonti — da rimuovere dopo l'uso ═══
// Rimette i portali custom (store.__custom) dall'ULTIMO backup giornaliero, senza
// perdere i dati attuali (merge: i valori attuali vincono). Scrittura ATOMICA e
// copia di sicurezza del file attuale. Non tocca scraper/sessioni, nessun riavvio.
// Protetto da chiave (?key=). Aggiunto da Leo per recuperare l'elenco Fonti.
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

export const restorePortaliRouter = Router();

const __dir = path.dirname(fileURLToPath(import.meta.url));   // .../server
const ROOT = path.join(__dir, '..');
const STORE = process.env.FONTI_STORE || path.join(__dir, 'fonti.store.json');
const BACKUPS = process.env.BACKUP_DIR || path.join(ROOT, 'backups');
const KEY = process.env.RESTORE_KEY || 'leo-restore-fonti-9Zt4Qp2mVx';

function untar(archive, dir, file) {
  return new Promise((res, rej) => execFile('tar', ['-xzf', archive, '-C', dir, file], e => e ? rej(e) : res()));
}
function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

restorePortaliRouter.get('/', async (req, res) => {
  if ((req.query.key || '') !== KEY) return res.status(403).json({ error: 'chiave non valida' });
  try {
    if (!fs.existsSync(BACKUPS)) return res.json({ ok: false, msg: 'Cartella backup non trovata: ' + BACKUPS });
    const archives = fs.readdirSync(BACKUPS).filter(f => /^withus-.*\.tar\.gz$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(BACKUPS, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    if (!archives.length) return res.json({ ok: false, msg: 'Nessun backup trovato in ' + BACKUPS });
    const latest = archives[0].f;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-'));
    await untar(path.join(BACKUPS, latest), tmp, './fonti.store.json');
    const backupStore = loadJson(path.join(tmp, 'fonti.store.json'));
    if (!backupStore || typeof backupStore !== 'object') return res.json({ ok: false, msg: 'Backup illeggibile', backup: latest });
    const bCustom = backupStore.__custom || {};
    const nBackup = Object.keys(bCustom).length;
    if (nBackup < 1) return res.json({ ok: false, msg: 'Il backup non contiene portali custom: non tocco nulla.', backup: latest });

    const current = loadJson(STORE) || {};
    let savedCopy = null;
    try { if (fs.existsSync(STORE)) { savedCopy = STORE + '.pre-restore.' + Date.now(); fs.copyFileSync(STORE, savedCopy); } } catch {}

    // Merge sicuro: recupera eventuali chiavi perse + unisce __custom e __caselle_mail (attuali vincono)
    const merged = { ...backupStore, ...current };
    merged.__custom = { ...bCustom, ...(current.__custom || {}) };
    if (backupStore.__caselle_mail || current.__caselle_mail)
      merged.__caselle_mail = { ...(backupStore.__caselle_mail || {}), ...(current.__caselle_mail || {}) };

    const tmpFile = STORE + '.tmp.' + Date.now();
    fs.writeFileSync(tmpFile, JSON.stringify(merged, null, 2), { mode: 0o600 });
    fs.renameSync(tmpFile, STORE);

    const nomi = Object.entries(merged.__custom).map(([k, v]) => (v && v.nome) || k);
    return res.json({ ok: true, backup: latest, portali_ripristinati: Object.keys(merged.__custom).length, portali: nomi, copia_sicurezza: savedCopy && path.basename(savedCopy) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});
