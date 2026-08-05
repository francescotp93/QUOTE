// ═══════════════════════════════════════════════════════════════════════════════
//  ANALISI DEI BISOGNI — i due report
//
//  Due documenti diversi, e la differenza non e' grafica:
//
//    CLIENTE   spiega perche' un'area merita attenzione. Non nomina prodotti,
//              non fa prezzi, non propone niente.
//    AGENZIA   serve al colloquio: matrice operativa, evidenze, che cosa
//              MANCA ancora, e le domande da fare. Non si consegna al cliente.
//
//  ── Perche' HTML e non un PDF costruito qui ──────────────────────────────
//
//  La specifica suggeriva Playwright, dando per scontato che il motore ce
//  l'avesse. Non ce l'ha: sta nei dieci scraper, e in server/ non c'e' un solo
//  import di playwright. Aggiungerlo vorrebbe dire mettere un Chromium dentro
//  il processo che serve anche posta, firme e pagamenti — per stampare due
//  pagine.
//
//  Il sistema risolve gia' lo stesso problema in un altro modo, ed e'
//  collaudato: sign.js genera il MUP e la privacy firmata come HTML con
//  @media print, e chi li riceve li salva in PDF dal browser. Qui si fa
//  uguale.
//
//  Quello che la specifica chiede davvero — una fotografia immutabile, con la
//  sua impronta e le regole con cui e' nata — c'e' tutto: lo snapshot e'
//  congelato prima di disegnare, il documento e' archiviato, e l'impronta e'
//  lo sha256 dei byte archiviati. Se un domani servisse un PDF vero, si
//  cambia una funzione sola: generaDocumento().
//
//  ── Autosufficienti per forza ────────────────────────────────────────────
//
//  Niente caratteri, fogli di stile o immagini presi da fuori. Un documento
//  che va a chiedere un carattere a un altro sito racconta a quel sito quando
//  qualcuno apre l'analisi di un cliente — e fra tre anni, quando quel sito
//  non risponde piu', si stampa storto.
// ═══════════════════════════════════════════════════════════════════════════════
import { createHash } from 'node:crypto';
import { creaSnapshotRating, VERSIONE_REGOLE, VERSIONE_QUESTIONARIO } from './analisiBisogniRating.js';

export const VERSIONE_MOTORE_REPORT = 'REP-1.0.0';

const ETICHETTE_PRODOTTI = {
  casa: 'Polizza casa', salute: 'Polizza salute', infortuni: 'Polizza infortuni',
  tcm: 'TCM / protezione mutuo', previdenza: 'Previdenza integrativa',
  rcfam: 'RC famiglia', tutela: 'Tutela legale', professionale: 'Protezione professionale',
};
const ETICHETTE_INTERESSI = {
  famiglia: 'Protezione famiglia', casa: 'Casa e patrimonio', salute: 'Salute',
  infortuni: 'Infortuni', mutuo: 'Mutuo e debiti', risparmio: 'Risparmio',
  pensione: 'Pensione', impresa: 'Professione o impresa',
};
const ETICHETTE_FAMIGLIA = {
  solo: 'Vive da solo', coppia: 'In coppia', figli: 'Con figli', allargata: 'Famiglia allargata',
};
const ETICHETTE_CASA = {
  proprieta: 'Proprietà senza mutuo', mutuo: 'Proprietà con mutuo',
  affitto: 'In affitto', multi: 'Più immobili',
};
const ETICHETTE_REDDITO = {
  bassa: 'Dipendenza bassa', media: 'Dipendenza media',
  alta: 'Dipendenza alta', totale: 'Reddito determinante',
};

export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* Un identificativo leggibile che compare sul documento e nell'archivio: se
   qualcuno telefona con un foglio in mano, si ritrova la pratica da quello. */
export function idReport(data, seme) {
  const d = new Date(data);
  const g = d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  const coda = createHash('sha256').update(String(seme)).digest('hex').slice(0, 5).toUpperCase();
  return 'AB-' + g + '-' + coda;
}

/* Le informazioni che il cliente NON ha dato. Sono la parte piu' utile della
   scheda d'agenzia: un'analisi si commenta a partire da quello che manca, non
   da quello che c'e'. */
