// QUOTO · Connettore Mappatura — BACKGROUND (service worker)
// Raccoglie i record strutturali, li DEDUPLICA (una voce per endpoint+azione),
// e — se la mappatura è ATTIVA — li invia al VPS. Espone anche il download JSON.

const INGEST = 'https://api.withusassicurazioni.it/mappatura/ingest';
const INGEST_KEY = 'withus-mappatura-2026'; // chiave d'ingresso (non è un segreto sensibile: gate write-only)
const FLUSH_MS = 8000;

// firma univoca di un endpoint: host + metodo + percorso + azione + chiavi
function sig(r) {
  const keys = Object.keys(r.bodyKeys || r.qKeys || {}).sort().join(',');
  return [r.host, r.method, r.path, r.action || '', keys].join('|');
}

let MAP = {};       // sig -> record (ultimo visto, con forma risposta)
let enabled = true; // modalità mappatura attiva
let pendingUpload = false;

chrome.storage.local.get(['qmap_map', 'qmap_enabled'], (s) => {
  if (s.qmap_map) MAP = s.qmap_map;
  if (typeof s.qmap_enabled === 'boolean') enabled = s.qmap_enabled;
  updateBadge();
});

function persist() { chrome.storage.local.set({ qmap_map: MAP }); }
function updateBadge() {
  const n = Object.keys(MAP).length;
  try { chrome.action.setBadgeText({ text: n ? String(n) : '' }); chrome.action.setBadgeBackgroundColor({ color: enabled ? '#02984e' : '#8b9aa9' }); } catch {}
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'rec' && msg.rec && msg.rec.host) {
    const s = sig(msg.rec);
    // tieni il record più "ricco" (con forma risposta) per ogni endpoint
    const prev = MAP[s];
    if (!prev || (!prev.respShape && msg.rec.respShape)) MAP[s] = msg.rec;
    persist(); updateBadge(); pendingUpload = true;
    return;
  }
  if (msg && msg.type === 'getState') { reply({ count: Object.keys(MAP).length, enabled, perHost: perHost() }); return true; }
  if (msg && msg.type === 'toggle') { enabled = !!msg.value; chrome.storage.local.set({ qmap_enabled: enabled }); updateBadge(); reply({ enabled }); return true; }
  if (msg && msg.type === 'download') { reply({ json: JSON.stringify(exportMap(), null, 2) }); return true; }
  if (msg && msg.type === 'reset') { MAP = {}; persist(); updateBadge(); reply({ ok: true }); return true; }
  if (msg && msg.type === 'flushNow') { flush(true).then(() => reply({ ok: true })); return true; }
});

function perHost() {
  const h = {};
  for (const s of Object.keys(MAP)) { const host = MAP[s].host; h[host] = (h[host] || 0) + 1; }
  return h;
}
function exportMap() {
  return { generato: Date.now(), totale: Object.keys(MAP).length, perHost: perHost(), endpoints: Object.values(MAP) };
}

async function flush(force) {
  if (!enabled && !force) return;
  if (!pendingUpload && !force) return;
  const payload = exportMap();
  if (!payload.totale) return;
  try {
    await fetch(INGEST + '?key=' + encodeURIComponent(INGEST_KEY), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    pendingUpload = false;
  } catch (e) { /* offline o endpoint non pronto: riproverà; resta disponibile il download */ }
}

setInterval(() => { flush(false); }, FLUSH_MS);
