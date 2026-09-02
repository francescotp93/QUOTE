// ═══════════════════════════════════════════════════════════════════════════════
//  TIENI SVEGLIA — un accesso non deve cadere da solo
//
//  PERCHE' ESISTE
//    Il 2 settembre 2026 Francesco: «gli accessi non si devono levare da soli,
//    devono restare tutti dentro, in modo da non dover inserire codici in
//    continuazione». Aveva ragione, e il censimento gli ha dato ragione due
//    volte: QUATTRO scraper su dieci avevano un keep-alive che non teneva
//    sveglio niente.
//
//      · prima     → chiamava solo ensurePage(): apriva il browser e basta.
//                    Non navigava MAI. Zero traffico verso il portale, quindi
//                    zero rinnovo della sessione.
//      · assieasy  → navigava solo se l'indirizzo non conteneva "assieasy".
//      · kube      → navigava solo se l'indirizzo non conteneva il suo host.
//                    In entrambi i casi, dopo il primo giro l'indirizzo GIA'
//                    corrisponde: la condizione e' falsa per sempre e non si
//                    naviga mai piu'.
//      · moto      → navigava davvero, ma non guardava mai l'esito: se la
//                    sessione era morta se ne accorgeva solo il primo
//                    preventivo, fallendo.
//
//    E' esattamente lo stesso errore che AXA aveva e si e' portata dietro per
//    mesi («navigava SOLO se NON eravamo gia' su /portal/ → nella pratica non
//    navigava mai»). Ripeterlo in quattro posti diversi vuol dire che non era
//    un errore di distrazione: era che ognuno se lo riscriveva da capo.
//
//  COSA FA UN KEEP-ALIVE CHE FUNZIONA — tre cose, sempre tutte e tre:
//    1. NAVIGA DAVVERO su una pagina interna. E' l'unica cosa che rinnova la
//       sessione lato server: guardare l'indirizzo che si ha in mano non manda
//       nessuna richiesta a nessuno.
//    2. GUARDA COM'E' ANDATA. Se non si controlla, la sessione morta la scopre
//       il primo preventivo — cioe' un cliente che aspetta.
//    3. SE E' CADUTA, PROVA A RIENTRARE. Dove si puo' farlo da soli si fa,
//       senza disturbare nessuno; dove serve un codice dal telefono lo si dice
//       una volta, chiaramente, invece di ribussare ogni tre minuti.
//
//  Non tocca la pagina mentre un preventivo o un login sono in corso: competere
//  con quella navigazione e' gia' costato preventivi falliti per una corsa fra
//  due pezzi di codice sulla stessa scheda del browser.
// ═══════════════════════════════════════════════════════════════════════════════

/* Un giro solo del ciclo. Si costruisce a parte perche' un ciclo che vive
   dentro setInterval non si puo' provare: qui si puo' chiamare a mano, con
   pezzi finti, e vedere se fa le tre cose. */
export function creaGiro({
  nome = 'keep-alive',
  occupato = () => false,   // preventivo o login in corso: non si tocca la pagina
  visita,                   // async () => void  — NAVIGA davvero su una pagina interna
  dentro,                   // async () => bool  — siamo ancora dentro?
  fuori = null,             // async () => bool  — ci ha rimbalzati al login? (facoltativo)
  rientra = null,           // async () => any   — prova a rientrare da solo (facoltativo)
  segnala = null,           // (bool) => void    — aggiorna lo stato interno dello scraper
  log = () => {},
  tentativi = 12,
  attesaMs = 2000,
  aspetta = ms => new Promise(r => setTimeout(r, ms)),
} = {}) {
  if (typeof visita !== 'function') throw new Error('tieniSveglia: manca `visita` — un keep-alive che non naviga non tiene sveglio niente');
  if (typeof dentro !== 'function') throw new Error('tieniSveglia: manca `dentro` — senza guardare l\'esito, la sessione morta la scopre il primo preventivo');

  /* «L'ho detto una volta» — un motivo che non cambia non va ripetuto ogni tre
     minuti: il 2 settembre il log di Allianz aveva dieci righe identiche in
     mezz'ora, e in mezzo non si vedeva piu' niente. */
  let ultimoMotivo = '', ultimoMotivoDa = 0;
  const RIPETI_DOPO_MS = 30 * 60 * 1000;
  const diUnaVolta = (motivo) => {
    const ora = Date.now();
    if (motivo === ultimoMotivo && ora - ultimoMotivoDa < RIPETI_DOPO_MS) return;
    ultimoMotivo = motivo; ultimoMotivoDa = ora;
    log('[' + nome + '] ' + motivo);
  };

  return async function giro() {
    if (occupato()) return 'occupato';
    try {
      await visita();
      // Dopo la navigazione la pagina ci mette un attimo a dire chi e'. Si guarda
      // piu' volte invece di una: e' lo stesso motivo per cui il login di Groupama
      // sbagliava a concludere dopo quattro secondi.
      let esito = null;
      for (let i = 0; i < tentativi; i++) {
        if (occupato()) return 'occupato';   // e' arrivato un preventivo: gli lascio la pagina
        if (await dentro()) { esito = 'dentro'; break; }
        if (fuori && i >= 3 && await fuori()) { esito = 'fuori'; break; }
        await aspetta(attesaMs);
      }
      if (occupato()) return 'occupato';
      if (esito === 'dentro') { if (segnala) segnala(true); ultimoMotivo = ''; return 'dentro'; }
      if (esito !== 'fuori') { diUnaVolta('la pagina non dice se siamo dentro: non concludo niente'); return 'incerto'; }

      if (segnala) segnala(false);
      if (!rientra) { diUnaVolta('sessione caduta e da qui non posso rientrare da solo: serve un accesso dal Pannello Fonti'); return 'fuori'; }
      log('[' + nome + '] sessione caduta → provo a rientrare da solo…');
      const ok = await rientra();
      if (ok === false) { diUnaVolta('non sono riuscito a rientrare da solo: serve un accesso dal Pannello Fonti'); return 'fuori'; }
      ultimoMotivo = '';
      return 'rientrato';
    } catch (e) {
      diUnaVolta('errore: ' + (e && e.message));
      return 'errore';
    }
  };
}

/* Accende il ciclo. Ritorna l'handle di setInterval (e il giro stesso), cosi'
   chi prova puo' fermarlo e chiamarlo a mano. */
export function tieniSveglia(opzioni = {}) {
  const { ogniMinuti = 4 } = opzioni;
  const giro = creaGiro(opzioni);
  const handle = setInterval(() => { giro().catch(() => {}); }, Math.max(1, ogniMinuti) * 60 * 1000);
  if (handle && typeof handle.unref === 'function') handle.unref = handle.unref; // niente: il servizio deve restare vivo
  return { giro, handle, ferma: () => clearInterval(handle) };
}
