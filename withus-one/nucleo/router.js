/* ═══════════════════════════════════════════════════════════════════════════
   ROUTER — che cosa si vede, e come ci si torna
   ───────────────────────────────────────────────────────────────────────────
   L'indirizzo è la verità: `#/clienti?id=123`. Così un collega può incollare
   in chat il punto esatto in cui si trova, il tasto «indietro» funziona e un
   aggiornamento di pagina non riporta alla scrivania.
   ═══════════════════════════════════════════════════════════════════════════ */
import { trova, visibile } from './registro.js';
import { attesa, errore } from './ui.js';

export function leggiIndirizzo() {
  const grezzo = (location.hash || '').replace(/^#\/?/, '');
  const [percorso, query] = grezzo.split('?');
  const parametri = {};
  new URLSearchParams(query || '').forEach((v, k) => { parametri[k] = v; });
  return { chiave: (percorso || '').trim() || 'scrivania', parametri };
}

export function scriviIndirizzo(chiave, parametri) {
  const q = new URLSearchParams(parametri || {}).toString();
  return '#/' + chiave + (q ? '?' + q : '');
}

export function creaRouter({ contenitore, ctx, suCambio }) {
  let modulo = null;      // il modulo attualmente montato
  let giro = 0;           // vedi sotto: serve a scartare i caricamenti superati

  async function apri() {
    const { chiave, parametri } = leggiIndirizzo();
    const voce = trova(chiave);

    if (!voce) { fermati(); mostraNonTrovato(chiave); return; }
    if (!visibile(voce, ctx.utente)) { fermati(); mostraNonPermesso(voce); return; }

    /* Se si clicca in fretta su due voci, il primo caricamento può finire DOPO
       il secondo e disegnarci sopra. Ogni apertura prende un numero: quando
       ritorna, se il numero non è più l'ultimo, si butta via il risultato. */
    const mio = ++giro;

    fermati();
    contenitore.innerHTML = attesa();
    suCambio && suCambio(voce, parametri);

    let mod;
    try {
      mod = await import(`../moduli/${voce.chiave}.js`);
    } catch (e) {
      if (mio !== giro) return;
      contenitore.innerHTML = `<div class="w1-errore">
        <b>«${voce.titolo}» non è ancora disponibile.</b>
        <br><small>Il modulo non si è caricato: ${String(e && e.message || e)}</small></div>`;
      return;
    }
    if (mio !== giro) return;

    if (typeof mod.monta !== 'function') {
      contenitore.innerHTML = `<div class="w1-errore"><b>«${voce.titolo}» non è scritto bene.</b>
        <br><small>Manca la funzione monta(). Vedi CONTRATTO.md §3.</small></div>`;
      return;
    }

    modulo = mod;
    contenitore.innerHTML = '';
    try {
      await mod.monta(contenitore, { ...ctx, parametri });
    } catch (e) {
      if (mio !== giro) return;
      /* Un modulo che esplode non deve portarsi dietro il guscio: il menu resta
         navigabile e si vede che cosa è andato storto. */
      console.error('modulo ' + voce.chiave, e);
      errore(contenitore, e);
    }
  }

  /* Un modulo può aver lasciato acceso un timer o un ascolto: si spegne prima
     di lasciarlo, altrimenti continua a girare a pagina cambiata. */
  function fermati() {
    if (modulo && typeof modulo.smonta === 'function') {
      try { modulo.smonta(); } catch (e) { console.warn('smonta():', e); }
    }
    modulo = null;
  }

  function mostraNonTrovato(chiave) {
    contenitore.innerHTML = `<div class="w1-errore"><b>Pagina non trovata.</b>
      <br><small>«${String(chiave).replace(/[<>&]/g, '')}» non esiste. Usa il menu qui a fianco.</small></div>`;
  }

  function mostraNonPermesso(voce) {
    contenitore.innerHTML = `<div class="w1-errore"><b>«${voce.titolo}» non è accessibile con il tuo ruolo.</b>
      <br><small>Se ti serve, chiedi all'ufficio con una richiesta.</small></div>`;
  }

  function vaiA(chiave, parametri) {
    const nuovo = scriviIndirizzo(chiave, parametri);
    if (location.hash === nuovo) apri();   // stesso indirizzo: niente evento, si ricarica a mano
    else location.hash = nuovo;
  }

  window.addEventListener('hashchange', apri);
  return { apri, vaiA, fermati };
}

export default { creaRouter, leggiIndirizzo, scriviIndirizzo };