export function datiMancanti(risposte) {
  const r = risposte || {};
  const mancano = [];
  const a = r.anagrafica || {};
  if (!a.nascita) mancano.push('data di nascita');
  if (!a.telefono) mancano.push('recapito telefonico');
  if (r.casa === 'mutuo') mancano.push('debito residuo e durata del mutuo');
  if (['figli', 'allargata'].includes(r.famiglia)) mancano.push('numero ed età delle persone a carico');
  if (['alta', 'totale'].includes(r.dipendenzaReddito)) mancano.push('reddito netto familiare da proteggere');
  if (Array.isArray(r.patrimonio) && r.patrimonio.includes('impresa')) mancano.push('attività svolta e responsabilità professionali');
  if (Array.isArray(r.coperture) && r.coperture.length) mancano.push('fascicoli delle polizze dichiarate: massimali, franchigie ed esclusioni');
  if (!r.note) mancano.push('cambiamenti recenti o progetti dichiarati dal cliente');
  return mancano;
}

/* Fotografia immutabile. Si costruisce PRIMA di disegnare e si archivia
   insieme al documento: se fra due anni le regole cambiano, il report resta
   rileggibile per quello che era il giorno in cui e' stato firmato. */
export function costruisciSnapshot({ analisi, cliente, operatore, generatoIl }) {
  const quando = generatoIl ? new Date(generatoIl) : new Date();
  const risposte = analisi.risposte || {};
  /* Il rating si RICALCOLA, non si rilegge dalla pratica: il documento deve
     nascere dalle risposte, non da un numero che qualcuno potrebbe aver
     scritto lì in mezzo. */
  const rating = creaSnapshotRating(risposte, { dataRiferimento: quando });
  const a = risposte.anagrafica || {};
  const nome = [a.nome, a.cognome].filter(Boolean).join(' ').trim()
    || (cliente && cliente.nominativo) || 'Cliente';

  return {
    report_id: idReport(quando, analisi.id + '|' + quando.toISOString()),
    generato_il: quando.toISOString(),
    motore_versione: VERSIONE_MOTORE_REPORT,
    versione_regole: VERSIONE_REGOLE,
    versione_questionario: VERSIONE_QUESTIONARIO,
    versione_privacy: analisi.versione_privacy || null,
    analisi_id: analisi.id,
    modalita: analisi.modalita === 'agenzia' ? 'Compilazione assistita in agenzia' : 'Compilazione autonoma tramite link',
    stato: analisi.stato,
    firmata_il: analisi.firmata_il || null,
    operatore: operatore || null,
    cliente: {
      nome,
      nascita: a.nascita || '',
      email: a.email || '',
      telefono: a.telefono || '',
    },
    risposte,
    profilo: {
      nucleo: ETICHETTE_FAMIGLIA[risposte.famiglia] || 'Non dichiarato',
      abitazione: ETICHETTE_CASA[risposte.casa] || 'Non dichiarata',
      reddito: ETICHETTE_REDDITO[risposte.dipendenzaReddito] || 'Non dichiarata',
      coperture: (risposte.coperture || []).map(k => ETICHETTE_PRODOTTI[k] || k),
      interessi: (risposte.interessi || []).map(k => ETICHETTE_INTERESSI[k] || k),
      patrimonio: risposte.patrimonio || [],
      note: risposte.note || '',
      contatto: risposte.contatto || 'Non indicato',
    },
    rating,
    dati_mancanti: datiMancanti(risposte),
  };
}

// ── Veste grafica, la stessa dei due documenti ──────────────────────────────
const COLORI = {
  rosso:  { fg: '#a3352a', bg: '#fff5f3', bordo: '#efd0ca' },
  ambra:  { fg: '#b06a00', bg: '#fff4e6', bordo: '#f0dcc0' },
  blu:    { fg: '#356b8c', bg: '#eef7fb', bordo: '#d5e6ed' },
  verde:  { fg: '#016b38', bg: '#eaf7f0', bordo: '#cde8d8' },
  grigio: { fg: '#6b7684', bg: '#f0f3f5', bordo: '#dfe5e9' },
};

