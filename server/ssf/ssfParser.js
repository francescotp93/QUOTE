/**
 * Parser tracciato SHARE / SSF V12  —  adapter AssiEasy -> ecosistema Withus
 * -------------------------------------------------------------------------
 * Legge un flusso SSF (cartella di file REC0xx_*.csv, CSV ';'-separati UTF-8,
 * prima riga = header) e ricostruisce il portafoglio in forma relazionale.
 * ESM, nessuna dipendenza esterna. Mappatura per NOME campo (robusto a variazioni).
 * Riferimento schema: doc di progetto "assieasy-share-tracciato-ssf".
 */
import fs from 'node:fs';
import path from 'node:path';

export const RECORD_LABELS = {
  '000': 'testata', '010': 'anagrafica', '020': 'polizza', '021': 'veicolo',
  '030': 'garanzia', '040': 'titolo', '042': 'incasso', '100': 'prodotto', '101': 'collaboratore',
};

function parseCsvLine(line) {
  const out = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else { field += c; }
    } else if (c === '"') { inQuotes = true; }
    else if (c === ';') { out.push(field); field = ''; }
    else { field += c; }
  }
  out.push(field);
  return out;
}

export function readCsv(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (cells[idx] !== undefined ? cells[idx] : '').trim(); });
    rows.push(obj);
  }
  return { header, rows };
}

function recordTypeFromName(fileName) {
  const m = /^REC(\d{3})_/i.exec(path.basename(fileName));
  return m ? m[1] : null;
}

function groupBy(rows, key) {
  const out = {};
  for (const r of rows) { const k = r[key]; if (k === undefined) continue; (out[k] = out[k] || []).push(r); }
  return out;
}

export function parseSsfDirectory(dir) {
  const files = fs.readdirSync(dir).filter((f) => /^REC\d{3}_.*\.csv$/i.test(f));
  const byType = {};
  for (const f of files) {
    const t = recordTypeFromName(f);
    if (!t) continue;
    byType[t] = readCsv(path.join(dir, f));
  }
  const rowsOf = (t) => (byType[t] ? byType[t].rows : []);

  const testataRow = rowsOf('000')[0] || {};
  const meta = {
    emittente: testataRow.EMETTITORE || null,
    versioneTracciato: testataRow.VERSIONE_TRACCIATO || null,
    charset: testataRow.CHARSET || null,
    dataProduzione: testataRow.DATA_PRODUZIONE_FILE || null,
    periodoDal: testataRow.DAL || null,
    periodoAl: testataRow.AL || null,
    intermediario: testataRow.INTERMEDIARIO_EXP || null,
  };

  const prodotti = rowsOf('100');
  const collaboratori = rowsOf('101');

  const veicoliByPolizza = groupBy(rowsOf('021'), 'ID_POLIZZA_EXP');
  const garanzieByPolizza = groupBy(rowsOf('030'), 'ID_POLIZZA_EXP');
  const titoliByPolizza = groupBy(rowsOf('040'), 'ID_POLIZZA_EXP');
  const incassiByTitolo = groupBy(rowsOf('042'), 'ID_TITOLO_EXP');
  const polizzeByAnagrafica = groupBy(rowsOf('020'), 'ID_ANAGRAFICA_EXP');

  const anagrafiche = rowsOf('010').map((ana) => {
    const idAna = ana.ID_ANAGRAFICA_EXP;
    const polizze = (polizzeByAnagrafica[idAna] || []).map((pol) => {
      const idPol = pol.ID_POLIZZA_EXP;
      const titoli = (titoliByPolizza[idPol] || []).map((tit) => ({
        ...tit, incassi: incassiByTitolo[tit.ID_TITOLO_EXP] || [],
      }));
      return {
        ...pol,
        veicolo: (veicoliByPolizza[idPol] || [])[0] || null,
        garanzie: garanzieByPolizza[idPol] || [],
        titoli,
      };
    });
    return { ...ana, polizze };
  });

  const stats = {
    versione: meta.versioneTracciato, emittente: meta.emittente,
    periodo: `${meta.periodoDal} -> ${meta.periodoAl}`,
    conteggi: {
      anagrafiche: rowsOf('010').length, polizze: rowsOf('020').length,
      veicoli: rowsOf('021').length, garanzie: rowsOf('030').length,
      titoli: rowsOf('040').length, incassi: rowsOf('042').length,
      prodotti: prodotti.length, collaboratori: collaboratori.length,
    },
    recordTrovati: Object.keys(byType).sort().map((t) => `REC${t}(${RECORD_LABELS[t] || '?'})`),
  };

  return { meta, anagrafiche, lookup: { prodotti, collaboratori }, stats };
}

