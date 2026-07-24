'use strict';
/**
 * Mapping SSF -> schemi Withus (trasformazione PURA: nessuna scrittura su DB).
 * Allineato alle colonne reali:
 *   - quote_anagrafiche  (supabase/quote_schema.sql) + colonne SSF nuove
 *   - quote_polizze      (supabase/quote_polizze.sql) + colonne SSF nuove
 *   - im_titoli / im_incassi (supabase/ssf_schema_extensions.sql) — contabilita
 * Le colonne aggiunte da SSF sono create nella migrazione ssf_schema_extensions.sql.
 * Upsert idempotente per chiave ssf_id_* (+ TIMESTAMP_RECORD per l'ultima versione).
 */

function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function toDate(v) {
  if (!v) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v).trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
const bool = (v) => ['S', 'SI', '1', 'Y', 'TRUE'].includes(String(v || '').toUpperCase());
const statoPolizza = (cod) => {
  const s = String(cod || '').toUpperCase();
  if (s.includes('ANNULL')) return 'disdetta';
  if (s.includes('SOSP')) return 'sospesa';
  if (s.includes('SOSTIT')) return 'sostituita';
  if (s.includes('SCAD')) return 'scaduta';
  return 'attiva';
};

/** REC010 -> riga quote_anagrafiche (colonne reali + colonne SSF nuove) */
function mapAnagrafica(a) {
  const cf = (a.CODICE_FISCALE || '').trim();
  const piva = (a.PARTITA_IVA || '').trim();
  const tipo = (piva && cf.length !== 16) ? 'giuridica' : 'fisica';
  const nominativo = (a.RAGIONE_SOCIALE || '').trim();
  let cognome = null, nome = null;
  const lc = parseInt(a.LUNGHEZZA_COGNOME, 10);
  if (tipo === 'fisica' && Number.isInteger(lc) && lc > 0 && lc <= nominativo.length) {
    cognome = nominativo.slice(0, lc).trim();
    nome = nominativo.slice(lc).trim();
  }
  return {
    tipo, nominativo, cognome, nome,
    ragione_sociale: tipo === 'giuridica' ? nominativo : null,
    codice_fiscale: cf || null, partita_iva: piva || null,
    stato_civile: a.STATO_CIVILE_SHARE || null, data_nascita: toDate(a.DATA_NASCITA),
    indirizzo: a.INDIRIZZO || null, cap: a.CAP || null, comune: a.COMUNE || null,
    provincia: a.PROVINCIA || null, nazione: a.NAZIONE || 'Italia',
    telefono: a.NUMERO_TELEFONO || null, cellulare: a.CELLULARE || null, email: a.EMAIL || null,
    // colonne SSF nuove (ssf_schema_extensions.sql)
    ssf_id_anagrafica: a.ID_ANAGRAFICA_EXP || null,
    consenso_privacy: bool(a.CONSENSO_PRIVACY),
    consenso_commerciale: bool(a.CONSENSO_COMMERCIALE),
    consenso_comm_terzi: bool(a.CONSENSO_COMM_TERZI),
    consenso_profilazione: bool(a.CONSENSO_PROFILAZIONE),
  };
}

/** REC020 (+REC021) -> riga quote_polizze (colonne reali + colonne SSF nuove) */
function mapPolizza(p) {
  const v = p.veicolo || {};
  return {
    // colonne reali quote_polizze
    contraente: null, // risolto in upsert dal nominativo dell'anagrafica collegata
    compagnia: p.COMPAGNIA_EXP || null,
    ramo: p.RAMO_CMP || null,
    prodotto: p.PRODOTTO_CMP || null,
    numero_polizza: p.NUMERO_POLIZZA_CMP || null,
    targa: v.TARGA || null,
    decorrenza: toDate(p.EFFETTO),
    scadenza: toDate(p.SCADENZA_EFFETTIVA),
    frazionamento: (p.FRAZIONAMENTO_SHARE || '').toLowerCase() || null,
    premio: toNumber(p.LORDO_TOTALE),
    provvigione: null, // le provvigioni vivono a livello titolo (REC040)
    stato: statoPolizza(p.COD_STATO_SHARE),
    intermediario: p.COLLABORATORE_1 || null,
    // colonne SSF nuove (ssf_schema_extensions.sql)
    ssf_id_polizza: p.ID_POLIZZA_EXP || null,
    ssf_id_anagrafica: p.ID_ANAGRAFICA_EXP || null, // per collegare anagrafica_id in upsert
    compagnia_ania: p.COMPAGNIA_ANIA || null,
    agenzia: p.AGENZIA || null,
    tacito_rinnovo: bool(p.TACITO_RINNOVO_SHARE),
    data_emissione: toDate(p.DATA_EMISSIONE),
    telaio: v.TELAIO || null, marca: v.MARCA || null, modello: v.MODELLO || null,
    classe_merito: v.CLASSE_RCA_SHARE || null, bonus_malus: v.BONUS_MALUS_UNIVERSALE || null,
    uso: v.USO_RCA_SHARE || null,
  };
}

/** REC040 -> im_titoli ; REC042 -> im_incassi */
function mapTitolo(t) {
  return {
    ssf_id_titolo: t.ID_TITOLO_EXP || null, ssf_id_polizza: t.ID_POLIZZA_EXP || null,
    numero_polizza: t.NUMERO_POLIZZA_CMP || null, ramo: t.RAMO || null,
    tipo_titolo: t.TIPO_TITOLO_SHARE || null, stato: t.STATO_SHARE || null,
    effetto: toDate(t.EFFETTO_TITOLO), data_pagamento_cliente: toDate(t.DT_PAG_CLIENTE),
    data_competenza_contabile: toDate(t.DT_COMPETENZA_CONTABILE),
    lordo: toNumber(t.LORDO_TOTALE), provvigioni: toNumber(t.PROVVIGIONI_TOTALE),
    giorni_mora: t.GIORNI_MORA ? Number(t.GIORNI_MORA) : null, collaboratore: t.COLLABORATORE_1 || null,
  };
}
function mapIncasso(i, idTitolo) {
  return {
    ssf_id_incasso: i.ID_INCASSO_EXP || null, ssf_id_titolo: idTitolo || null,
    garanzia: i.DESCRIZIONE_GARANZIA_CMP || null,
    lordo: toNumber(i.LORDO), provvigioni: toNumber(i.PROVVIGIONI_TOTALI),
  };
}

function mapModel(model) {
  const quote_anagrafiche = model.anagrafiche.map(mapAnagrafica);
  const quote_polizze = [], im_titoli = [], im_incassi = [];
  for (const a of model.anagrafiche) {
    for (const p of a.polizze) {
      quote_polizze.push(mapPolizza(p));
      for (const t of p.titoli) {
        im_titoli.push(mapTitolo(t));
        for (const inc of t.incassi || []) im_incassi.push(mapIncasso(inc, t.ID_TITOLO_EXP));
      }
    }
  }
  return { quote_anagrafiche, quote_polizze, im_titoli, im_incassi };
}

module.exports = { mapModel, mapAnagrafica, mapPolizza, mapTitolo, mapIncasso, toNumber, toDate };
