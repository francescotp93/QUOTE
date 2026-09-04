// ═══════════════════════════════════════════════════════════════════════════
//  IL RISPARMIO FISCALE DELLA DEDUZIONE — quanto vale DAVVERO
//
//  Prima si calcolava «importo dedotto × aliquota marginale», e l'aliquota si
//  prendeva sul reddito LORDO. Due errori sovrapposti:
//
//   1. Gli scaglioni si applicano all'imponibile, cioè al lordo meno i
//      contributi previdenziali obbligatori. Sul lordo si sbaglia scaglione.
//   2. La deduzione non vale l'aliquota per l'importo. Vale la DIFFERENZA fra
//      l'imposta dovuta senza il versamento e quella dovuta con il versamento.
//
//  Il secondo errore è quello che conta, e si vede in tre casi veri: redditi
//  bassi dove le detrazioni azzerano l'imposta, la fascia in cui la detrazione
//  decresce, e i versamenti che portano il reddito sotto una soglia di
//  scaglione. Sono i tre casi che questa prova sorveglia.
//
//  ATTENZIONE AI NUMERI. Gli importi qui dentro sono quelli indicati da
//  Francesco il 03/09/2026 e NON ancora riscontrati sulle fonti ufficiali: il
//  motore li tiene con `FISCO.daVerificare` acceso. Queste prove verificano le
//  REGOLE — progressività, capienza, differenza fra le due imposte — non la
//  correttezza dei valori. Quando i valori saranno confermati, le regole
//  restano queste.
// ═══════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../../tariffe/motore/previdenza.js');

