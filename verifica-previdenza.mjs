/* Verifica del motore Previdenza — si esegue con: node verifica-previdenza.mjs
   Nessuna dipendenza esterna. Ogni prova stampa PASS/FAIL e il numero ottenuto. */

import { readFileSync } from 'fs';

// Il motore si registra su globalThis (vale sia in Node sia nel browser).
await import('./previdenza-engine.js');
const PREV = globalThis.PREV;

const P = JSON.parse(readFileSync(new URL('./tariffe/previdenza-parametri.json', import.meta.url)));
const CATALOGO = JSON.parse(readFileSync(new URL('./tariffe/previdenza-fondi.json', import.meta.url)));

let ok = 0, ko = 0;
const eur = n => PREV.fmtEuro(n, 2);

function prova(nome, condizione, dettaglio) {
  if (condizione) { ok++; console.log(`  PASS  ${nome}${dettaglio ? '  → ' + dettaglio : ''}`); }
  else { ko++; console.log(`  FAIL  ${nome}${dettaglio ? '  → ' + dettaglio : ''}`); }
}
function vicino(a, b, tolleranza = 0.02) { return Math.abs(a - b) <= tolleranza; }
function titolo(t) { console.log('\n' + t); console.log('─'.repeat(t.length)); }

/* ── IRPEF ───────────────────────────────────────────────────────────── */
titolo('IRPEF');
{
  const i28 = PREV.irpefLorda(28000, P);
  prova('Scaglione 1 pieno: 28.000 × 23%', vicino(i28, 6440), eur(i28));

  const i50 = PREV.irpefLorda(50000, P);
  const atteso50 = 28000 * 0.23 + 22000 * 0.35;
  prova('Scaglione 2 pieno: 50.000', vicino(i50, atteso50), eur(i50));

  prova('Marginale a 25.000 = 23%', PREV.aliquotaMarginale(25000, P) === 0.23);
  prova('Marginale a 60.000 = 43%', PREV.aliquotaMarginale(60000, P) === 0.43);
  prova('Reddito 0 non genera imposta', PREV.irpefLorda(0, P) === 0);
  prova('Reddito negativo non genera imposta', PREV.irpefLorda(-5000, P) === 0);
}

/* ── TFR · regole di base ────────────────────────────────────────────── */
titolo('TFR — quota annua e rivalutazione');
{
  const ral = 30000;
  const inAzienda = PREV.quotaTfrAnnua(ral, P, 'azienda');
  const inFondo = PREV.quotaTfrAnnua(ral, P, 'fondo');
  prova('Quota in fondo = RAL / 13,5', vicino(inFondo, 30000 / 13.5), eur(inFondo));
  prova('Quota in azienda sconta il Fondo garanzia 0,50%', vicino(inAzienda, 30000 / 13.5 - 150), eur(inAzienda));
  prova('In fondo si versa di più che in azienda', inFondo > inAzienda, `differenza ${eur(inFondo - inAzienda)}`);

  const t = PREV.tassoRivalutazioneTfr(0.02, P);
  prova('Rivalutazione con FOI 2% = 1,5% + 75%×2% = 3,0%', vicino(t, 0.03, 0.0001), (t * 100).toFixed(2) + '%');
}

/* ── TFR in azienda · proiezione ─────────────────────────────────────── */
titolo('TFR in azienda — proiezione 20 anni');
{
  const pr = PREV.proiezioneTfrAzienda({ ral: 30000, anni: 20, crescitaRal: 0.01, foi: 0.02 }, P);
  prova('Sono state prodotte 20 righe', pr.righe.length === 20);
  prova('Il montante cresce ogni anno', pr.righe.every((r, i) => i === 0 || r.montante > pr.righe[i - 1].montante));
  prova('Montante > somma delle quote (c\'è rivalutazione)', pr.montanteLordo > pr.totaleQuote,
    `${eur(pr.montanteLordo)} vs ${eur(pr.totaleQuote)}`);

  // L'imposta sostitutiva deve essere esattamente il 17% della rivalutazione.
  prova('Imposta sostitutiva = 17% della rivalutazione',
    vicino(pr.totaleImposteRivalutazione, pr.totaleRivalutazione * 0.17, 0.5),
    eur(pr.totaleImposteRivalutazione));

  const tass = PREV.tassazioneTfrAzienda(pr, 20, P);
  prova('Aliquota di tassazione separata >= 23%', tass.aliquota >= 0.23, (tass.aliquota * 100).toFixed(2) + '%');
  prova('Netto < lordo', tass.netto < pr.montanteLordo, `${eur(tass.netto)} netto su ${eur(pr.montanteLordo)}`);

  const zero = PREV.proiezioneTfrAzienda({ ral: 30000, anni: 0, foi: 0.02 }, P);
  prova('Zero anni → montante zero, nessun errore', zero.montanteLordo === 0);
}

