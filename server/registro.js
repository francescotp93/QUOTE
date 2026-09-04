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

export function riga(d) {
  const ms = Math.round(d.ms);
  return [
    new Date(d.quando).toISOString(),
    (d.metodo || '?').padEnd(6),
    d.percorso,
    String(d.stato),
    ms + 'ms',
    d.utente ? 'u:' + String(d.utente).slice(0, 8) : 'u:-',
  ].join(' ');
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
    res.on('finish', function () {
      /* Il percorso senza la query. `req.path` la toglie gia'; si passa da
         `split('?')` lo stesso perche' un domani qualcuno potrebbe registrare
         `req.originalUrl` senza pensarci. */
      const percorso = String(req.path || req.originalUrl || '').split('?')[0];
      if (!daRegistrare(percorso, res.statusCode)) return;
      scrivi(riga({
        quando: inizio, ms: Date.now() - inizio,
        metodo: req.method, percorso, stato: res.statusCode,
        utente: req.user && req.user.id,
      }));
    });
    next();
  };
}