const esiti = [];
const prova = (nome, fn) => { try { esiti.push([true, nome, fn() || '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };
const vicino = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 0.01 : eps);

/* ── L'imponibile: il lordo non è la base ────────────────────────────────── */

prova('l\'imponibile è il lordo meno i contributi, non il lordo', () => {
  const lordo = 30000;
  const imp = P.imponibileFiscale(lordo, false);
  deve(imp < lordo, 'l\'imponibile coincide col lordo: i contributi non vengono tolti');
  deve(vicino(imp, lordo - lordo * 0.0919), 'per il dipendente si toglie la quota a suo carico');
  return Math.round(imp) + ' € su 30.000 lordi';
});

prova('al dipendente si toglie la SUA quota, non il 33%', () => {
  /* Il 33% è l'aliquota di computo: per due terzi la versa il datore e dal
     lordo in busta è già fuori. Toglierlo sbaglierebbe di venti punti. */
  const c = P.contributiObbligatori(30000, false);
  deve(c < 30000 * 0.15, 'sta togliendo l\'aliquota di computo invece della quota a carico: ' + Math.round(c));
  deve(c > 30000 * 0.05, 'non sta togliendo niente');
  return Math.round(c) + ' € di contributi su 30.000';
});

prova('sopra la prima fascia il dipendente paga l\'1% in più', () => {
  const f = P.FISCO.contributi.dipendente;
  const sotto = P.contributiObbligatori(f.primaFascia, false);
  const sopra = P.contributiObbligatori(f.primaFascia + 10000, false);
  const senzaScalino = sotto + 10000 * f.aliquota;
  deve(sopra > senzaScalino, 'l\'1% oltre la prima fascia non viene applicato');
  deve(vicino(sopra, senzaScalino + 10000 * f.oltrePrimaFascia), 'lo scalino non è dell\'1%');
  return 'oltre ' + f.primaFascia + ' € scatta l\'1%';
});

prova('l\'autonomo ha la sua aliquota, e paga più contributi del dipendente', () => {
  deve(P.contributiObbligatori(30000, true) > P.contributiObbligatori(30000, false),
    'autonomo e dipendente pagano lo stesso: il regime non viene distinto');
});

/* ── L'imposta: progressiva, non un'aliquota sola ────────────────────────── */

prova('l\'imposta lorda è progressiva: ogni fetta la sua aliquota', () => {
  const sc = P.FISCO.scaglioni;
  const primo = sc[0].fino;
  deve(vicino(P.irpefLorda(primo), primo * sc[0].aliquota), 'sul primo scaglione non torna');
  // Un euro sopra la soglia non tassa TUTTO alla seconda aliquota.
  const sopra = P.irpefLorda(primo + 1000);
  deve(vicino(sopra, primo * sc[0].aliquota + 1000 * sc[1].aliquota),
    'oltre la soglia tassa tutto alla seconda aliquota invece della sola eccedenza');
  deve(P.irpefLorda(0) === 0 && P.irpefLorda(-5) === 0, 'un imponibile nullo produce imposta');
  return 'progressiva sui ' + sc.length + ' scaglioni';
});

prova('la detrazione da lavoro decresce col reddito e si azzera a 50.000', () => {
  const a = P.detrazioneLavoro(20000, false), b = P.detrazioneLavoro(35000, false);
  deve(a > b, 'la detrazione non decresce col reddito');
  deve(P.detrazioneLavoro(60000, false) === 0, 'sopra i 50.000 la detrazione non si azzera');
  deve(P.detrazioneLavoro(10000, false) > 0, 'sotto la prima soglia manca la detrazione fissa');
  deve(P.detrazioneLavoro(20000, true) !== P.detrazioneLavoro(20000, false),
    'autonomo e dipendente hanno la stessa detrazione: il regime non viene distinto');
});

/* ── I TRE CASI CHE IL CONTO VECCHIO SBAGLIAVA ───────────────────────────── */

prova('CASO 1 · redditi bassi: l\'imposta è già zero, la deduzione non vale niente', () => {
  /* Il conto vecchio mostrava il 23% di risparmio su un reddito che l'IRPEF
     non la paga. Al cliente si prometteva un beneficio inesistente. */
  const r = P.risparmioDaDeduzione(9000, 600, false);
  deve(r.senza.netta === 0, 'con questo reddito l\'imposta non risulta azzerata dalle detrazioni');
  deve(r.risparmio === 0, 'mostra un risparmio su un\'imposta che non c\'è: ' + r.risparmio);
  deve(r.impostaAzzerata === true, 'non segnala che l\'imposta è azzerata');
  deve(r.aliquotaEffettiva === 0, 'l\'aliquota effettiva non è zero');
  return 'reddito 9.000: risparmio 0, e lo dice';
});

prova('CASO 1 · e il modulo lo scrive al cliente, invece di tacere', () => {
  const p = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 9000,
    anniContributiGia: 10, annoRiferimento: 2026 });
  const v = P.valutaSoluzione(p, 50);
  const detto = v.motivi.join(' ');
  deve(/[Nn]essun risparmio fiscale/.test(detto), 'non dice che il risparmio fiscale non c\'è');
  deve(/detrazioni/.test(detto), 'non spiega perché');
});

prova('CASO 2 · il versamento che scavalca uno scaglione vale due aliquote', () => {
  /* Se la deduzione porta l'imponibile sotto una soglia, una parte del
     beneficio vale all'aliquota alta e una a quella bassa. Una sola aliquota
     non può dirlo, e il conto vecchio prendeva sempre quella alta. */
  const sc = P.FISCO.scaglioni;
  const soglia = sc[0].fino;
  // Un reddito il cui imponibile sta poco sopra la soglia.
  const lordo = Math.round((soglia + 150) / (1 - P.FISCO.contributi.dipendente.aliquota));
  const dedotto = 1200;
  const r = P.risparmioDaDeduzione(lordo, dedotto, false);
  deve(r.senza.imponibile > soglia && r.con.imponibile < soglia, 'il caso di prova non scavalca la soglia');
  const alta = sc[1].aliquota, bassa = sc[0].aliquota;
  deve(r.aliquotaEffettiva < alta, 'il beneficio è calcolato tutto all\'aliquota alta: ' + r.aliquotaEffettiva);
  deve(r.aliquotaEffettiva > bassa, 'il beneficio è calcolato tutto all\'aliquota bassa');
  // e il conto è esattamente la somma delle due fette
  const sopra = r.senza.imponibile - soglia;
  const atteso = sopra * alta + (dedotto - sopra) * bassa;
  deve(vicino(r.risparmio, atteso, 0.5), 'le due fette non tornano: ' + r.risparmio + ' contro ' + atteso);
  return (r.aliquotaEffettiva * 100).toFixed(1) + '% invece del ' + (alta * 100) + '% di scaglione';
});

prova('CASO 3 · versando tramite il datore la detrazione sale, e il beneficio con lei', () => {
  /* Versamento DIRETTO (art. 10 c. 1 lett. e-bis): onere deducibile, abbassa
     l'imponibile ma non il reddito complessivo — la detrazione resta quella.
     Versamento TRAMITE IL DATORE (art. 51 c. 2 lett. h): quei soldi non
     formano reddito, il complessivo scende e la detrazione sale.
     Nella fascia in cui la detrazione decresce le due strade danno numeri
     diversi, e il modulo deve saperle distinguere. */
  const diretto = P.risparmioDaDeduzione(24000, 1200, false, null, false);
  const datore = P.risparmioDaDeduzione(24000, 1200, false, null, true);
  deve(datore.risparmio > diretto.risparmio, 'le due strade danno lo stesso risparmio: la detrazione non si muove');
  deve(datore.con.detrazione > diretto.con.detrazione, 'la detrazione non sale col versamento tramite datore');
  deve(diretto.tramiteDatore === false && datore.tramiteDatore === true, 'la strada usata non viene dichiarata');
  return 'diretto ' + (diretto.aliquotaEffettiva * 100).toFixed(1) + '%, tramite datore ' +
         (datore.aliquotaEffettiva * 100).toFixed(1) + '%';
});

prova('il valore di riserva è il versamento diretto, cioè quello che promette meno', () => {
  // Fra due strade legittime si sceglie la prudente, e la si dichiara.
  const senzaDire = P.risparmioDaDeduzione(24000, 1200, false);
  const diretto = P.risparmioDaDeduzione(24000, 1200, false, null, false);
  deve(senzaDire.risparmio === diretto.risparmio, 'senza dire niente non si comporta come il versamento diretto');
});

/* ── Il gradino del trattamento integrativo ──────────────────────────────── */

prova('dove dedurre fa perdere il trattamento integrativo, lo dice', () => {
  /* Sotto la soglia il trattamento integrativo spetta solo se l'imposta lorda
     supera la detrazione: dedurre può farla scendere sotto e far perdere
     l'intero importo. Il risparmio diventa NEGATIVO — versare costerebbe più
     del versamento. Un numero così non si mostra come «risparmio». */
  let trovato = null;
  for (let r = 9000; r <= 15000; r += 100) {
    const s = P.risparmioDaDeduzione(r, 600, false);
    if (s.perdeIlTrattamentoIntegrativo) { trovato = { r, s }; break; }
  }
  deve(trovato, 'il gradino non esiste più: la regola del trattamento integrativo non viene applicata');
  deve(trovato.s.risparmio < 0, 'perde il trattamento integrativo ma il risparmio resta positivo');
  return 'gradino a ' + trovato.r + ' €: ' + trovato.s.risparmio.toFixed(0) + ' €';
});

prova('quando dedurre costa, il modulo non lo chiama risparmio', () => {
  let reddito = null;
  for (let r = 9000; r <= 15000; r += 100) {
    if (P.risparmioDaDeduzione(r, 600, false).perdeIlTrattamentoIntegrativo) { reddito = r; break; }
  }
  deve(reddito, 'nessun caso da provare');
  const p = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: reddito,
    anniContributiGia: 10, annoRiferimento: 2026 });
  const detto = P.valutaSoluzione(p, 50).motivi.join(' ');
  deve(/non conviene|Attenzione/.test(detto), 'non avvisa che fiscalmente il versamento non conviene');
  deve(!/Risparmio fiscale: -/.test(detto), 'mostra un «risparmio» negativo');
});