/* ── Fondo pensione · fiscalità ──────────────────────────────────────── */
titolo('Fondo pensione — fiscalità della prestazione');
{
  prova('A 15 anni l\'aliquota è ancora 15%', vicino(PREV.aliquotaPrestazioneFondo(15, P), 0.15, 0.0001));
  prova('A 20 anni scende a 13,5%', vicino(PREV.aliquotaPrestazioneFondo(20, P), 0.135, 0.0001),
    (PREV.aliquotaPrestazioneFondo(20, P) * 100).toFixed(2) + '%');
  prova('A 35 anni tocca il pavimento del 9%', vicino(PREV.aliquotaPrestazioneFondo(35, P), 0.09, 0.0001));
  prova('A 50 anni non scende sotto il 9%', PREV.aliquotaPrestazioneFondo(50, P) === 0.09);
  prova('A 5 anni resta al 15%', vicino(PREV.aliquotaPrestazioneFondo(5, P), 0.15, 0.0001));

  const bil = CATALOGO.profili_generici.find(l => l.id === 'bilanciata');
  const aliqR = PREV.aliquotaRendimentiFondo(bil.quota_titoli_stato, P);
  const atteso = 0.40 * 0.125 + 0.60 * 0.20;
  prova('Tassazione rendimenti mista titoli di Stato / resto', vicino(aliqR, atteso, 0.0001),
    (aliqR * 100).toFixed(2) + '%');
}

/* ── Deducibilità ────────────────────────────────────────────────────── */
titolo('Deducibilità del versamento volontario');
{
  const r = PREV.risparmioFiscaleAnnuo(40000, 3000, P);
  prova('Versamento sotto il tetto è dedotto per intero', vicino(r.dedotto, 3000), eur(r.dedotto));
  prova('Risparmio = 3.000 × 35%', vicino(r.risparmio, 1050, 0.5), eur(r.risparmio));
  prova('Costo reale = versamento − risparmio', vicino(r.costoReale, 3000 - r.risparmio), eur(r.costoReale));

  const sopra = PREV.risparmioFiscaleAnnuo(40000, 8000, P);
  prova('Oltre il tetto si deduce solo 5.164,57', vicino(sopra.dedotto, 5164.57), eur(sopra.dedotto));
  prova('L\'eccedenza è segnalata', sopra.eccedenzaNonDeducibile > 0, eur(sopra.eccedenzaNonDeducibile));

  // Versamento che fa scendere di scaglione: il risparmio non è lineare.
  const salto = PREV.risparmioFiscaleAnnuo(29000, 3000, P);
  const lineare = 3000 * 0.35;
  prova('A cavallo di scaglione il risparmio è < del calcolo lineare',
    salto.risparmio < lineare, `${eur(salto.risparmio)} invece di ${eur(lineare)}`);
}

