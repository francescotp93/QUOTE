// ═══════════════════════════════════════════════════════════════════════════════
//  IL NUCLEO DEL MOTOR — quello che è UGUALE per tutte le compagnie
//
//  Un adapter di compagnia sa solo tre cose: i suoi endpoint, come mappa i
//  campi, in che ordine chiama. Tutto il resto — normalizzare l'input al
//  contratto, eseguire una chiamata con timeout e ritentativi, tradurre un
//  errore, tenere il log strutturato dei fallimenti — è QUI, scritto una volta.
//
//  La prova che l'astrazione regge (Brief 2): un secondo adapter si aggiunge
//  senza toccare questo file. Se per farlo si deve cambiare il nucleo, il
//  confine fra «comune» e «specifico» è nel posto sbagliato.
//
//  Un adapter è un oggetto { compagnia, prodotto?, async quota(prev, ctx) }:
//    · `prev` è il Preventivo GIÀ normalizzato e validato (ci pensa il nucleo);
//    · `ctx` offre { esegui, chiama, log, ora } — gli attrezzi comuni;
//    · torna un Esito (esitoOk/esitoErrore del contratto).
//
//  Prove: server/verifica/motor-nucleo.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import {
  normalizzaInput, validaInput, validaEsito, esitoErrore, fallimento, PASSI,
} from '../../scraper/comune/contratto.mjs';

/** Esegue una chiamata con TIMEOUT e RITENTATIVI. Uguale per tutti: nessun
 *  adapter deve reinventare il retry (è lì che divergono e si rompono).
 *  `fn` riceve il numero del tentativo (0-based) e deve tornare una Promise.
 *  Torna il valore di `fn`, oppure rilancia l'ultimo errore dopo i tentativi. */
export async function esegui(fn, opt = {}) {
  const tentativi = Math.max(1, opt.tentativi || 1);
  const timeoutMs = opt.timeoutMs || 0;
  const attesaMs = opt.attesaMs || 0;
  const dormi = opt.dormi || ((ms) => new Promise(r => setTimeout(r, ms)));
  let ultimo;
  for (let i = 0; i < tentativi; i++) {
    try {
      if (!timeoutMs) return await fn(i);
      return await conTimeout(fn(i), timeoutMs);
    } catch (e) {
      ultimo = e;
      if (i < tentativi - 1 && attesaMs) await dormi(attesaMs);
    }
  }
  throw ultimo;
}

function conTimeout(promessa, ms) {
  return new Promise((risolvi, rifiuta) => {
    const t = setTimeout(() => { const e = new Error('TIMEOUT'); e.motor_timeout = true; rifiuta(e); }, ms);
    Promise.resolve(promessa).then(v => { clearTimeout(t); risolvi(v); }, e => { clearTimeout(t); rifiuta(e); });
  });
}

/**
 * Il flusso di quotazione, uguale per tutte le compagnie.
 *   grezzo → normalizza → valida → adapter.quota → valida esito → esito.
 * Qualunque cosa vada storta esce come Esito d'errore normalizzato (mai
 * un'eccezione che sfugge, mai un premio inventato) e, se è un guasto, lascia
 * una riga di log strutturata (cosa-manda / cosa-torna / dove / quando).
 *
 * @param adapter { compagnia, quota(prev, ctx) }
 * @param grezzo  input “sporco” come arriva da IAM/QUOTO
 * @param deps    { chiama?, log?, ora?, dormi? } — iniettabili per le prove
 */
export async function quota(adapter, grezzo, deps = {}) {
  const compagnia = adapter.compagnia || '';
  const log = deps.log || (() => {});
  const ora = deps.ora || (() => null);           // niente orologio implicito: le prove passano il tempo
  const chiama = deps.chiama || defaultChiama;

  const prev = normalizzaInput(grezzo);
  const v = validaInput(prev);
  if (!v.ok) return esitoErrore(compagnia, v.error_code, v.messaggio, null);

  const ctx = {
    esegui: (fn, opt) => esegui(fn, { dormi: deps.dormi, ...opt }),
    chiama, log, ora,
    /* scorciatoia per il log di un fallimento con oscuramento dei dati */
    fallimento: (o) => log(fallimento({ compagnia, quando: ora(), ...o })),
  };

  try {
    const esito = await adapter.quota(prev, ctx);
    const ve = validaEsito(esito);
    if (!ve.ok) {
      ctx.fallimento({ passo: 'lettura_premio', error_code: 'PROVIDER', payload: prev, rispostaGrezza: esito });
      return esitoErrore(compagnia, 'PROVIDER', 'esito dell\'adapter fuori contratto: ' + ve.messaggio, 'lettura_premio');
    }
    return esito;
  } catch (e) {
    const timeout = !!(e && e.motor_timeout) || /timeout/i.test(String(e && e.message));
    const codice = timeout ? 'TIMEOUT' : 'PROVIDER';
    const passo = PASSI.includes(e && e.passo) ? e.passo : 'quotazione';
    ctx.fallimento({ passo, error_code: codice, payload: prev, rispostaGrezza: String(e && e.message || e) });
    return esitoErrore(compagnia, codice, String(e && e.message || e), passo);
  }
}

/* La chiamata HTTP di default: gli adapter la usano via ctx.chiama, così le
   prove ne passano una finta e non serve una rete vera. */
async function defaultChiama(url, opt = {}) {
  const ctrl = new AbortController();
  const to = opt.timeoutMs ? setTimeout(() => ctrl.abort(), opt.timeoutMs) : null;
  try {
    const r = await fetch(url, { method: opt.method || 'GET', headers: opt.headers, body: opt.body, signal: ctrl.signal });
    const testo = await r.text();
    let json = null; try { json = JSON.parse(testo); } catch {}
    return { status: r.status, ok: r.ok, json, testo };
  } finally { if (to) clearTimeout(to); }
}