/* ── Quello che arriva al modulo ─────────────────────────────────────────── */

prova('la simulazione porta l\'aliquota EFFETTIVA, non solo quella di scaglione', () => {
  const p = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026 });
  const sim = P.simulaIntegrativa(p, 100);
  deve(typeof sim.aliquotaEffettivaBeneficio === 'number', 'manca l\'aliquota effettiva di beneficio');
  deve(typeof sim.aliquotaMarginale === 'number', 'l\'aliquota di scaglione non c\'è più: serve come informazione');
  deve(typeof sim.costoEffettivoMensile === 'number', 'manca il costo effettivo, che è il numero da dire al cliente');
  deve(vicino(sim.costoEffettivoAnnuo, sim.versamentoAnnuo - sim.risparmioFiscaleAnnuo),
    'il costo effettivo non è il versamento meno il risparmio');
  return 'costo effettivo ' + Math.round(sim.costoEffettivoMensile) + ' € invece di ' + sim.versamentoMensile + ' €';
});

prova('l\'aliquota di scaglione si legge sull\'imponibile, non sul lordo', () => {
  /* Un lordo appena sopra la soglia ha un imponibile sotto: leggere lo
     scaglione sul lordo sposta la persona in una fascia che non è la sua. */
  const sc = P.FISCO.scaglioni;
  const soglia = sc[0].fino;
  const lordo = soglia + 1500;                       // sopra la soglia da lordo
  const imponibile = P.imponibileFiscale(lordo, false);
  deve(imponibile < soglia, 'il caso di prova non serve: l\'imponibile resta sopra la soglia');
  const p = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: lordo,
    anniContributiGia: 15, annoRiferimento: 2026 });
  const sim = P.simulaIntegrativa(p, 100);
  deve(sim.aliquotaMarginale === sc[0].aliquota,
    'legge lo scaglione sul lordo: dichiara il ' + (sim.aliquotaMarginale * 100) + '% a chi sta nel primo');
});

