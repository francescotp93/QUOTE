// ═══════════════════════════════════════════════════════════════════════════════
//  API v1 — quello che vale per TUTTE le famiglie di rotte
//
//  Prima questo codice stava dentro quoteApi.js. Quando sono arrivate le Fonti
//  serviva lo stesso involucro e la stessa porta d'ingresso: copiarli avrebbe
//  voluto dire due liste di errori che un giorno divergono, e IAM che si trova
//  davanti due dialetti dello stesso contratto. Sta in un posto solo.
// ═══════════════════════════════════════════════════════════════════════════════
import crypto from 'crypto';

/* I codici di errore sono un elenco chiuso: IAM ci scrive sopra dei comportamenti
   (riprovare, avvisare, fermarsi), e un codice inventato al volo diventa un ramo
   che nessuno ha previsto.

   NOT_FOUND e FORBIDDEN sono entrati il 20/08/2026 con le API delle Fonti.
   Prima «la fonte non esiste» sarebbe finita in PROVIDER_UNAVAILABLE, che vuol
   dire un'altra cosa e manda a cercare un guasto che non c'e'. */
export const ERRORI = ['PROVIDER_UNAVAILABLE', 'INVALID_INPUT', 'TIMEOUT', 'AUTH_FAILED', 'NOT_FOUND', 'FORBIDDEN'];

export function ora() { return new Date().toISOString(); }

/* L'involucro della risposta. Esiste una funzione sola per costruirlo, perché
   ogni punto che se lo scrive da sé è un punto che prima o poi lo scrive
   diverso. */
export function ok(extra) { return Object.assign({ success: true, generato_il: ora() }, extra); }
export function ko(codice, messaggio, provider = null, extra = {}) {
  return Object.assign({
    success: false,
    error_code: ERRORI.includes(codice) ? codice : 'PROVIDER_UNAVAILABLE',
    message: messaggio,
    provider,
    generato_il: ora(),
  }, extra);
}

/* La chiave interna. La chiamata è da server a server: l'utente l'ha già
   autenticato IAM, e rigirare qui il suo token vorrebbe dire che QUOTO deve
   saper leggere le sessioni di IAM — un legame in più fra due servizi che
   stiamo separando. Confronto a tempo costante: su una chiave condivisa il
   confronto ingenuo lascia misurare quante lettere sono giuste. */
export function chiaveInterna(chiave, log) {
  const registra = log || (() => {});
  /* `chiave` può essere una stringa oppure una funzione che la restituisce.
     Serve la seconda forma perché la chiave non sta più in un file: si legge da
     Supabase all'avvio e si rilegge ogni tanto (vedi chiaveCondivisa.js). Con una
     stringa fissa, presa una volta sola all'avvio, il backend resterebbe con la
     chiave vecchia fino al riavvio successivo — cioè un cambio chiave chiuderebbe
     il ponte senza che nessuno capisca perché. */
  return function (req, res, next) {
    const data = String(req.headers['x-internal-key'] || '');
    const atteso = String((typeof chiave === 'function' ? chiave() : chiave) || '');
    /* Le lunghezze vanno confrontate in BYTE, non in caratteri: «é» è una
       lettera sola ma due byte, e timingSafeEqual guarda i byte. Con il
       confronto sui caratteri bastava un accento nell'intestazione per far
       passare due buffer di lunghezza diversa alla funzione, che alza
       un'eccezione: cinquecento con traccia invece di un onesto 401, e la
       richiesta spariva dal registro dei tentativi falliti — cioè proprio dal
       posto dove si va a guardare quando qualcuno bussa. (20/08/2026) */
    const a = Buffer.from(data, 'utf8');
    const b = Buffer.from(atteso, 'utf8');
    let uguali = false;
    try {
      uguali = b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { uguali = false; }
    if (!atteso || !uguali) {
      registra({ evento: 'auth_fallita', rotta: req.path, quando: ora() });
      /* Una chiave sbagliata può voler dire che è stata cambiata e questo lato
         ha ancora quella vecchia. Si chiede una rilettura — che si limita da
         sé a una al minuto — così il ponte si riallinea senza aspettare il
         rinfresco di mezz'ora e senza riavviare niente. */
      if (typeof chiave === 'function' && typeof chiave.rileggi === 'function') chiave.rileggi();
      return res.status(401).json(ko('AUTH_FAILED', 'Chiave interna mancante o non valida.'));
    }
    registra({ evento: 'chiamata', rotta: req.path, metodo: req.method, quando: ora() });
    next();
  };
}