/* ── Confronto TFR azienda vs fondo ──────────────────────────────────── */
titolo('Confronto TFR — azienda vs fondo pensione');
{
  const bil = CATALOGO.profili_generici.find(l => l.id === 'bilanciata');
  const c = PREV.confrontoTfr({ ral: 30000, anni: 30, crescitaRal: 0.01, foi: 0.02, linea: bil }, P);

  console.log(`        azienda netto: ${eur(c.azienda.netto)}   fondo netto: ${eur(c.fondo.netto)}`);
  prova('Entrambi i percorsi producono un montante positivo', c.azienda.netto > 0 && c.fondo.netto > 0);
  prova('La differenza è coerente con i due netti', vicino(c.differenza, c.fondo.netto - c.azienda.netto, 0.02));
  prova('Con rendimento 3,8% su 30 anni conviene il fondo', c.conviene === 'fondo', `+${eur(c.differenza)}`);
  prova('Sono elencate le ipotesi al cliente', Array.isArray(c.ipotesi) && c.ipotesi.length >= 4);

  // Controprova: con una linea che rende meno della rivalutazione TFR,
  // il fondo NON deve risultare vincente.
  const scarsa = { id: 'test', nome: 'Test', rendimento_atteso: 0.005, costo_gestione_annuo: 0.02, quota_titoli_stato: 0.8 };
  const c2 = PREV.confrontoTfr({ ral: 30000, anni: 30, crescitaRal: 0.01, foi: 0.02, linea: scarsa }, P);
  prova('Con rendimento netto negativo il fondo non vince', c2.conviene !== 'fondo',
    `differenza ${eur(c2.differenza)}`);

  // Le curve al netto delle imposte: è quello che finisce nel grafico.
  const netti = PREV.nettiPerAnno(c, P);
  prova('Le serie nette hanno una voce per anno',
    netti.azienda.length === 30 && netti.fondo.length === 30);
  prova('L\'ultimo valore netto coincide con il totale dichiarato (azienda)',
    vicino(netti.azienda[29], c.azienda.netto, 1), eur(netti.azienda[29]));
  prova('L\'ultimo valore netto coincide con il totale dichiarato (fondo)',
    vicino(netti.fondo[29], c.fondo.netto, 1), eur(netti.fondo[29]));
  prova('Il netto è sempre inferiore al montante lordo',
    netti.fondo.every((v, i) => v <= c.fondo.righe[i].montante + 0.01));
  prova('Il vantaggio netto del fondo si allarga nel tempo',
    (netti.fondo[29] - netti.azienda[29]) > (netti.fondo[9] - netti.azienda[9]),
    `anno 10 ${eur(netti.fondo[9] - netti.azienda[9])} → anno 30 ${eur(netti.fondo[29] - netti.azienda[29])}`);

  // Il vantaggio del fondo deve crescere con l'orizzonte temporale.
  const c10 = PREV.confrontoTfr({ ral: 30000, anni: 10, crescitaRal: 0.01, foi: 0.02, linea: bil }, P);
  prova('Il vantaggio del fondo cresce con gli anni', c.differenza > c10.differenza,
    `30 anni ${eur(c.differenza)} vs 10 anni ${eur(c10.differenza)}`);
}

