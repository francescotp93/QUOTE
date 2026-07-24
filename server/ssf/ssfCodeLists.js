/**
 * Code list SSF — DECODIFICA dei campi `*_SHARE`/codificati.
 * ============================================================
 * NON forniti da SAVE: **ricavati per reverse-engineering** dai flussi reali
 * (primo giro: flusso PRIMA A2194). Alcuni codici sono auto-evidenti (CONFERMATO),
 * altri dedotti incrociando i dati (INFERITO — validare con altri flussi).
 *
 * ⚠️ Attenzione: i campi `*_CMP` sono specifici della compagnia (PRIMA usa
 *    MOTOR/HOME, PREPAID/CREDITCARD…); i `*_SHARE` sono i codici normalizzati.
 *    Estendere queste tabelle profilando i flussi di altre compagnie
 *    (script: distinct dei campi codificati — vedi doc assieasy-ssf-codelist).
 */

// Frazionamento: numero rate/anno (CONFERMATO 1,2 dal flusso; 4/6/12 per convenzione)
export const FRAZIONAMENTO = { '1': 'annuale', '2': 'semestrale', '4': 'trimestrale', '6': 'bimestrale', '12': 'mensile' };

// Mezzo pagamento normalizzato SSF (INFERITO da PRIMA: CR=carta, BB=bonifico, NN=altro/non mappato)
export const MEZZO_PAG = { CR: 'carta', BB: 'bonifico', NN: 'altro', CO: 'contanti', RD: 'rid_sdd', AS: 'assegno' };

// Stato polizza (INFERITO da PRIMA: AT=attiva, ST=stornata, PV=proposta/provvisoria)
export const STATO_POLIZZA = { AT: 'attiva', ST: 'stornata', PV: 'proposta', SO: 'sospesa', SC: 'scaduta', DI: 'disdetta' };
// Riconduce lo stato SSF agli stati usati da quote_polizze.
export const STATO_POLIZZA_QUOTO = { AT: 'attiva', ST: 'disdetta', PV: 'attiva', SO: 'sospesa', SC: 'scaduta', DI: 'disdetta' };

// Tipo titolo normalizzato SSF (INFERITO: PN=premio [nuova/rinnovo], QZ=quietanza)
export const TIPO_TITOLO = { PN: 'premio', QZ: 'quietanza', RI: 'rimborso', ST: 'storno' };

// Tipo titolo lato compagnia PRIMA (INFERITO: NB=nuova, RW=rinnovo, SE=sostituzione/appendice, FNB=prima nuova)
export const TIPO_TITOLO_CMP_PRIMA = { NB: 'nuova', RW: 'rinnovo', SE: 'sostituzione', FNB: 'prima_nuova' };

// Stato titolo (INFERITO: I=incassato; P=emesso/da incassare — validare)
export const STATO_TITOLO = { I: 'incassato', P: 'emesso', A: 'annullato', S: 'sospeso' };

// Tipo premi (INFERITO da PRIMA: A=annuale unico, R=rateizzato)
export const TIPO_PREMI = { A: 'annuale', R: 'rateizzato' };

// Flag S/N -> boolean
export const flag = (v) => String(v || '').toUpperCase() === 'S';

/** decode(tabella, codice, fallback=codice grezzo) */
export function decode(table, code, fallback) {
  if (code === undefined || code === null || code === '') return fallback !== undefined ? fallback : null;
  const v = table[String(code).toUpperCase()];
  return v !== undefined ? v : (fallback !== undefined ? fallback : String(code));
}
