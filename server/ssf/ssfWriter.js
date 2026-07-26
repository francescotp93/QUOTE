/**
 * Generatore SSF OUTBOUND (segnalazioni incassi) — "Share Com Incassi" a specchio.
 * ==============================================================================
 * Ricostruito per reverse-engineering dallo stesso tracciato SSF V12 (inbound):
 * produce i CSV `REC000` (testata) + `REC040` (titoli) + `REC042` (incassi) da
 * inviare alle compagnie che adottano SHARE. Usa le code list AL CONTRARIO (encode).
 * ESM, zero dipendenze. L'eventuale ZIP finale resta a monte/ops.
 */
import fs from 'node:fs';
import path from 'node:path';
import { STATO_TITOLO, TIPO_TITOLO, MEZZO_PAG, encode } from './ssfCodeLists.js';

// Header ufficiali (dal tracciato inbound: mirror esatto)
const H = {
  '000': 'TP_RECORD_SHARE;CHARSET;EMETTITORE;VERSIONE_TRACCIATO;CONVERSIONE;DATA_PRODUZIONE_FILE;DAL;AL;INTERMEDIARIO_EXP',
  '040': 'TP_RECORD_SHARE;KE;KI;ID_POLIZZA_EXP;ID_TITOLO_INVIO;ID_POLIZZA_INVIO;COMPAGNIA_ANIA;COMPAGNIA_EXP;AGENZIA;NUMERO_POLIZZA_CMP;RAMO;EFFETTO_TITOLO;DATA_SCADENZA_EMESSO;TIPO_TITOLO_COMPAGNIA;TIPO_TITOLO_SHARE;TIPO_POLIZZA;FRAZIONAMENTO;STATO_SHARE;ID_TITOLO_EXP;DT_PAG_CLIENTE;DT_COMPETENZA_CONTABILE;VALUTA_SHARE;TIPO_COASS;NS_QUOTA;TIPO_PREMI_DELEGA;NETTO_TOTALE;DIRITTI_TOTALE;ACCESSORI_TOTALE;IMPONIBILE_TOTALE;SSN_TOTALE;TASSE_TOTALE;LORDO_TOTALE;PROVVIGIONI_TOTALE;COLLABORATORE_1;PRODOTTO_CMP;MEZZO_PAGAMENTO_CMP;MEZZO_PAG_SHARE;LIBRO_MATRICOLA;GIORNI_MORA;TIMESTAMP_RECORD',
  '042': 'TP_RECORD_SHARE;ID_TITOLO_INVIO;ID_TITOLO_EXP;COMPAGNIA_ANIA;COMPAGNIA_EXP;AGENZIA;NUMERO_POLIZZA_CMP;RAMO;EFFETTO_TITOLO;STATO_SHARE;ID_INCASSO_EXP;COD_GARANZIA_CMP;DESCRIZIONE_GARANZIA_CMP;TIPO_PREMI_DELEGA;NETTO;DIRITTI;ACCESSORI;IMPONIBILE;TASSE;LORDO;SSN;PROVVIGIONI_TOTALI;COLLABORATORE_1;TIMESTAMP_RECORD',
};

// 520.00 -> "520,00" ; null -> ""
function num(v) { return (v === null || v === undefined || v === '') ? '' : Number(v).toFixed(2).replace('.', ','); }
// "2026-06-16" -> "16/06/2026"
function dt(v) { if (!v) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v)); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v); }
// costruisce una riga rispettando l'ordine dell'header
function line(rec, obj) { return H[rec].split(';').map((c) => (obj[c] === undefined || obj[c] === null ? '' : String(obj[c]))).join(';'); }

/**
 * Genera i file del flusso incassi outbound.
 * @param dataset { testata:{emittente,intermediario,dal,al,dataProduzione}, titoli:[{ ... , incassi:[...] }] }
 * @returns { 'REC000_...csv': contenuto, 'REC040_...csv': ..., 'REC042_...csv': ... }
 */
export function generateIncassiFlusso({ testata = {}, titoli = [] } = {}) {
  const rec000 = [H['000'], line('000', {
    TP_RECORD_SHARE: 0, CHARSET: 'UTF-8', EMETTITORE: testata.emittente || 'WITHUS',
    VERSIONE_TRACCIATO: 'SSF V12', CONVERSIONE: 'N', DATA_PRODUZIONE_FILE: dt(testata.dataProduzione),
    DAL: dt(testata.dal), AL: dt(testata.al), INTERMEDIARIO_EXP: testata.intermediario || '',
  })];

  const rec040 = [H['040']];
  const rec042 = [H['042']];
  for (const t of titoli) {
    rec040.push(line('040', {
      TP_RECORD_SHARE: 40, ID_POLIZZA_EXP: t.idPolizza || '', ID_TITOLO_EXP: t.idTitolo || '', ID_TITOLO_INVIO: t.idTitolo || '',
      COMPAGNIA_EXP: t.compagnia || '', COMPAGNIA_ANIA: t.compagniaAnia || '', AGENZIA: t.agenzia || '',
      NUMERO_POLIZZA_CMP: t.numeroPolizza || '', RAMO: t.ramo || '', EFFETTO_TITOLO: dt(t.effetto),
      TIPO_TITOLO_SHARE: encode(TIPO_TITOLO, t.tipoTitolo), STATO_SHARE: encode(STATO_TITOLO, t.stato),
      DT_PAG_CLIENTE: dt(t.dataPagamento), DT_COMPETENZA_CONTABILE: dt(t.dataCompetenza), VALUTA_SHARE: 'EUR',
      TIPO_PREMI_DELEGA: 'T', LORDO_TOTALE: num(t.lordo), PROVVIGIONI_TOTALE: num(t.provvigioni),
      MEZZO_PAG_SHARE: encode(MEZZO_PAG, t.mezzoPag), COLLABORATORE_1: t.collaboratore || '', GIORNI_MORA: t.giorniMora ?? '',
    }));
    for (const inc of t.incassi || []) {
      rec042.push(line('042', {
        TP_RECORD_SHARE: 42, ID_TITOLO_EXP: t.idTitolo || '', ID_TITOLO_INVIO: t.idTitolo || '', ID_INCASSO_EXP: inc.idIncasso || '',
        COMPAGNIA_EXP: t.compagnia || '', AGENZIA: t.agenzia || '', NUMERO_POLIZZA_CMP: t.numeroPolizza || '', RAMO: t.ramo || '',
        EFFETTO_TITOLO: dt(t.effetto), STATO_SHARE: encode(STATO_TITOLO, t.stato),
        COD_GARANZIA_CMP: inc.codGaranzia || '', DESCRIZIONE_GARANZIA_CMP: inc.garanzia || '', TIPO_PREMI_DELEGA: 'T',
        LORDO: num(inc.lordo), PROVVIGIONI_TOTALI: num(inc.provvigioni), COLLABORATORE_1: t.collaboratore || '',
      }));
    }
  }

  const suffix = `M_${testata.emittente || 'WITHUS'}_${testata.intermediario || 'NA'}_OUT_P`;
  return {
    [`REC000_${suffix}.csv`]: rec000.join('\n') + '\n',
    [`REC040_${suffix}.csv`]: rec040.join('\n') + '\n',
    [`REC042_${suffix}.csv`]: rec042.join('\n') + '\n',
  };
}

/** Scrive i file generati in una cartella (creata se assente). Ritorna i path. */
export function writeFlusso(files, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content, 'utf8');
    written.push(p);
  }
  return written;
}