/* ── Pensione pubblica ───────────────────────────────────────────────── */
titolo('Pensione pubblica e gap previdenziale');
{
  // Ipotesi realistica: la retribuzione cresce quanto si rivaluta il montante
  // (2%). È il caso da manuale, quello che restituisce il ~75% di sostituzione
  // che la letteratura previdenziale indica per un dipendente con 40 anni di
  // contributi. Disallineare le due ipotesi gonfia il risultato: vedi sotto.
  const p = PREV.pensionePubblica({
    eta: 40, etaPensione: 67, ral: 30000, anniContributi: 15,
    tipoLavoratore: 'dipendente', crescitaRal: 0.02, tassoCapitalizzazione: 0.02
  }, P);

  console.log(`        pensione lorda: ${eur(p.pensioneMensileLorda)}/mese   ultima RAL: ${eur(p.ultimaRal)}`);
  console.log(`        tasso di sostituzione netto: ${p.tassoSostituzioneNetto}%   gap: ${eur(p.gapMensileNetto)}/mese`);

  prova('Anni alla pensione = 67 − 40', p.anniAllaPensione === 27);
  prova('Il montante è positivo', p.montanteFinale > 0, eur(p.montanteFinale));
  prova('Il montante è segnalato come stimato', p.montanteStimato === true);
  prova('La pensione è positiva', p.pensioneAnnuaLorda > 0);
  prova('Con ipotesi allineate il tasso di sostituzione è quello da manuale (65-85%)',
    p.tassoSostituzioneLordo > 65 && p.tassoSostituzioneLordo < 85, p.tassoSostituzioneLordo + '%');
  prova('La pensione è inferiore all\'ultima retribuzione', p.pensioneAnnuaLorda < p.ultimaRal);
  prova('Esiste un gap da colmare', p.gapMensileNetto > 0, eur(p.gapMensileNetto));
  prova('Con ipotesi allineate non scattano avvertenze', p.avvertenze.length === 0);

  // Presidio: ipotesi disallineate devono far scattare l'avvertenza, non
  // passare in silenzio con un tasso di sostituzione gonfiato.
  const gonfiato = PREV.pensionePubblica({
    eta: 40, etaPensione: 67, ral: 30000, anniContributi: 15,
    tipoLavoratore: 'dipendente', crescitaRal: 0.01, tassoCapitalizzazione: 0.02
  }, P);
  prova('Rivalutazione > crescita retributiva gonfia il tasso di sostituzione',
    gonfiato.tassoSostituzioneLordo > p.tassoSostituzioneLordo,
    `${gonfiato.tassoSostituzioneLordo}% contro ${p.tassoSostituzioneLordo}%`);
  prova('...e viene segnalato con un\'avvertenza', gonfiato.avvertenze.length > 0,
    gonfiato.avvertenze.length + ' avvertenze');

  // Con il montante da estratto conto il calcolo non deve essere marcato "stimato".
  const preciso = PREV.pensionePubblica({
    eta: 40, etaPensione: 67, ral: 30000, anniContributi: 15,
    montanteInps: 250000, tipoLavoratore: 'dipendente', crescitaRal: 0.02, tassoCapitalizzazione: 0.02
  }, P);
  prova('Con estratto conto INPS non è più una stima', preciso.montanteStimato === false);
  prova('Un montante di partenza più alto dà una pensione più alta',
    preciso.pensioneAnnuaLorda > p.pensioneAnnuaLorda,
    `${eur(preciso.pensioneMensileLorda)}/mese contro ${eur(p.pensioneMensileLorda)}/mese`);

  // Andare in pensione più tardi deve migliorare l'assegno.
  const tardi = PREV.pensionePubblica({
    eta: 40, etaPensione: 70, ral: 30000, anniContributi: 15,
    tipoLavoratore: 'dipendente', crescitaRal: 0.02, tassoCapitalizzazione: 0.02
  }, P);
  prova('Uscire a 70 anni dà una pensione più alta che a 67',
    tardi.pensioneAnnuaLorda > p.pensioneAnnuaLorda,
    `${eur(tardi.pensioneMensileLorda)}/mese contro ${eur(p.pensioneMensileLorda)}/mese`);

  // Un autonomo versa meno: deve avere un tasso di sostituzione più basso.
  const auto = PREV.pensionePubblica({
    eta: 40, etaPensione: 67, ral: 30000, anniContributi: 15,
    tipoLavoratore: 'autonomo_artigiano', crescitaRal: 0.02, tassoCapitalizzazione: 0.02
  }, P);
  prova('L\'autonomo ha un tasso di sostituzione più basso del dipendente',
    auto.tassoSostituzioneLordo < p.tassoSostituzioneLordo,
    `${auto.tassoSostituzioneLordo}% contro ${p.tassoSostituzioneLordo}%`);

  prova('Coefficiente a 67 anni presente in tabella', PREV.coefficienteTrasformazione(67, P) > 0);
  prova('Età fuori tabella non rompe il calcolo (usa l\'estremo)',
    PREV.coefficienteTrasformazione(90, P) > 0 && PREV.coefficienteTrasformazione(20, P) > 0);
}

