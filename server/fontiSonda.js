// ═══════════════════════════════════════════════════════════════════════════════
//  SONDA FONTI — interrogazione veloce e resiliente degli scraper
//
//  PERCHÉ ESISTE
//    Il Pannello Fonti chiedeva lo stato a OGNI scraper in fila indiana, con 6s di
//    timeout ciascuno. Con 8 portali e 3 servizi spenti l'elenco impiegava ~50s ad
//    aprirsi: sembrava che "Quoto fosse rotto", mentre erano solo attese sommate.
//
//  COSA FA
//    1) PARALLELO   — tutte le sonde partono insieme: il tempo totale è quello della
//                     sonda più lenta, non la somma.
//    2) TIMEOUT CORTO — /status è una risposta locale: se non arriva in pochi secondi
//                     il servizio è giù, aspettare oltre non cambia l'esito.
//    3) MICRO-CACHE — due aperture del pannello ravvicinate non ri-bombardano gli
//                     scraper (che hanno UN browser solo e vanno protetti).
//    4) INTERRUTTORE (circuit breaker) — uno scraper che ha già fallito due volte di
//                     fila viene dato per spento SENZA nemmeno chiamarlo, per un po'.
//                     Così una fonte morta costa 0 ms invece di un timeout pieno.
//
//  NON cambia la semantica degli stati mostrati all'utente: traduce solo la risposta
//  grezza dello scraper. La mappatura stato (attiva/scaduta/pronta/…) resta in fonti.js.
// ═══════════════════════════════════════════════════════════════════════════════

// Quanto aspettiamo la risposta di /status di uno scraper (è su 127.0.0.1: o risponde
// subito o è giù). Regolabile via env senza toccare il codice.
const TIMEOUT_MS = Number(process.env.FONTI_SONDA_TIMEOUT_MS) || 3500;
// Per quanto tempo riusiamo la risposta già ottenuta invece di richiamare lo scraper.
const TTL_MS = Number(process.env.FONTI_SONDA_TTL_MS) || 10000;
// Dopo quanti fallimenti consecutivi apriamo l'interruttore…
const SOGLIA_GUASTI = Number(process.env.FONTI_SONDA_SOGLIA) || 2;
// …e per quanto tempo la fonte resta "data per spenta" senza essere richiamata.
const BREAKER_MS = Number(process.env.FONTI_SONDA_BREAKER_MS) || 60000;

/** @type {Map<string, {t:number, ok:boolean, dati:any, ms:number, guasti:number, apertoFinoA:number}>} */
const CACHE = new Map();

function voce(surl) {
  let v = CACHE.get(surl);
  if (!v) { v = { t: 0, ok: false, dati: null, ms: 0, guasti: 0, apertoFinoA: 0 }; CACHE.set(surl, v); }
  return v;
}

/** Azzera cache e interruttore di una fonte: da chiamare dopo un login manuale
 *  o una "Verifica" dal pannello, così lo stato mostrato è subito quello nuovo. */
export function invalidaSonda(surl) {
  if (!surl) return;
  const v = voce(surl);
  v.t = 0; v.guasti = 0; v.apertoFinoA = 0;
}

/** Azzera TUTTO (usato dal watchdog quando vuole una fotografia fresca). */
export function invalidaTutto() { for (const v of CACHE.values()) { v.t = 0; v.guasti = 0; v.apertoFinoA = 0; } }

/**
 * Interroga /status di uno scraper.
 * @param {string} surl  base url dello scraper (es. http://127.0.0.1:4200)
 * @param {{forza?:boolean, timeoutMs?:number, ttlMs?:number}} [opt]
 *        forza = ignora cache e interruttore (per la Verifica manuale)
 * @returns {Promise<{ok:boolean, dati:any, ms:number, da:'rete'|'cache'|'interruttore'}>}
 *          ok=false significa "scraper non raggiungibile o risposta non valida".
 */
export async function sondaScraper(surl, opt = {}) {
  if (!surl) return { ok: false, dati: null, ms: 0, da: 'rete' };
  const forza = !!opt.forza;
  const ttl = opt.ttlMs != null ? opt.ttlMs : TTL_MS;
  const timeout = opt.timeoutMs != null ? opt.timeoutMs : TIMEOUT_MS;
  const v = voce(surl);
  const ora = Date.now();

  if (forza) { v.t = 0; v.guasti = 0; v.apertoFinoA = 0; }

  // 1) Risposta recente già in tasca.
  if (!forza && v.t && (ora - v.t) < ttl) return { ok: v.ok, dati: v.dati, ms: 0, da: 'cache' };

  // 2) Interruttore aperto: la diamo per spenta senza chiamarla (costo zero).
  if (!forza && v.apertoFinoA > ora) return { ok: false, dati: null, ms: 0, da: 'interruttore' };

  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeout);
    let r;
    try { r = await fetch(surl + '/status', { signal: ctrl.signal }); }
    finally { clearTimeout(to); }
    const dati = await r.json().catch(() => null);
    const ms = Date.now() - t0;
    if (!dati || typeof dati !== 'object') throw new Error('risposta non JSON');
    v.t = Date.now(); v.ok = true; v.dati = dati; v.ms = ms; v.guasti = 0; v.apertoFinoA = 0;
    return { ok: true, dati, ms, da: 'rete' };
  } catch {
    const ms = Date.now() - t0;
    v.t = Date.now(); v.ok = false; v.dati = null; v.ms = ms;
    v.guasti++;
    if (v.guasti >= SOGLIA_GUASTI) v.apertoFinoA = Date.now() + BREAKER_MS;
    return { ok: false, dati: null, ms, da: 'rete' };
  }
}

/**
 * Sonda N scraper IN PARALLELO.
 * @param {Array<{id:string,surl:string}>} voci
 * @param {{forza?:boolean}} [opt]
 * @returns {Promise<Map<string,{ok:boolean,dati:any,ms:number,da:string}>>} chiave = id
 */
export async function sondaTutte(voci, opt = {}) {
  const out = new Map();
  await Promise.all((voci || []).map(async (v) => {
    if (!v || !v.id) return;
    out.set(v.id, v.surl ? await sondaScraper(v.surl, opt) : { ok: false, dati: null, ms: 0, da: 'rete' });
  }));
  return out;
}

/** Fotografia dell'interruttore, per la diagnostica del pannello (nessun segreto). */
export function statoInterruttori() {
  const ora = Date.now();
  const out = {};
  for (const [surl, v] of CACHE.entries()) {
    out[surl] = {
      guasti_consecutivi: v.guasti,
      interruttore_aperto: v.apertoFinoA > ora,
      riprova_tra_s: v.apertoFinoA > ora ? Math.ceil((v.apertoFinoA - ora) / 1000) : 0,
      ultima_sonda_ms: v.ms,
    };
  }
  return out;
}

export default { sondaScraper, sondaTutte, invalidaSonda, invalidaTutto, statoInterruttori };