function stile(scuro) {
  return `
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:${scuro ? '#101820' : '#eceff4'};
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2a37;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .barra{max-width:820px;margin:14px auto 0;text-align:right;padding:0 10px}
  .barra button{background:#02984e;color:#fff;border:0;border-radius:9px;padding:10px 18px;font:inherit;font-weight:800;cursor:pointer}
  .foglio{max-width:820px;margin:16px auto;background:#fff;border-radius:8px;box-shadow:0 8px 34px rgba(0,0,0,.13);padding:34px 40px;page-break-after:always}
  .foglio:last-of-type{page-break-after:auto}
  .testa{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:2px solid #02984e;padding-bottom:14px;margin-bottom:22px}
  .marchio{display:flex;align-items:center;gap:11px}
  .mk{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#01c061,#02984e);color:#fff;
    display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}
  .marchio b{display:block;font-size:13px}
  .marchio span{display:block;font-size:9.5px;color:#5b6b7c;margin-top:2px}
  .rif{text-align:right;font-size:9.5px;color:#93a0ac;line-height:1.6}
  h1{font-size:24px;margin:0 0 8px;letter-spacing:-.02em}
  h2{font-size:15px;margin:26px 0 12px;color:#016b38;text-transform:uppercase;letter-spacing:.04em}
  h3{font-size:14px;margin:0 0 6px}
  p{margin:0 0 10px;font-size:12.5px;line-height:1.65;color:#3a4658}
  .occhiello{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#5b6b7c;margin-bottom:6px}
  table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px}
  th{background:#17232d;color:#fff;text-align:left;padding:9px 10px;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em}
  td{border:1px solid #dfe5e9;padding:9px 10px;vertical-align:top;line-height:1.55}
  tbody tr:nth-child(even){background:#f7f9fa}
  .eti{display:inline-block;padding:3px 9px;border-radius:999px;font-size:9.5px;font-weight:800;white-space:nowrap;border:1px solid transparent}
  .riq{border:1px solid #dfe5e9;border-radius:10px;padding:16px;margin:12px 0;background:#fff;page-break-inside:avoid}
  .griglia{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .fatto{border:1px solid #dfe5e9;border-radius:9px;padding:12px 14px;background:#f7f9fa}
  .fatto b{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#5b6b7c;margin-bottom:4px}
  .fatto span{font-size:12.5px;font-weight:700}
  ul{margin:8px 0 0;padding-left:18px;font-size:11.5px;line-height:1.7;color:#3a4658}
  li{margin-bottom:3px}
  .barra-p{height:6px;border-radius:999px;background:#e9edef;overflow:hidden;margin-top:6px}
  .barra-p i{display:block;height:100%;border-radius:inherit}
  .pie{margin-top:26px;padding-top:12px;border-top:1px solid #dfe5e9;font-size:9.5px;color:#93a0ac;line-height:1.7}
  .avviso{border-left:3px solid #b06a00;background:#fff4e6;border-radius:6px;padding:12px 14px;font-size:11.5px;line-height:1.65;color:#7a4a00;margin:12px 0}
  .riservato{background:#17232d;color:#fff;border-radius:9px;padding:13px 16px;font-size:11px;line-height:1.6;margin-bottom:20px}
  .riservato b{color:#8fe3b4}
  @media print{
    html,body{background:#fff}
    .barra{display:none}
    .foglio{box-shadow:none;margin:0;max-width:none;border-radius:0;padding:14mm 15mm}
    @page{size:A4;margin:0}
  }`;
}

function intestazione(snap, titolo) {
  return `<div class="testa">
    <div class="marchio"><div class="mk">WU</div>
      <div><b>With Us Assicurazioni</b><span>Intermediario assicurativo · RUI A000747484</span></div></div>
    <div class="rif">${esc(titolo)}<br>Report <b>${esc(snap.report_id)}</b><br>${new Date(snap.generato_il).toLocaleString('it-IT')}</div>
  </div>`;
}

function pie(snap, interno) {
  return `<div class="pie">
    Documento generato dal sistema IAM · ${esc(snap.report_id)} ·
    regole ${esc(snap.versione_regole)} · questionario ${esc(snap.versione_questionario)}${snap.versione_privacy ? ' · informativa ' + esc(snap.versione_privacy) : ''}<br>
    ${interno
      ? 'USO INTERNO. Non consegnare al cliente: contiene valutazioni operative e dati non ancora verificati.'
      : 'Questo documento è una fotografia iniziale delle aree da approfondire. Non è un preventivo, non è una raccomandazione personalizzata e non sostituisce il colloquio con il consulente e la documentazione contrattuale.'}
  </div>`;
}

