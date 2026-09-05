// ── IL REGISTRO DELLE RICHIESTE ──────────────────────────────────────────────
/* Fino a oggi questo backend non scriveva una riga su nessuna richiesta HTTP.
   Nel giornale della macchina c'erano solo i battiti della vigilanza fonti.

   Non e' un dettaglio di comodita': il 04/09/2026 un parametro e' finito in
   tabella prima del codice che lo sapeva leggere, e per cinque minuti e
   quarantacinque secondi il programma ha calcolato pensioni piu' alte del vero.
   La domanda giusta — «in quella finestra qualcuno ha stampato un foglio?» —
   non ha avuto risposta, perche' non c'era niente da guardare. Con questo
   registro quella domanda ha una risposta in dieci secondi.

   COSA NON ENTRA QUI DENTRO, e non e' negoziabile:
   · la QUERY STRING, mai. QUOTO passa `?email=...` fra le sue pagine, e un
     giornale che nessuno cancella e' l'ultimo posto dove far finire l'indirizzo
     di un cliente. Si registra il percorso e basta.
   · il CORPO della richiesta: dentro ci sono nomi, redditi, date di nascita.
   · l'indirizzo email di chi chiama: solo le prime otto cifre del suo
     identificativo, che bastano a mettere in fila le richieste di una stessa
     persona e non dicono chi e' a chi legge il giornale.

   Le righe le raccoglie journald (`journalctl -u withus-backend`), che le ruota
   da solo: non serve un file da svuotare a mano. */

/* I percorsi che chiedono solo «sei vivo?». Passano ogni pochi secondi da
   sonde e script: registrarli riempirebbe il giornale di niente e renderebbe
   illeggibile quello che conta. Se pero' rispondono male, la riga si scrive:
   un /health che va in errore e' esattamente la cosa da vedere. */
export const SILENZIOSI = ['/health', '/'];

/* ── L'ALLARME ─────────────────────────────────────────────────────────────
   Una riga scritta in mezzo ad altre trecento non e' un allarme: e' un
   reperto, e lo si trova solo se lo si va a cercare. Il 4 settembre il
   registro aveva scritto «GET /parametri-previdenziali/numeri 401» e quella
   riga e' stata letta come la prova che il registro funzionava — mentre era
   anche la prova che il modulo, dentro IAM, non riusciva a leggere i numeri di
   legge. Da oggi le rotte previdenziali che rispondono 401 o 5xx si
   riconoscono a colpo d'occhio, e si trovano con un `grep ALLARME`.
   (05/09/2026) */
export function allarme(percorso, stato) {
  if (!/previdenzial/i.test(String(percorso || ''))) return null;
  if (stato === 401 || stato === 403) {
    return 'il modulo previdenziale non è riuscito a leggere i numeri di legge: chiamata senza token valido';
  }
  if (stato >= 500) return 'il server ha risposto con un errore a una rotta previdenziale';
  return null;
}

export function riga(d) {
  const ms = Math.round(d.ms);
  const grido = allarme(d.percorso, d.stato);
  return (grido ? '⚠ ALLARME · ' : '') + [
    new Date(d.quando).toISOString(),
    (d.metodo || '?').padEnd(6),
    d.percorso,
    String(d.stato),
    ms + 'ms',
    d.utente ? 'u:' + String(d.utente).slice(0, 8) : 'u:-',
  ].join(' ') + (grido ? '  ← ' + grido : '');
}

export function daRegistrare(percorso, stato) {
  if (stato >= 400) return true;
  return !SILENZIOSI.includes(percorso);
}

export function registroRichieste(scrivi = console.log) {
  return function (req, res, next) {
    const inizio = Date.now();
    /* SI SCRIVE ALLA FINE, non all'inizio: una riga senza esito e senza durata
       dice che la richiesta e' arrivata, non che e' stata servita — ed e' la
       seconda cosa quella che si va a cercare. `finish` scatta anche quando la
       risposta muore a meta': lo stato c'e' comunque. */
    /* IL PERCORSO SI PRENDE ADESSO, non alla fine. Express riscrive `req.url`
       quando la richiesta entra in un router montato: dentro
       app.use('/analisi-previdenziali', ...) il percorso diventa '/', e se la
       risposta parte da li' (un 401 di requireAuth) alla fine non e' piu'
       tornato quello di prima. La prima riga scritta in produzione diceva
       «POST / 401» al posto di «POST /analisi-previdenziali 401»: il registro
       c'era e non serviva a niente, perche' non diceva dove.
       `originalUrl` non lo riscrive nessuno. La query si toglie a mano — ed e'
       obbligatorio farlo qui, perche' originalUrl se la porta dietro tutta. */
    const percorso = String(req.originalUrl || req.url || '').split('?')[0];
    res.on('finish', function () {
      if (!daRegistrare(percorso, res.statusCode)) return;
      scrivi(riga({
        quando: inizio, ms: Date.now() - inizio,
        metodo: req.method, percorso: percorso, stato: res.statusCode,
        utente: req.user && req.user.id,
      }));
    });
    next();
  };
}