/* ── Versamento necessario a colmare il gap ──────────────────────────── */
titolo('Versamento necessario per colmare il gap');
{
  const bil = CATALOGO.profili_generici.find(l => l.id === 'bilanciata');
  const v = PREV.versamentoPerColmareGap({ anni: 27, obiettivoMontante: 150000, reddito: 30000, linea: bil }, P);
  console.log(`        servono ${eur(v.versamentoMensile)}/mese, costo reale ${eur(v.costoRealeMensile)}/mese`);
  prova('Il versamento richiesto è positivo', v.versamentoAnnuo > 0);
  prova('Il costo reale è inferiore al versamento (c\'è la deduzione)',
    v.costoRealeAnnuo < v.versamentoAnnuo, `${eur(v.costoRealeAnnuo)} contro ${eur(v.versamentoAnnuo)}`);

  // Controprova incrociata: versando quella cifra si deve ottenere l'obiettivo.
  const check = PREV.proiezioneFondo({ ral: 0, anni: 27, versamentoAnnuo: v.versamentoAnnuo, linea: bil }, P);
  const tass = PREV.tassazionePrestazioneFondo(check, 27, P);
  prova('Controprova: il versamento calcolato produce davvero l\'obiettivo',
    vicino(tass.netto, 150000, 150), `ottenuto ${eur(tass.netto)} contro 150.000 €`);
}

/* ── Confronto multi-prodotto ────────────────────────────────────────── */
titolo('Confronto multi-compagnia');
{
  const prodotti = CATALOGO.profili_generici.map(l => ({ id: l.id, nome: l.nome, linea: l, reale: false }));
  const c = PREV.confrontoProdotti({ ral: 30000, anni: 30, crescitaRal: 0.01, conferisceTfr: true }, P, prodotti);

  prova('Tutti i profili sono stati calcolati', c.esiti.length === CATALOGO.profili_generici.length);
  prova('I risultati sono ordinati dal migliore al peggiore',
    c.esiti.every((e, i) => i === 0 || e.netto <= c.esiti[i - 1].netto));
  prova('Lo spread tra migliore e peggiore è positivo', c.spread > 0, eur(c.spread));
  c.esiti.forEach(e => console.log(`        ${e.nome.padEnd(22)} ${eur(e.netto).padStart(14)}`));

  // Il contributo del datore deve fare la differenza.
  const conDatore = PREV.confrontoProdotti({ ral: 30000, anni: 30, crescitaRal: 0.01, conferisceTfr: true }, P,
    [{ id: 'a', nome: 'Senza datore', linea: CATALOGO.profili_generici[2] },
     { id: 'b', nome: 'Con datore 1,5%', linea: CATALOGO.profili_generici[2], contributoDatoreAliquota: 0.015 }]);
  prova('Il contributo del datore aumenta il risultato finale',
    conDatore.esiti[0].id === 'b', `vantaggio ${eur(conDatore.spread)}`);
}

/* ── Lato azienda ────────────────────────────────────────────────────── */
titolo('Azienda — costo del TFR');
{
  const sotto = PREV.costoTfrAzienda({ dipendenti: 20, monteRetributivo: 600000, anni: 10, foi: 0.02, costoDenaro: 0.05 }, P);
  prova('Sotto i 50 dipendenti il TFR resta in azienda', sotto.sottoSoglia === true);
  prova('Accantonamento annuo = monte / 13,5', vicino(sotto.accantonamentoAnnuo, 600000 / 13.5, 0.5), eur(sotto.accantonamentoAnnuo));
  prova('Il fondo TFR cresce nei 10 anni', sotto.fondoFinale > 0, eur(sotto.fondoFinale));
  prova('Il risparmio finanziario è valorizzato', sotto.risparmioFinanziarioAnnuo > 0, eur(sotto.risparmioFinanziarioAnnuo));

  const sopra = PREV.costoTfrAzienda({ dipendenti: 80, monteRetributivo: 600000, anni: 10, foi: 0.02, costoDenaro: 0.05 }, P);
  prova('Sopra i 50 dipendenti non c\'è vantaggio di cassa', sopra.risparmioFinanziarioAnnuo === 0);
  prova('Sopra soglia il fondo in azienda non si accresce di nuovo TFR',
    sopra.fondoFinale < sotto.fondoFinale, `${eur(sopra.fondoFinale)} contro ${eur(sotto.fondoFinale)}`);
}

