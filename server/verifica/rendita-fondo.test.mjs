// ═══════════════════════════════════════════════════════════════════════════
//  LA RENDITA DEL FONDO — F-11
//
//  Tre errori sovrapposti, tutti nella stessa direzione: la rendita usciva più
//  alta del vero.
//
//   1. Si convertiva il capitale col COEFFICIENTE INPS (5,608%). Quello di
//      legge converte il montante pubblico; la rendita di un fondo si converte
//      con il coefficiente della convenzione assicurativa, che per un
//      sessantasettenne sta fra il 4,2 e il 4,6%.
//   2. Si divideva per TREDICI. La tredicesima è della pensione pubblica: la
//      rendita di un fondo si eroga in dodici rate.
//   3. Il capitale cresceva al rendimento LORDO: niente costi del comparto e
//      niente imposta sui rendimenti, per trent'anni. Sullo stesso comparto il
//      confronto TFR l'imposta la applicava — due calcoli dello stesso foglio
//      che dicevano cose diverse.
//
//  Ogni prova qui dentro ha il caso che la fa diventare rossa se uno dei tre
//  torna indietro.
// ═══════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../../tariffe/motore/previdenza.js');

const esiti = [];
const prova = (nome, fn) => { try { esiti.push([true, nome, fn() || '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };
const vicino = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 1e-9 : eps);

const caso = (extra) => P.prospettivaPensionistica(Object.assign(
  { eta: 33, etaPensionamento: 67, redditoAnnuo: 24000, anniContributiGia: 9,
    annoRiferimento: 2026, gestione: 'dipendenti_privati' }, extra || {}));

/* ── IL COEFFICIENTE ─────────────────────────────────────────────────────── */

prova('la rendita si converte col coefficiente del fondo, non con quello di legge', () => {
  const p = caso();
  const s = P.simulaIntegrativa(p, 200);
  const ip = P.ipotesiAttive();
  deve(vicino(s.coefficienteRendita, ip.coeffRenditaFondo.v), 'non usa il coefficiente della convenzione');
  deve(vicino(s.renditaAnnua, s.capitale * ip.coeffRenditaFondo.v), 'la rendita non è capitale per quel coefficiente');
  /* IL CASO CHE DEVE FALLIRE: se tornasse quello INPS, la rendita salirebbe di
     circa un quarto e questa disuguaglianza salterebbe. */
  deve(s.renditaAnnua < s.capitale * p.coefficienti.oggi * 0.95,
    'la rendita è ancora al livello del coefficiente INPS');
  return (ip.coeffRenditaFondo.v * 100).toFixed(2) + '% contro il ' + (p.coefficienti.oggi * 100).toFixed(3) + '% di legge';
});

prova('il coefficiente del fondo è marcato finché non arriva la Nota informativa', () => {
  /* È un valore provvisorio scritto in un documento che si firma: l'avviso
     deve arrivare fino al foglio del cliente, non fermarsi nel codice. */
  const p = caso();
  const vl = P.valutaSoluzione(p, 200);
  const chiavi = vl.daConfermare.map(x => x.chiave);
  deve(chiavi.includes('coeffRenditaFondo'), 'il coefficiente provvisorio non risulta da confermare');
  deve(chiavi.includes('iscComparto'), 'i costi provvisori non risultano da confermare');
  const h = P.reportPrevidenza({ prospettiva: p, valutazione: vl, cliente: { nome: 'Prova' },
    consulente: { nome: 'F. Oddo' }, dataRiferimento: '5 settembre 2026' }).html;
  deve(/Coefficiente di conversione in rendita del fondo/.test(h), 'il coefficiente del fondo non è sul foglio');
  return chiavi.length + ' valori marcati';
});

/* ── LE DODICI RATE ──────────────────────────────────────────────────────── */

prova('la rendita si eroga in dodici rate, e il foglio dice che non si somma alla pensione', () => {
  const p = caso();
  const s = P.simulaIntegrativa(p, 200);
  deve(vicino(s.renditaMensile, s.renditaAnnua / 12), 'la rendita del fondo non è divisa per dodici');
  /* IL CASO CHE DEVE FALLIRE: uniformare le due misure. */
  deve(!vicino(s.renditaMensile, s.renditaAnnua / 13), 'la rendita è tornata su tredici rate');
  deve(vicino(p.pensioneMensile, p.pensioneAnnua / 13), 'la pensione pubblica non è più su tredici');
  const h = P.reportPrevidenza({ prospettiva: p, valutazione: P.valutaSoluzione(p, 200),
    cliente: { nome: 'Prova' }, consulente: { nome: 'F. Oddo' }, dataRiferimento: '5 settembre 2026' }).html;
  deve(/tredici<\/b> mensilità/.test(h) && /dodici<\/b>/.test(h),
    'il foglio non dichiara che le due mensili non sono la stessa unità di misura');
  deve(/non si sommano/.test(h), 'il foglio non avverte che i due importi al mese non si sommano');
  return 'fondo /12, pensione /13, detto sul foglio';
});

/* ── I COSTI ─────────────────────────────────────────────────────────────── */

prova('i costi dipendono dal tipo di prodotto, e il negoziale è il default di chi versa dal datore', () => {
  deve(P.ISC_TIPO.negoziale < P.ISC_TIPO.aperto && P.ISC_TIPO.aperto < P.ISC_TIPO.pip,
    'l\'ordine dei costi fra i tre prodotti non regge');
  deve(P.tipoProdottoDi({ canale: 'datore' }) === 'negoziale',
    'chi versa tramite il datore non ha il negoziale come predefinito');
  deve(P.tipoProdottoDi({ canale: 'diretto' }) === 'aperto', 'chi versa da solo non ha il fondo aperto');
  deve(P.tipoProdottoDi({ canale: 'datore', tipoProdotto: 'pip' }) === 'pip',
    'la scelta esplicita non vince sul canale');
  /* IL CASO CHE DEVE FALLIRE: se i costi smettessero di entrare nel calcolo,
     i tre prodotti darebbero lo stesso capitale. */
  const cap = (t) => P.simulaIntegrativa(caso({ tipoProdotto: t }), 200).capitale;
  deve(cap('negoziale') > cap('aperto') && cap('aperto') > cap('pip'),
    'il tipo di prodotto non cambia il capitale finale: i costi non stanno entrando nel conto');
  return 'negoziale ' + Math.round(cap('negoziale')) + ' €, aperto ' + Math.round(cap('aperto')) +
         ' €, PIP ' + Math.round(cap('pip')) + ' €';
});

prova('la correzione a mano dei costi vince sul tipo di prodotto', () => {
  /* Quando il consulente ha la Nota informativa davanti, quello che scrive lui
     vale più di qualunque valore di listino. */
  const s = P.simulaIntegrativa(caso({ tipoProdotto: 'pip' }), 200, { iscComparto: 0.004 });
  deve(vicino(s.isc, 0.004), 'la correzione a mano non è stata usata: ' + s.isc);
  const senza = P.simulaIntegrativa(caso({ tipoProdotto: 'pip' }), 200);
  deve(s.capitale > senza.capitale, 'correggere i costi non cambia il capitale');
});

prova('prima i costi, poi l\'imposta, e su una perdita non si paga imposta', () => {
  /* L'ordine indicato da Francesco: lordo meno ISC, poi il 20% sul risultato
     positivo. Invertirlo regalerebbe al cliente un pezzo di rendimento. */
  deve(vicino(P.rendimentoNettoFondo(0.035, 0.015, 0.20), (0.035 - 0.015) * 0.8),
    'l\'ordine fra costi e imposta non è quello');
  deve(!vicino(P.rendimentoNettoFondo(0.035, 0.015, 0.20), 0.035 * 0.8 - 0.015),
    'l\'imposta viene applicata prima dei costi');
  /* IL CASO CHE DEVE FALLIRE: un'imposta calcolata su un risultato negativo
     diventerebbe un credito che non esiste, e migliorerebbe l'anno peggiore. */
  deve(vicino(P.rendimentoNettoFondo(0.01, 0.02, 0.20), -0.01),
    'su un rendimento negativo dopo i costi si sta applicando l\'imposta');
  return '3,50% − 1,50% = 2,00%, meno il 20% → 1,60%';
});

prova('lo stesso comparto costa lo stesso nei due calcoli del foglio', () => {
  /* Il confronto TFR e la simulazione del fondo parlano dello stesso prodotto:
     se uno dei due ignorasse i costi, il TFR nel fondo sembrerebbe rendere più
     di quanto il fondo stesso, due righe sopra, dichiara.
     IL CASO CHE DEVE FALLIRE: togliere l'ISC dal ramo fondo del confronto. */
  const conf = (t) => P.confrontoTfr({ redditoAnnuo: 30000, anni: 25, anniAdesione: 25, annoInizio: 2026, tipoProdotto: t });
  const neg = conf('negoziale'), pip = conf('pip');
  deve(neg.fondo.montanteLordo > pip.fondo.montanteLordo,
    'nel confronto TFR il tipo di prodotto non cambia niente: i costi non entrano');
  deve(pip.fondo.costi > neg.fondo.costi && neg.fondo.costi > 0, 'i costi pagati non vengono contati');
  deve(vicino(pip.fondo.isc, P.ISC_TIPO.pip), 'il confronto usa un ISC diverso da quello del prodotto');
  /* E lo stesso ISC che usa la simulazione. */
  deve(vicino(P.simulaIntegrativa(caso({ tipoProdotto: 'pip' }), 200).isc, pip.fondo.isc),
    'i due calcoli usano costi diversi sullo stesso prodotto');
  return 'negoziale ' + Math.round(neg.fondo.montanteLordo) + ' € contro PIP ' + Math.round(pip.fondo.montanteLordo) + ' €';
});

/* ── LA TABELLA ──────────────────────────────────────────────────────────── */

prova('i valori della tabella sostituiscono la copia di riserva ma restano marcati', () => {
  /* Una riga può stare in tabella con la sua fonte ED essere provvisoria: la
     fonte dice «in attesa della Nota informativa». Spegnere la bandiera perché
     il valore arriva dall'archivio farebbe sparire l'unico avviso che arriva
     fino al cliente.
     IL CASO CHE DEVE FALLIRE: rimettere `daConfermare = false` per tutto ciò
     che arriva dalla tabella. */
  const prima = P.ISC_TIPO.pip;
  const esito = P.numeriDiLegge({
    tipo_prodotto: { negoziale: 0.0035, aperto: 0.0142, pip: 0.0231 },
    coefficiente_rendita_fondo: 0.0451,
    __fonti: { tipo_prodotto: 'COVIP', coefficiente_rendita_fondo: 'Nota informativa' },
    __daConfermare: { tipo_prodotto: true, coefficiente_rendita_fondo: true },
  });
  deve(esito.applicati.includes('coeffRenditaFondo'), 'il coefficiente dalla tabella non è stato applicato');
  deve(vicino(P.ipotesiAttive().coeffRenditaFondo.v, 0.0451), 'il coefficiente non è quello della tabella');
  deve(vicino(P.ISC_TIPO.pip, 0.0231), 'i costi del PIP non sono quelli della tabella');
  const marcati = P.numeriDaConfermare(P.ipotesiAttive()).map(x => x.chiave);
  deve(marcati.includes('coeffRenditaFondo'), 'il coefficiente ha perso la marcatura arrivando dalla tabella');
  deve(marcati.includes('iscComparto'), 'i costi hanno perso la marcatura arrivando dalla tabella');
  /* E un valore NON marcato la bandiera la perde, come è giusto. */
  P.numeriDiLegge({ tetto_deducibilita: 5164.57, __fonti: {}, __daConfermare: {} });
  P.ISC_TIPO.pip = prima;
  return 'coefficiente 4,51%, PIP 2,31%, entrambi ancora marcati';
});

/* ── esecuzione ──────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Rendita del fondo: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