export function toQuotoView(model) {
  const clienti = model.anagrafiche.map((a) => ({
    idAnagrafica: a.ID_ANAGRAFICA_EXP, ragioneSociale: a.RAGIONE_SOCIALE,
    codiceFiscale: a.CODICE_FISCALE, partitaIva: a.PARTITA_IVA,
    comune: a.COMUNE, provincia: a.PROVINCIA, cap: a.CAP, email: a.EMAIL, cellulare: a.CELLULARE,
    consensoPrivacy: a.CONSENSO_PRIVACY, consensoCommerciale: a.CONSENSO_COMMERCIALE,
    consensoProfilazione: a.CONSENSO_PROFILAZIONE,
    polizze: a.polizze.map((p) => ({
      idPolizza: p.ID_POLIZZA_EXP, numero: p.NUMERO_POLIZZA_CMP, ramo: p.RAMO_CMP,
      prodotto: p.PRODOTTO_CMP, stato: p.COD_STATO_SHARE, effetto: p.EFFETTO,
      scadenza: p.SCADENZA_EFFETTIVA, frazionamento: p.FRAZIONAMENTO_SHARE,
      tacitoRinnovo: p.TACITO_RINNOVO_SHARE, premioLordo: p.LORDO_TOTALE,
      veicolo: p.veicolo && {
        targa: p.veicolo.TARGA, telaio: p.veicolo.TELAIO, marca: p.veicolo.MARCA,
        modello: p.veicolo.MODELLO, classeRca: p.veicolo.CLASSE_RCA_SHARE,
        bonusMalusUniversale: p.veicolo.BONUS_MALUS_UNIVERSALE,
      },
      garanzie: p.garanzie.map((g) => ({
        codice: g.COD_GARANZIA_CMP, descrizione: g.DESCRIZIONE_GARANZIA_CMP,
        lordo: g.LORDO, massimale: g.MASSIMO, franchigia: g.FRANCHIGIA,
      })),
    })),
  }));
  return { clienti, catalogoProdotti: model.lookup.prodotti };
}

export function toImView(model) {
  const titoli = [];
  for (const a of model.anagrafiche) {
    for (const p of a.polizze) {
      for (const t of p.titoli) {
        titoli.push({
          idTitolo: t.ID_TITOLO_EXP, numeroPolizza: t.NUMERO_POLIZZA_CMP, ramo: t.RAMO,
          tipoTitolo: t.TIPO_TITOLO_SHARE, stato: t.STATO_SHARE, effetto: t.EFFETTO_TITOLO,
          dataPagamentoCliente: t.DT_PAG_CLIENTE, dataCompetenzaContabile: t.DT_COMPETENZA_CONTABILE,
          lordo: t.LORDO_TOTALE, provvigioni: t.PROVVIGIONI_TOTALE, giorniMora: t.GIORNI_MORA,
          collaboratore: t.COLLABORATORE_1,
          dettaglioIncassi: (t.incassi || []).map((i) => ({
            idIncasso: i.ID_INCASSO_EXP, garanzia: i.DESCRIZIONE_GARANZIA_CMP,
            lordo: i.LORDO, provvigioni: i.PROVVIGIONI_TOTALI,
          })),
        });
      }
    }
  }
  return { titoli, collaboratori: model.lookup.collaboratori };
}