titolo('Azienda — vantaggi del conferimento a previdenza');
{
  const v = PREV.vantaggioConferimento({ dipendenti: 20, monteRetributivo: 600000, quotaConferita: 1 }, P);
  prova('Sotto soglia la deduzione aggiuntiva è il 6%', vicino(v.aliquotaDeduzione, 0.06, 0.0001));
  prova('Il vantaggio annuo è positivo', v.vantaggioAnnuo > 0, eur(v.vantaggioAnnuo));
  prova('Esonero Fondo garanzia = 0,20% del monte', vicino(v.esoneroFondoGaranzia, 600000 * 0.002, 0.5), eur(v.esoneroFondoGaranzia));
  prova('Riduzione oneri impropri = 0,28% del monte', vicino(v.riduzioneOneriImpropri, 600000 * 0.0028, 0.5), eur(v.riduzioneOneriImpropri));
  prova('Il vantaggio per dipendente è coerente', vicino(v.vantaggioPerDipendente, v.vantaggioAnnuo / 20, 0.5), eur(v.vantaggioPerDipendente));

  const grande = PREV.vantaggioConferimento({ dipendenti: 80, monteRetributivo: 600000, quotaConferita: 1 }, P);
  prova('Sopra soglia la deduzione aggiuntiva scende al 4%', vicino(grande.aliquotaDeduzione, 0.04, 0.0001));

  const meta = PREV.vantaggioConferimento({ dipendenti: 20, monteRetributivo: 600000, quotaConferita: 0.5 }, P);
  prova('Con metà adesioni il vantaggio si dimezza', vicino(meta.vantaggioAnnuo, v.vantaggioAnnuo / 2, 1), eur(meta.vantaggioAnnuo));
}

titolo('Azienda — quanto costa dare 100 € netti');
{
  const c = PREV.confrontoErogazione({ nettoObiettivo: 1000, redditoDipendente: 30000 }, P);
  c.opzioni.forEach(o => console.log(
    `        ${o.modalita.padEnd(38)} costa ${eur(o.costoAzienda).padStart(12)}  →  ${eur(o.nettoDipendente).padStart(11)} netti  (${o.efficienza}%)`));

  const busta = c.opzioni.find(o => o.id === 'busta');
  const fringe = c.opzioni.find(o => o.id === 'fringe');
  const prev = c.opzioni.find(o => o.id === 'previdenza');

  prova('L\'aumento in busta è il canale meno efficiente', busta.efficienza < fringe.efficienza && busta.efficienza < prev.efficienza,
    `busta ${busta.efficienza}%`);
  prova('Il fringe benefit entro soglia è efficiente al 100%', vicino(fringe.efficienza, 100, 0.5));
  prova('Esattamente alla soglia il fringe non è segnalato come parziale', fringe.parziale === false, `tetto ${eur(fringe.limite)}`);

  const oltre = PREV.confrontoErogazione({ nettoObiettivo: 2500, redditoDipendente: 30000 }, P);
  const fringeOltre = oltre.opzioni.find(o => o.id === 'fringe');
  prova('Oltre la soglia il fringe è segnalato come parziale', fringeOltre.parziale === true,
    `eroga solo ${eur(fringeOltre.nettoDipendente)} dei 2.500 € richiesti`);
  prova('La previdenza batte l\'aumento in busta', prev.efficienza > busta.efficienza,
    `${prev.efficienza}% contro ${busta.efficienza}%`);
  prova('La previdenza è segnalata come beneficio differito', prev.differito === true);
  prova('È indicata l\'opzione migliore', c.migliore != null, c.migliore);

  // Dipendente sopra il limite di reddito: il premio di risultato non si applica.
  const alto = PREV.confrontoErogazione({ nettoObiettivo: 1000, redditoDipendente: 90000 }, P);
  const premioAlto = alto.opzioni.find(o => o.id === 'premio');
  prova('Sopra il limite di reddito il premio detassato è escluso', premioAlto.ammesso === false);

  // Con figli a carico la soglia fringe raddoppia.
  const figli = PREV.confrontoErogazione({ nettoObiettivo: 1500, redditoDipendente: 30000, figliACarico: true }, P);
  const fringeFigli = figli.opzioni.find(o => o.id === 'fringe');
  prova('Con figli a carico la soglia fringe è più alta',
    fringeFigli.limite > fringe.limite, `${eur(fringeFigli.limite)} contro ${eur(fringe.limite)}`);
}

