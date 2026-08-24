// ═══════════════════════════════════════════════════════════════════════════════
//  L'ESITO — il silenzio non è successo
//
//  Perché esiste. In un'agenzia assicurativa il difetto peggiore non è
//  l'errore: è il «fatto» detto quando non è stato fatto niente. Un errore lo
//  si vede e si richiama il cliente. Un finto successo diventa una decisione
//  sbagliata presa con calma.
//
//  Il caso che ha fatto nascere questo modulo (allianz:297, verificato il
//  02/08/2026):
//
//      const filled = await cercaTarga(targa);
//      return { ok: true, targa, campo_targa_compilato: filled, ... };
//
//  `filled` dice se il campo targa è stato trovato e compilato. Se il portale
//  cambia e il campo non c'è più, `filled` è false — e la risposta è `ok: true`
//  lo stesso. Chi la legge vede una interrogazione ANIA riuscita e nessun
//  risultato, e conclude che il veicolo non è assicurato. L'interrogazione non
//  era mai partita.
//
//  La regola qui è una sola: `ok: true` non si scrive a mano. Si ottiene solo
//  costruendolo con dei dati, e senza dati la costruzione fallisce subito e
//  rumorosamente, invece di mentire piano.
//
//  Niente dipendenze: si prova senza avviare nulla.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * I motivi per cui una cosa non si può fare. Sono pochi di proposito: ognuno
 * corrisponde a una frase diversa da dire a chi guarda il pannello, e a un
 * gesto diverso da fare. Se due motivi portano allo stesso gesto, sono lo
 * stesso motivo.
 */
export const CODICI = {
  RICHIESTA_INCOMPLETA: 'richiesta_incompleta',   // manca un dato a chi ha chiesto
  CREDENZIALI_MANCANTI: 'credenziali_mancanti',   // il Pannello Fonti è vuoto
  CODICE_RICHIESTO: 'codice_richiesto',           // serve un passcode 2FA nuovo
  FRENO_TIRATO: 'freno_tirato',                   // troppi accessi falliti: fermi
  NON_LOGGATO: 'non_loggato',                     // sessione caduta
  PORTALE_CAMBIATO: 'portale_cambiato',           // la pagina non è più quella
  PORTALE_NON_RISPONDE: 'portale_non_risponde',   // tempo scaduto, rete
  MANUTENZIONE: 'manutenzione',                   // il portale lo dice da solo
  OCCUPATO: 'occupato',                           // un'altra operazione in corso
  IMPREVISTO: 'imprevisto',                       // quello che non abbiamo previsto
};

const HTTP = {
  [CODICI.RICHIESTA_INCOMPLETA]: 400,
  [CODICI.CREDENZIALI_MANCANTI]: 409,
  [CODICI.CODICE_RICHIESTO]: 409,
  [CODICI.FRENO_TIRATO]: 409,
  [CODICI.NON_LOGGATO]: 409,
  [CODICI.PORTALE_CAMBIATO]: 502,
  [CODICI.PORTALE_NON_RISPONDE]: 504,
  [CODICI.MANUTENZIONE]: 503,
  [CODICI.OCCUPATO]: 503,
  [CODICI.IMPREVISTO]: 500,
};

/** L'eccezione che porta con sé un esito già formato. */
export class ErroreEsito extends Error {
  constructor(esito) {
    super((esito && esito.errore && esito.errore.messaggio) || 'operazione non riuscita');
    this.name = 'ErroreEsito';
    this.esito = esito;
  }
}

function vuoto(d) {
  if (d == null) return true;
  if (typeof d === 'string') return d.trim() === '';
  if (Array.isArray(d)) return d.length === 0;
  if (typeof d === 'object') return Object.keys(d).length === 0;
  return false;   // 0 e false sono dati legittimi
}

/**
 * Il successo. NON si può dichiarare a vuoto: senza dati questa funzione
 * lancia, perché «è andata bene» senza niente da mostrare è esattamente il
 * difetto che questo modulo esiste per impedire.
 */
export function riuscito(dati) {
  if (vuoto(dati)) {
    throw new Error('riuscito() senza dati: un successo che non ha niente da mostrare non è un successo');
  }
  return { ok: true, dati };
}

/** Il fallimento, col motivo e con che cosa dire a chi guarda. */
export function fallito(codice, messaggio, dettagli) {
  const c = Object.values(CODICI).includes(codice) ? codice : CODICI.IMPREVISTO;
  const e = { codice: c, messaggio: String(messaggio || 'operazione non riuscita') };
  if (dettagli !== undefined) e.dettagli = dettagli;
  return { ok: false, errore: e };
}

/** È già un esito, o è un oggetto qualunque? */
export function eEsito(x) {
  return !!x && typeof x === 'object' && typeof x.ok === 'boolean'
    && (x.ok === true ? 'dati' in x : !!x.errore && typeof x.errore.codice === 'string');
}

/** Che stato HTTP merita questo esito. Deciso qui una volta sola, così le tre
    applicazioni non lo decidono ognuna a modo suo. */
export function statoHttp(esito) {
  if (!eEsito(esito)) return 500;
  if (esito.ok) return 200;
  return HTTP[esito.errore.codice] || 500;
}

/**
 * «Questa cosa deve essere vera, altrimenti fermati qui.» Serve a scrivere il
 * controllo dove sta il fatto, invece che in fondo dove ci si dimentica.
 */
export function esigi(condizione, codice, messaggio, dettagli) {
  if (!condizione) throw new ErroreEsito(fallito(codice, messaggio, dettagli));
  return true;
}

/**
 * Da un'eccezione qualunque a un esito. Riconosce ErroreEsito e ne conserva il
 * codice; per tutto il resto distingue almeno i tempi scaduti, che sono il caso
 * più frequente e meritano una frase diversa da «imprevisto».
 */
export function daEccezione(e) {
  if (e instanceof ErroreEsito && eEsito(e.esito)) return e.esito;
  const m = String((e && e.message) || e || '');
  if (/timeout|timed out|tempo scaduto|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND/i.test(m)) {
    return fallito(CODICI.PORTALE_NON_RISPONDE, 'Il portale non ha risposto in tempo.', m.slice(0, 200));
  }
  return fallito(CODICI.IMPREVISTO, 'Errore imprevisto.', m.slice(0, 200));
}