function etichetta(n) {
  const c = COLORI[n.colore] || COLORI.grigio;
  return `<span class="eti" style="background:${c.bg};color:${c.fg};border-color:${c.bordo}">${esc(n.stato)}</span>`;
}

const BARRA_STAMPA = `<div class="barra"><button type="button" onclick="window.print()">Salva come PDF o stampa</button></div>`;

// ═══════════════════════════════════════════════════════════════════════════
//  REPORT CLIENTE
// ═══════════════════════════════════════════════════════════════════════════
export function reportCliente(snap) {
  const n = snap.rating.necessita || [];
  const principale = n.find(x => ['rosso', 'ambra', 'blu'].includes(x.colore)) || null;
  const indice = snap.rating.indiceComplessivo;

  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Analisi dei bisogni — ${esc(snap.cliente.nome)}</title><style>${stile(false)}</style></head><body>
${BARRA_STAMPA}

<div class="foglio">
  ${intestazione(snap, 'Analisi dei bisogni')}
  <div class="occhiello">Report consulenziale</div>
  <h1>${esc(snap.cliente.nome)}</h1>
  <p>Questo documento raccoglie quello che ci siamo detti e indica <b>quali aree meritano un confronto</b>, spiegando
  il perché di ognuna. Non contiene prezzi e non propone prodotti: serve a preparare la conversazione con il tuo consulente.</p>

  <div class="griglia" style="margin-top:18px">
    <div class="fatto"><b>Data</b><span>${new Date(snap.generato_il).toLocaleDateString('it-IT')}</span></div>
    <div class="fatto"><b>Come è stata compilata</b><span>${esc(snap.modalita)}</span></div>
  </div>

  ${principale ? `
  <h2>Da dove conviene partire</h2>
  <div class="riq" style="border-color:${COLORI[principale.colore].bordo};background:${COLORI[principale.colore].bg}">
    ${etichetta(principale)}
    <h3 style="margin-top:9px;font-size:17px">${esc(principale.etichetta)}</h3>
    <p style="margin-bottom:0">${esc(principale.prossimoPasso)}</p>
  </div>
  <h3 style="margin-top:16px">Perché emerge questa area</h3>
  <ul>${principale.motivi.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`
  : `<div class="avviso"><b>Nessuna area emerge sulle altre.</b> Con le informazioni raccolte non c'è un tema che
     meriti di essere messo davanti agli altri: ne parliamo insieme al prossimo incontro.</div>`}

  ${indice != null ? `<p style="margin-top:18px;color:#5b6b7c;font-size:11.5px">
    Indice complessivo delle necessità: <b style="color:#016b38;font-size:15px">${indice}</b> su 100.
    È una sintesi delle tre aree più rilevanti, non un voto.</p>` : ''}
  ${pie(snap, false)}
</div>

<div class="foglio">
  ${intestazione(snap, 'Il quadro completo')}
  <h1 style="font-size:20px">Tutte le aree, una per una</h1>
  <p>Ogni area ha un suo stato. <b>«Da verificare»</b> non vuol dire che sei coperto: vuol dire che una polizza c'è,
  ma il suo contenuto — massimali, esclusioni, franchigie — non l'abbiamo ancora letto insieme.</p>

  ${n.map(a => `
  <div class="riq">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h3>${esc(a.etichetta)}</h3>${etichetta(a)}
    </div>
    ${a.colore !== 'grigio' ? `<div class="barra-p"><i style="width:${a.punteggio}%;background:${COLORI[a.colore].fg}"></i></div>` : ''}
    <p style="margin:10px 0 0">${esc(a.prossimoPasso)}</p>
    <ul>${a.motivi.slice(0, 3).map(m => `<li>${esc(m)}</li>`).join('')}</ul>
  </div>`).join('')}

  ${snap.profilo.coperture.length ? `
  <h2>Quello che hai già dichiarato</h2>
  <p>${snap.profilo.coperture.map(esc).join(' · ')}</p>` : ''}

  <h2>I prossimi passi</h2>
  <ul>
    <li>Il tuo consulente riceve questa analisi e ti contatta per commentarla.</li>
    <li>Porta con te i contratti delle polizze che hai già: serve leggerne il contenuto, non l'esistenza.</li>
    <li>Nessuna proposta viene fatta prima di questo confronto.</li>
  </ul>
  ${snap.firmata_il ? `<p style="margin-top:16px;font-size:11px;color:#5b6b7c">
    Consenso privacy firmato elettronicamente il ${new Date(snap.firmata_il).toLocaleString('it-IT')}${snap.versione_privacy ? ' (informativa ' + esc(snap.versione_privacy) + ')' : ''}.</p>` : ''}
  ${pie(snap, false)}
</div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCHEDA INTERNA D'AGENZIA
// ═══════════════════════════════════════════════════════════════════════════
export function reportAgenzia(snap) {
  const n = snap.rating.necessita || [];
  const principale = n.find(x => ['rosso', 'ambra', 'blu'].includes(x.colore)) || null;

  /* Le domande del colloquio non sono un elenco fisso: si accendono in base a
     quello che il cliente ha detto. Una traccia uguale per tutti e' una
     traccia che non si usa. */
  const domande = [];
  if (snap.risposte.casa === 'mutuo') {
    domande.push(['Il mutuo', 'rosso', [
      'Quanto resta da rimborsare e per quanti anni?',
      'Chi resterebbe a pagarlo, e con quale reddito?',
      'La banca ha imposto una copertura? Con quali massimali e beneficiari?',
    ]]);
  }
  if (['alta', 'totale'].includes(snap.risposte.dipendenzaReddito)) {
    domande.push(['Il reddito da proteggere', 'rosso', [
      'Quale reddito netto mensile deve essere garantito alla famiglia?',
      'Esistono altri redditi o risparmi immediatamente disponibili?',
      'Ci sono coperture del datore di lavoro o welfare aziendale?',
    ]]);
  }
  if ((snap.risposte.coperture || []).length) {
    domande.push(['Le polizze già presenti', 'blu', [
      'Acquisire i fascicoli: massimali, franchigie, esclusioni, adeguamento dei valori.',
      'Da quanto sono in essere e chi le ha collocate?',
      'Evitare duplicazioni prima di valutare qualsiasi soluzione nuova.',
    ]]);
  }
  domande.push(['Come condurre il colloquio', 'ambra', [
    'Prima il rischio e l\'obiettivo, poi — se serve — il prodotto.',
    'Spiegare perché una soluzione è coerente con i dati raccolti.',
    'Documentare alternative, limiti e motivi della scelta.',
  ]]);

  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scheda interna — ${esc(snap.cliente.nome)}</title><style>${stile(false)}</style></head><body>
${BARRA_STAMPA}

<div class="foglio">
  ${intestazione(snap, 'Scheda interna di analisi')}
  <div class="riservato"><b>USO INTERNO.</b> Non consegnare al cliente. Contiene valutazioni operative,
  dati non ancora verificati e la traccia del colloquio.</div>

  <div class="occhiello">Scheda interna · uso consulenziale</div>
  <h1>${esc(snap.cliente.nome)}</h1>
  <p>${esc(snap.modalita)}${snap.operatore ? ' · operatore: ' + esc(snap.operatore) : ''}
  ${snap.firmata_il ? ' · firmata il ' + new Date(snap.firmata_il).toLocaleString('it-IT') : ' · <b>non ancora firmata</b>'}</p>

  <div class="griglia" style="margin-top:16px">
    <div class="fatto"><b>Nucleo</b><span>${esc(snap.profilo.nucleo)}</span></div>
    <div class="fatto"><b>Abitazione</b><span>${esc(snap.profilo.abitazione)}</span></div>
    <div class="fatto"><b>Reddito</b><span>${esc(snap.profilo.reddito)}</span></div>
    <div class="fatto"><b>Coperture dichiarate</b><span>${snap.profilo.coperture.length ? esc(snap.profilo.coperture.join(', ')) : 'Nessuna'}</span></div>
  </div>

  ${principale ? `
  <h2>Priorità principale</h2>
  <div class="riq" style="border-color:${COLORI[principale.colore].bordo};background:${COLORI[principale.colore].bg}">
    ${etichetta(principale)}
    <h3 style="margin-top:9px;font-size:16px">${esc(principale.etichetta)}</h3>
    <p style="margin-bottom:0">${esc(principale.prossimoPasso)}</p>
  </div>` : `<div class="avviso">Nessuna area in priorità: le risposte non bastano, oppure non è emerso nulla di rilevante.
    Il colloquio serve a completare il quadro, non a proporre.</div>`}

  <h2>Matrice operativa</h2>
  <table>
    <thead><tr><th>Area</th><th>Indice</th><th>Stato</th><th>Evidenze</th><th>Prossima azione</th></tr></thead>
    <tbody>${n.map(a => `<tr>
      <td><b>${esc(a.etichetta)}</b></td>
      <td style="text-align:center"><b>${a.colore === 'grigio' ? '—' : a.punteggio}</b></td>
      <td>${etichetta(a)}</td>
      <td>${a.motivi.slice(0, 2).map(esc).join('<br>')}</td>
      <td>${esc(a.prossimoPasso)}</td>
    </tr>`).join('')}</tbody>
  </table>
  ${pie(snap, true)}
</div>

<div class="foglio">
  ${intestazione(snap, 'Traccia per il colloquio')}
  <h1 style="font-size:20px">Che cosa chiedere, e che cosa manca</h1>

  <h2>Dati ancora mancanti</h2>
  ${snap.dati_mancanti.length
    ? `<div class="avviso"><b>Da raccogliere prima di qualsiasi valutazione.</b><ul style="margin-top:8px">${
        snap.dati_mancanti.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>`
    : `<p>Nessun dato essenziale risulta mancante fra quelli previsti dal questionario.</p>`}

  <h2>Domande da fare</h2>
  ${domande.map(([titolo, colore, voci]) => `
  <div class="riq" style="border-left:3px solid ${COLORI[colore].fg}">
    <h3>${esc(titolo)}</h3>
    <ul>${voci.map(v => `<li>${esc(v)}</li>`).join('')}</ul>
  </div>`).join('')}

  ${snap.profilo.note ? `<h2>Parole del cliente</h2>
  <div class="riq"><p style="margin:0;font-style:italic">«${esc(snap.profilo.note)}»</p></div>` : ''}

  ${snap.profilo.interessi.length ? `<h2>Aree indicate dal cliente</h2>
  <p>${snap.profilo.interessi.map(esc).join(' · ')}</p>` : ''}

  <h2>Tracciabilità</h2>
  <table>
    <tbody>
      <tr><td style="width:38%;background:#f7f9fa"><b>Canale di ricontatto preferito</b></td><td>${esc(snap.profilo.contatto)}</td></tr>
      <tr><td style="background:#f7f9fa"><b>Consenso privacy</b></td><td>${snap.firmata_il
        ? 'Firmato con OTP il ' + new Date(snap.firmata_il).toLocaleString('it-IT') : 'NON ancora firmato'}</td></tr>
      <tr><td style="background:#f7f9fa"><b>Versione informativa</b></td><td>${esc(snap.versione_privacy || 'non registrata')}</td></tr>
      <tr><td style="background:#f7f9fa"><b>Versione regole del rating</b></td><td>${esc(snap.versione_regole)}</td></tr>
      <tr><td style="background:#f7f9fa"><b>Identificativo report</b></td><td>${esc(snap.report_id)}</td></tr>
    </tbody>
  </table>
  ${pie(snap, true)}
</div>
</body></html>`;
}

/* Il punto unico in cui nasce un documento. Se un domani servisse un PDF vero
   — Playwright, page.pdf() — si cambia QUI e nient'altro: chi chiama riceve
   comunque contenuto, impronta e tipo. */
export function generaDocumento(snap, tipo) {
  if (!['cliente', 'agenzia'].includes(tipo)) throw new TypeError('Tipo report non valido: ' + tipo);
  const html = tipo === 'cliente' ? reportCliente(snap) : reportAgenzia(snap);
  return {
    tipo,
    contenuto: Buffer.from(html, 'utf8'),
    contentType: 'text/html; charset=utf-8',
    estensione: 'html',
    sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
    nomeFile: (tipo === 'cliente' ? 'Analisi-bisogni-' : 'Scheda-interna-')
      + String(snap.cliente.nome).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + snap.report_id + '.html',
  };
}