/* ── Scenari ─────────────────────────────────────────────────────────── */
titolo('Scenari');
{
  const bil = CATALOGO.profili_generici.find(l => l.id === 'bilanciata');
  const s = PREV.conScenari(PREV.confrontoTfr, { ral: 30000, anni: 30, crescitaRal: 0.01, foi: 0.02, linea: bil }, P);

  prova('Sono prodotti tre scenari', ['pessimistico', 'atteso', 'ottimistico'].every(k => s[k] && s[k].risultato));
  prova('Prudente < Atteso < Favorevole',
    s.pessimistico.risultato.fondo.netto < s.atteso.risultato.fondo.netto &&
    s.atteso.risultato.fondo.netto < s.ottimistico.risultato.fondo.netto,
    `${eur(s.pessimistico.risultato.fondo.netto)} / ${eur(s.atteso.risultato.fondo.netto)} / ${eur(s.ottimistico.risultato.fondo.netto)}`);
  prova('Lo scenario atteso non altera il rendimento', s.atteso.deltaRendimento === 0);
}

/* ── Validazione ─────────────────────────────────────────────────────── */
titolo('Validazione degli input');
{
  prova('Età fuori range viene respinta', PREV.validaPrivato({ eta: 12, ral: 30000 }).length > 0);
  prova('RAL mancante viene respinta', PREV.validaPrivato({ eta: 40, ral: 0 }).length > 0);
  prova('Contributi incompatibili con l\'età vengono respinti',
    PREV.validaPrivato({ eta: 25, ral: 30000, anniContributi: 20 }).length > 0);
  prova('Età pensione precedente all\'età attuale viene respinta',
    PREV.validaPrivato({ eta: 60, ral: 30000, anniContributi: 30, etaPensione: 55 }).length > 0);
  prova('Input corretto passa senza errori',
    PREV.validaPrivato({ eta: 40, ral: 30000, anniContributi: 15, etaPensione: 67 }).length === 0);
  prova('Azienda senza monte retributivo viene respinta', PREV.validaAzienda({ dipendenti: 10, monteRetributivo: 0 }).length > 0);
  prova('Azienda corretta passa', PREV.validaAzienda({ dipendenti: 10, monteRetributivo: 300000 }).length === 0);
}

/* ── Robustezza ──────────────────────────────────────────────────────── */
titolo('Robustezza — input sporchi non devono far esplodere nulla');
{
  const casi = [
    ['stringhe al posto dei numeri', () => PREV.confrontoTfr({ ral: 'abc', anni: 'x', linea: {} }, P)],
    ['valori nulli', () => PREV.pensionePubblica({ eta: null, ral: null, anniContributi: null }, P)],
    ['zero anni', () => PREV.confrontoTfr({ ral: 30000, anni: 0, linea: {} }, P)],
    ['catalogo vuoto', () => PREV.confrontoProdotti({ ral: 30000, anni: 10 }, P, [])],
    ['netto obiettivo zero', () => PREV.confrontoErogazione({ nettoObiettivo: 0, redditoDipendente: 30000 }, P)],
  ];
  casi.forEach(([nome, fn]) => {
    let esito = true, msg = 'nessun errore';
    try { const r = fn(); if (r == null) { esito = false; msg = 'ha restituito null'; } }
    catch (e) { esito = false; msg = e.message; }
    prova(nome, esito, msg);
  });
}

/* ── Esito ───────────────────────────────────────────────────────────── */
console.log('\n' + '═'.repeat(60));
console.log(`  ${ok} prove superate, ${ko} fallite`);
console.log('═'.repeat(60) + '\n');
process.exit(ko === 0 ? 0 : 1);