prova('il modulo dice che il beneficio è quello di oggi', () => {
  /* Il versamento si deduce per tutti gli anni che mancano, e in quegli anni
     reddito e regole cambiano. Si calcola sul reddito attuale — fare la media
     vorrebbe dire ipotizzare gli scaglioni del 2060 — ma va DETTO. */
  const p = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026 });
  const detto = P.valutaSoluzione(p, 100).motivi.join(' ');
  deve(/reddito attuale/.test(detto), 'non dice che il beneficio è calcolato sul reddito di oggi');
  deve(/variare negli anni/.test(detto), 'non dice che può cambiare');
});

prova('i numeri fiscali portano la loro norma, e quello non riscontrato è elencato', () => {
  /* CAMBIATA il 04/09/2026: prima diceva «indicati da Francesco». Adesso sono
     stati riscontrati su Normattiva e Agenzia delle Entrate — tranne una riga,
     i valori della circolare INPS 6/2026, che il portale INPS non espone. La
     bandiera resta accesa per quella sola, ed è scritto quale. */
  deve(/TUIR/.test(P.FISCO.fonte), 'la fonte non cita le norme');
  deve(/199\/2025/.test(P.FISCO.fonte), 'la fonte non cita la legge che ha portato lo scaglione al 33%');
  deve(P.FISCO.daVerificare === true, 'risulta tutto verificato e una riga non lo è');
  deve(Array.isArray(P.FISCO.daRiscontrare) && P.FISCO.daRiscontrare.length >= 1,
    'la bandiera è accesa ma non dice quale riga non è stata riscontrata');
  deve(/INPS/.test(P.FISCO.daRiscontrare.join(' ')), 'non dice che è la circolare INPS a mancare');
  return P.FISCO.daRiscontrare.length + ' riga da riscontrare';
});

prova('le correzioni di Giulia sono dentro', () => {
  // Le quattro cose che il primo giro aveva sbagliato o saltato.
  deve(P.FISCO.contributi.dipendente.primaFascia === 56224, 'la prima fascia non è quella del 2026');
  deve(P.FISCO.contributi.dipendente.massimale === 122295, 'manca il massimale contributivo');
  deve(P.contributiObbligatori(200000, false) === P.contributiObbligatori(122295, false),
    'sopra il massimale continua a calcolare contributi che non si versano');
  deve(P.FISCO.trattamentoIntegrativo.scontoCapienza === 75,
    'manca lo sconto di 75 € nella verifica di capienza del trattamento integrativo');
  deve(P.detrazioneLavoro(14000, true) > P.detrazioneLavoro(14000, true, {
    detrazioneAutonomo: Object.assign({}, P.FISCO.detrazioneAutonomo, { extra: null }),
    scaglioni: P.FISCO.scaglioni }), 'manca il +50 € dell\'art. 13 c. 5-ter per l\'autonomo');
  deve(P.ulterioreDetrazione(30000, false) === 1000, 'manca l\'ulteriore detrazione per i redditi medi');
  deve(P.ulterioreDetrazione(41000, false) === 0, 'l\'ulteriore detrazione non si azzera a 40.000');
  deve(P.ulterioreDetrazione(30000, true) === 0, 'l\'ulteriore detrazione viene data anche all\'autonomo');
});

prova('il rapporto delle detrazioni è troncato alla quarta cifra, come vuole la norma', () => {
  /* art. 13 c. 6 TUIR. Senza il troncamento i risultati divergono di qualche
     euro da quelli del CAF — e la differenza la trova il cliente. */
  deve(typeof P.tronca4 === 'function', 'manca il troncamento');
  deve(P.tronca4(0.123456789) === 0.1234, 'non tronca alla quarta cifra');
  deve(P.tronca4(0.99999) === 0.9999, 'arrotonda invece di troncare');
  deve(P.tronca4(-1) === 0, 'un rapporto negativo non si assume');
});

prova('sopra i 200.000 le detrazioni sono ridotte di 440 €', () => {
  // L. 199/2025 art. 1 c. 4 → art. 16-ter c. 5-bis TUIR.
  const sotto = P.irpefNetta(190000, 0, false);
  const sopra = P.irpefNetta(230000, 0, false);
  deve(sopra.redditoComplessivo > 200000 && sotto.redditoComplessivo <= 200000,
    'i due casi di prova non stanno ai due lati della soglia');
  deve(sotto.taglioAltiRedditi === 0, 'il taglio scatta sotto la soglia');
  deve(sopra.taglioAltiRedditi === 440, 'sopra i 200.000 il taglio non viene applicato');
});

prova('il report scrive il risparmio per quello che è, anche quando non c\'è', () => {
  const consulente = { nome: 'F. Oddo', ruolo: 'Intermediario', rui: 'X', email: 'a@b.it', telefono: '1' };
  const foglio = (reddito, versamento) => {
    const p = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: reddito,
      anniContributiGia: 15, annoRiferimento: 2026 });
    return P.reportPrevidenza({ prospettiva: p, valutazione: P.valutaSoluzione(p, versamento),
      cliente: { nome: 'Prova' }, consulente: consulente, dataRiferimento: '3 settembre 2026' }).html;
  };
  const buono = foglio(30000, 100);
  deve(/Risparmio fiscale/.test(buono), 'il foglio non riporta il risparmio');
  deve(/Costo effettivo del versamento/.test(buono), 'non dice il costo effettivo, che è il numero che il cliente capisce');
  deve(/reddito attuale/.test(buono), 'non avvisa che il beneficio è quello di oggi');
  deve(/addizional/i.test(buono), 'non dice che le addizionali non sono comprese');

  // Reddito su cui l'IRPEF è già azzerata dalle detrazioni.
  const secco = foglio(9000, 50);
  deve(!/Risparmio fiscale<\/span>/.test(secco), 'promette un risparmio su un\'imposta che non c\'è');
  deve(/non produce alcun risparmio fiscale/.test(secco), 'non spiega perché il risparmio non c\'è');
  return 'verde quando c\'è, spiegato quando no';
});

/* ── esecuzione ──────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' IRPEF previdenza: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
