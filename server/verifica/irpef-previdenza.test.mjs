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

/* ── I DUE CANALI DI VERSAMENTO ──────────────────────────────────────────── */

prova('il canale NON cambia il beneficio fiscale', () => {
  /* CAMBIATA il 04/09/2026. Un primo giro faceva scendere il reddito
     complessivo nel canale «tramite datore», e la detrazione da lavoro — che a
     quel reddito è commisurata — saliva: a 24.000 € il beneficio risultava del
     32,2% invece del 23%. Decisione di Francesco: il beneficio fiscale è lo
     stesso nei due canali. I contributi previdenziali, in entrambi, si
     calcolano sulla retribuzione piena. */
  const casi = [12000, 24000, 30000, 36000, 60000];
  for (const r of casi) {
    const senza = P.risparmioDaDeduzione(r, 1200, false);
    const p1 = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: r,
      anniContributiGia: 15, annoRiferimento: 2026, canale: 'diretto' });
    const p2 = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: r,
      anniContributiGia: 15, annoRiferimento: 2026, canale: 'datore' });
    const s1 = P.simulaIntegrativa(p1, 100), s2 = P.simulaIntegrativa(p2, 100);
    deve(vicino(s1.risparmioFiscaleAnnuo, s2.risparmioFiscaleAnnuo),
      'a ' + r + ' € i due canali danno un risparmio diverso: ' +
      s1.risparmioFiscaleAnnuo.toFixed(2) + ' contro ' + s2.risparmioFiscaleAnnuo.toFixed(2));
    deve(vicino(s1.risparmioFiscaleAnnuo, senza.risparmio), 'il canale sposta il conto');
    deve(s1.canale && s1.canale.canale === 'diretto' && s2.canale && s2.canale.canale === 'datore',
      'il canale non viene nemmeno riconosciuto: l\'uguaglianza qui sopra non dimostra niente');
  }
  return casi.length + ' redditi, stesso beneficio nei due canali';
});

prova('i contributi si calcolano sulla retribuzione piena, in entrambi i canali', () => {
  // È il punto tecnico: il versamento riduce l'imponibile IRPEF, non quello
  // previdenziale. L'aliquota contributiva non si somma a quella fiscale.
  const senza = P.irpefNetta(30000, 0, false);
  const con = P.irpefNetta(30000, 3000, false);
  deve(senza.contributi === con.contributi, 'dedurre ha cambiato i contributi previdenziali');
  deve(con.imponibile < senza.imponibile, 'la deduzione non abbassa l\'imponibile fiscale');
});

prova('la differenza fra i canali è QUANDO si incassa e a cosa dà accesso', () => {
  const dir = P.differenzeCanale('diretto'), dat = P.differenzeCanale('datore');
  deve(dir.canale === 'diretto' && dat.canale === 'datore', 'il canale non viene riconosciuto');
  deve(/stesso nei due canali/.test(dir.beneficioFiscale), 'non dice che il beneficio fiscale è lo stesso');
  deve(/busta paga/.test(dat.punti.join(' ')), 'non dice che tramite datore la deduzione opera in busta paga');
  deve(/contributo del datore/.test(dat.punti.join(' ')), 'non dice che si apre l\'accesso al contributo datoriale');
  deve(/TFR/.test(dat.punti.join(' ')), 'non dice che permette di conferire il TFR');
  deve(/dichiarazione/.test(dir.punti.join(' ')), 'non dice che nel diretto il beneficio arriva l\'anno dopo');
  // Senza indicazione vale il diretto: è il caso che promette meno.
  deve(P.differenzeCanale(undefined).canale === 'diretto', 'senza indicazione non vale il versamento diretto');
});

prova('il canale arriva fino al foglio del cliente', () => {
  const p = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 24000,
    anniContributiGia: 15, annoRiferimento: 2026, canale: 'datore' });
  const r = P.reportPrevidenza({ prospettiva: p, valutazione: P.valutaSoluzione(p, 100),
    cliente: { nome: 'Prova' }, consulente: { nome: 'F. Oddo', ruolo: 'Intermediario', rui: 'X', email: 'a@b.it', telefono: '1' },
    dataRiferimento: '4 settembre 2026' }).html;
  deve(/Canale di versamento/.test(r), 'il foglio non dice da quale canale si versa');
  deve(/stesso nei due canali/.test(r), 'il foglio non dice che il beneficio fiscale è lo stesso');
  deve(/contributo del datore/.test(r), 'il foglio non dice cosa apre l\'adesione tramite datore');
});

prova('in nessun punto si somma un\'aliquota contributiva a una fiscale', () => {
  /* L'audit chiesto da Francesco il 04/09/2026. L'unico punto in cui i due
     mondi si incontrano è la base imponibile: i contributi si TOLGONO dal
     reddito, e le aliquote non si sommano mai fra loro. */
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(process.cwd(), 'tariffe/motore/previdenza.js'), 'utf8')
    .split('\n').filter(r => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');
  const sospette = src.match(/aliq[A-Za-z]*\s*\+\s*[A-Za-z]|[A-Za-z]\s*\+\s*aliq[A-Za-z]*/g) || [];
  deve(sospette.length === 0, 'somma di aliquote trovata: ' + sospette.slice(0, 3).join(' | '));
  return 'nessuna somma di aliquote nel motore';
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

/* ── SOVRACOPERTURA ──────────────────────────────────────────────────────── */

const persona = () => P.prospettivaPensionistica({ eta: 33, etaPensionamento: 67, redditoAnnuo: 24000,
  anniContributiGia: 9, annoRiferimento: 2026 });

prova('quando la rendita supera il divario, il modulo lo dice e indica il minimo', () => {
  /* Il modulo scriveva «adeguata» e taceva su un versamento che copriva il 173%
     del divario. Sotto IDD la sovracopertura è esattamente ciò che una
     revisione di adeguatezza contesta — e prima ancora è denaro del cliente
     fermo in un prodotto che non gli serve. (Francesco, 04/09/2026) */
  /* L'importo del caso è salito da 500 a 1.100 € con F-11 (05/09/2026): la
     rendita del fondo sconta ora il coefficiente della convenzione, i costi e
     l'imposta, e per superare lo stesso divario serve versare più del doppio.
     La regola sorvegliata è la stessa. */
  const v = P.valutaSoluzione(persona(), 1100);
  deve(v.stato === 'adeguato', 'il caso di prova non è adeguato');
  deve(v.sovracopertura, 'non segnala la sovracopertura');
  deve(v.sovracopertura.quota > 1, 'la quota coperta non supera il divario');
  deve(v.sovracopertura.minimoMensile < 1100, 'il minimo non è più basso del versamento');
  deve(v.sovracopertura.eccedenzaMensile === 1100 - v.sovracopertura.minimoMensile, 'l\'eccedenza non torna');
  deve(v.motivi.some(m => /più del necessario/.test(m)), 'non lo scrive fra i motivi');
  deve(v.motivi.some(m => /Ne bastano/.test(m)), 'non dice quanto basterebbe');
  return 'copre il ' + Math.round(v.sovracopertura.quota * 100) + '%, ne bastano ' + v.sovracopertura.minimoMensile + ' €';
});

prova('il minimo indicato copre davvero il divario, e non di più', () => {
  const v = P.valutaSoluzione(persona(), 1100);
  const col = P.valutaSoluzione(persona(), v.sovracopertura.minimoMensile);
  deve(col.coperturaDivario >= 0.999, 'il minimo indicato non copre il divario: ' + col.coperturaDivario);
  const unoInMeno = P.valutaSoluzione(persona(), v.sovracopertura.minimoMensile - 10);
  deve(unoInMeno.coperturaDivario < 1, 'anche dieci euro in meno bastavano: il minimo è più alto del necessario');
});

prova('su un versamento giusto non si inventa una sovracopertura', () => {
  for (const v of [50, 150, 210]) {
    deve(!P.valutaSoluzione(persona(), v).sovracopertura, v + ' €/mese risulta sovracopertura e non lo è');
  }
});

prova('l\'avviso arriva sul foglio, accanto al giudizio', () => {
  // È lì che si legge «adeguata» e ci si ferma.
  const p = persona();
  const h = P.reportPrevidenza({ prospettiva: p, valutazione: P.valutaSoluzione(p, 1100),
    cliente: { nome: 'Prova' }, consulente: { nome: 'F. Oddo', ruolo: 'Intermediario', rui: 'X', email: 'a@b.it', telefono: '1' },
    dataRiferimento: '4 settembre 2026' }).html;
  deve(/più del necessario/.test(h), 'il foglio non avvisa della sovracopertura');
  deve(/Ne bastano/.test(h), 'il foglio non dice quanto basterebbe');
  deve(h.indexOf('più del necessario') < h.indexOf('Il giudizio'), 'l\'avviso non sta accanto al giudizio');
});

/* ── L'IMPOSTA SOSTITUTIVA SUL TFR ───────────────────────────────────────── */

prova('il 17% porta la sua norma, non una nota di sviluppo', () => {
  /* La fonte che legge il cliente diceva «era 11% fino al 2014», che è la
     storia di come l'abbiamo cambiato noi, non il riferimento di legge. La
     nota storica resta nel codice, dove serve a chi rilegge. */
  const f = P.IPOTESI.aliqImpostaRival.fonte;
  deve(/D\.Lgs\. 47\/2000/.test(f), 'la fonte non cita il decreto');
  deve(/190\/2014/.test(f), 'la fonte non cita la legge che l\'ha portata al 17%');
  deve(/1° gennaio 2015/.test(f), 'la fonte non dice da quando è in vigore');
  deve(!/11%/.test(f), 'la fonte contiene ancora la nota storica sul valore precedente');
  deve(P.IPOTESI.aliqImpostaRival.daConfermare !== true, 'risulta ancora da confermare');
  return f.slice(0, 60) + '…';
});

/* ── LE CINQUE GESTIONI ──────────────────────────────────────────────────── */

prova('computo, dovuta e a carico sono tre numeri distinti', () => {
  /* Confonderli produce due conti sbagliati insieme: il montante con
     l'aliquota sbagliata e l'imponibile con la quota sbagliata. Per il
     commerciante la dovuta è più alta del computo; per il dipendente e per il
     collaboratore la quota a carico è una frazione della dovuta. */
  const g = P.FISCO.gestioni;
  deve(g.commercianti.dovuta > g.commercianti.computo, 'il commerciante non versa più di quanto gli viene computato');
  deve(g.dipendenti_privati.aCarico < g.dipendenti_privati.dovuta / 2, 'al dipendente si addebita più della sua quota');
  deve(vicino(g.gs_collaboratori.aCarico, g.gs_collaboratori.dovuta / 3, 1e-6),
    'al collaboratore non si addebita un terzo');
  deve(g.gs_professionisti.aCarico === g.gs_professionisti.dovuta, 'il professionista non paga tutto lui');
});

prova('la forbice fra lordo e imponibile cambia molto con la gestione', () => {
  // È la cosa che spiega perché due persone con lo stesso lordo pagano
  // imposte molto diverse, e per questo si mostra fra le ipotesi.
  const dip = P.forbiceContributiva(30000, 'dipendenti_privati');
  const pro = P.forbiceContributiva(30000, 'gs_professionisti');
  deve(pro.imponibile < dip.imponibile - 4000, 'la forbice del professionista non è più larga');
  deve(pro.quota > 0.25 && dip.quota < 0.10, 'le due quote non sono quelle attese');
  return 'su 30.000 lordi: dipendente ' + Math.round(dip.imponibile) + ' €, professionista ' + Math.round(pro.imponibile) + ' €';
});

prova('il montante si costruisce con il COMPUTO, non con la dovuta', () => {
  const comm = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026, gestione: 'commercianti' });
  const art = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026, gestione: 'artigiani' });
  /* Commerciante e artigiano hanno lo stesso computo (24%) e dovute diverse:
     la pensione deve essere identica, l'imponibile no. */
  deve(vicino(comm.pensioneAnnua, art.pensioneAnnua, 0.01), 'la dovuta è finita nel montante');
  deve(comm.persona.contributi.imponibile < art.persona.contributi.imponibile, 'la dovuta non tocca l\'imponibile');
});

prova('il collaboratore prende la detrazione da lavoro DIPENDENTE', () => {
  // È in gestione separata ma il suo è reddito assimilato a lavoro dipendente.
  deve(P.eDaLavoroAutonomo('gs_collaboratori') === false, 'il collaboratore risulta lavoratore autonomo');
  deve(P.eDaLavoroAutonomo('gs_professionisti') === true, 'il professionista non risulta autonomo');
  deve(P.eDaLavoroAutonomo('dipendenti_pubblici') === false, 'il dipendente pubblico risulta autonomo');
  deve(P.detrazioneLavoro(25000, 'gs_collaboratori') === P.detrazioneLavoro(25000, 'dipendenti_privati'),
    'al collaboratore non spetta la detrazione da lavoro dipendente');
});

prova('sei opzioni esposte, e la gestione rara resta fuori', () => {
  /* È un caso raro: una domanda in più la pagherebbero tutti. Resta in
     tabella e si tratta correggendo l'aliquota nel passo delle ipotesi. */
  const g = P.FISCO.gestioni;
  deve(g.gs_con_altra_copertura, 'la gestione è sparita');
  deve(g.gs_con_altra_copertura.esposta === false, 'viene esposta nello step 2');
  const esposte = Object.keys(g).filter(k => g[k].esposta);
  deve(esposte.length === 6, 'le opzioni esposte non sono sei: ' + esposte.length);
  deve(!esposte.includes('gs_con_altra_copertura'), 'la gestione rara viene esposta');
  deve(g.artigiani.dovuta !== g.commercianti.dovuta,
    'artigiani e commercianti hanno la stessa dovuta: allora bastava un\'opzione sola');
});

prova('una correzione a mano dell\'aliquota vince ancora sulla gestione', () => {
  // È così che si tratta il caso raro senza una domanda in più per tutti.
  const dati = { eta: 40, etaPensionamento: 67, redditoAnnuo: 30000, anniContributiGia: 15,
    annoRiferimento: 2026, gestione: 'artigiani' };
  const normale = P.prospettivaPensionistica(dati);
  const corretto = P.prospettivaPensionistica(dati, { aliqContributivaAutonomo: 0.30 });
  deve(corretto.pensioneAnnua > normale.pensioneAnnua, 'la correzione a mano non ha effetto');
});

prova('il dipendente pubblico dichiara che TFR e datoriale non sono modellati', () => {
  /* Gli assunti dal 2001 sono in regime TFR e possono aderire ai fondi di
     comparto; i precedenti hanno il TFS. Sono regole proprie: non modellarle è
     una scelta, tacerla no. */
  const g = P.FISCO.gestioni.dipendenti_pubblici;
  deve(/non modellate/.test(g.tfr), 'il TFR del pubblico non è dichiarato come non modellato');
  deve(/non modellate/.test(g.datoriale), 'il datoriale del pubblico non è dichiarato');
  deve(g.canale === false, 'il canale datoriale viene mostrato al dipendente pubblico');
  const p = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026, gestione: 'dipendenti_pubblici' });
  const h = P.reportPrevidenza({ prospettiva: p, valutazione: P.valutaSoluzione(p, 100),
    cliente: { nome: 'P' }, consulente: { nome: 'F', ruolo: 'I', rui: 'X', email: 'a@b.it', telefono: '1' },
    dataRiferimento: '4 settembre 2026' }).html;
  deve(/non modellate/.test(h), 'il foglio non dice che TFR e datoriale del pubblico non sono modellati');
});

prova('il canale si mostra solo dove un datore che versa esiste', () => {
  const g = P.FISCO.gestioni;
  deve(g.dipendenti_privati.canale === true, 'il dipendente privato non vede il canale');
  for (const k of ['dipendenti_pubblici', 'artigiani', 'commercianti', 'gs_professionisti', 'gs_collaboratori']) {
    deve(g[k].canale === false, k + ' vede una domanda senza risposta');
  }
});

prova('il vecchio booleano continua a funzionare', () => {
  // Mezzo modulo passa ancora «autonomo: true/false».
  deve(P.gestioneDi(true).etichetta === 'Artigiano', 'true non è più artigiano');
  deve(P.gestioneDi(false).etichetta === 'Dipendente privato', 'false non è più dipendente privato');
  deve(P.gestioneDi('boh').etichetta === 'Dipendente privato', 'una gestione sconosciuta non ripiega');
});

/* ── I LIMITI CHE GIULIA HA TROVATO (circolari INPS 2026) ────────────────── */

prova('il minimale morde sui redditi bassi degli autonomi', () => {
  /* Chi guadagna 12.000 € versa come se ne avesse 18.808: ignorarlo faceva
     uscire contributi troppo bassi proprio dove l'imponibile conta di più.
     Il minimo che ne esce, 4.521 €, è quello stampato nella circolare. */
  const a = P.forbiceContributiva(12000, 'artigiani');
  deve(a.alMinimale === true, 'il minimale non viene applicato');
  deve(Math.abs(a.contributi - 4521.36) < 1, 'il contributo minimo non è quello della circolare: ' + a.contributi);
  deve(a.imponibile < 12000 * 0.8, 'l\'imponibile non risente del minimale');
  // Il dipendente non ha questo minimale: il suo è giornaliero e sta in busta.
  deve(P.forbiceContributiva(12000, 'dipendenti_privati').alMinimale === false,
    'il minimale degli autonomi viene applicato anche al dipendente');
  return 'artigiano a 12.000 €: contributi ' + Math.round(a.contributi) + ' €, imponibile ' + Math.round(a.imponibile) + ' €';
});

prova('l\'1% oltre la prima fascia vale anche per artigiani e commercianti', () => {
  // Non è solo dei dipendenti: INPS lo calcola anche per loro e lo tratta
  // come contributo IVS (art. 3-ter D.L. 384/1992).
  const g = P.FISCO.gestioni;
  for (const k of ['artigiani', 'commercianti']) {
    deve(g[k].oltrePrimaFascia === 0.01, k + ' non ha l\'1% oltre la prima fascia');
    const sotto = P.forbiceContributiva(g[k].primaFascia, k);
    const sopra = P.forbiceContributiva(g[k].primaFascia + 10000, k);
    const senzaScalino = sotto.contributi + 10000 * g[k].aCarico;
    deve(sopra.contributi > senzaScalino + 90, k + ': lo scalino dell\'1% non viene applicato');
  }
});

prova('il contributo maternità è un importo fisso, non un\'aliquota', () => {
  // Sette euro e quarantaquattro: piccoli, ma dovuti anche da chi sta al
  // minimale, e in un conto che si firma ci vanno.
  const g = P.FISCO.gestioni;
  deve(g.artigiani.fissoAnnuo === 7.44 && g.commercianti.fissoAnnuo === 7.44, 'manca il contributo maternità');
  deve(!g.gs_professionisti.fissoAnnuo, 'la gestione separata non ha il fisso e glielo si addebita');
  // e non si applica a chi non ha reddito
  deve(P.contributiObbligatori(0, 'artigiani') === 0, 'si addebita il fisso anche a reddito zero');
});

prova('sopra il massimale non si versa più', () => {
  const g = P.FISCO.gestioni.commercianti;
  const dentro = P.forbiceContributiva(g.massimale, 'commercianti');
  const fuori = P.forbiceContributiva(g.massimale + 50000, 'commercianti');
  deve(Math.abs(dentro.contributi - fuori.contributi) < 0.01, 'oltre il massimale continua a versare');
  deve(fuori.alMassimale === true, 'non segnala di essere oltre il massimale');
});

prova('lo 0,48% del commerciante non entra nel montante', () => {
  /* È l'indennizzo per la cessazione dell'attività: si versa ma non alimenta
     la pensione. Per questo il computo resta 24% come l'artigiano. */
  const g = P.FISCO.gestioni;
  deve(g.commercianti.computo === g.artigiani.computo, 'i due computi sono diversi');
  deve(g.commercianti.dovuta - g.artigiani.dovuta > 0.004, 'lo scarto dello 0,48% è sparito');
  deve(/indennizzo/i.test(g.commercianti.fonte), 'la fonte non dice da dove nasce lo scarto');
});

prova('la gestione non confermata su fonte ufficiale lo dichiara', () => {
  /* Gli unici due valori che Giulia non ha potuto leggere su documento INPS
     sono quelli del dipendente pubblico: chi firma il foglio deve saperlo. */
  const g = P.FISCO.gestioni;
  deve(g.dipendenti_pubblici.certezza === 'secondaria', 'il pubblico risulta confermato e non lo è');
  for (const k of ['artigiani', 'commercianti', 'gs_professionisti', 'gs_collaboratori']) {
    deve(g[k].certezza === 'ufficiale', k + ' non risulta confermato');
    deve(/[Cc]ircolare INPS/.test(g[k].fonte), k + ' non cita la circolare');
  }
  const p = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026, gestione: 'dipendenti_pubblici' });
  deve(p.avvisi.some(a => /non sono state riscontrate su un documento ufficiale/.test(a)),
    'non avvisa che le aliquote del pubblico non sono confermate');
  const priv = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026, gestione: 'dipendenti_privati' });
  deve(!priv.avvisi.some(a => /non sono state riscontrate/.test(a)), 'avvisa anche su una gestione confermata');
});

/* ── LE DETRAZIONI NON SI MUOVONO CON IL VERSAMENTO ──────────────────────── */

prova('le detrazioni art. 13 stanno sul reddito COMPLESSIVO, non sull\'imponibile', () => {
  /* Art. 13 TUIR: la detrazione è rapportata al reddito complessivo. Gli oneri
     deducibili (art. 10) abbassano l'imponibile ma NON il reddito complessivo,
     quindi versare al fondo non fa salire la detrazione.

     Questa prova esiste per fallire il giorno in cui qualcuno le ricalcola
     sull'imponibile: sembrerebbe una semplificazione innocua e regalerebbe al
     cliente un beneficio che non ha. Il caso di prova è scelto nella fascia in
     cui la detrazione DECRESCE, dove lo sbaglio si vedrebbe eccome.
     (chiesto da Francesco il 04/09/2026) */
  const versato = 2400;
  for (const g of ['dipendenti_privati', 'gs_collaboratori', 'gs_professionisti', 'artigiani']) {
    for (const lordo of [20000, 26000, 30000, 35000, 45000]) {
      const r = P.risparmioDaDeduzione(lordo, versato, g);
      deve(r.senza.detrazioneDaLavoro === r.con.detrazioneDaLavoro,
        g + ' a ' + lordo + ' €: la detrazione da lavoro cambia col versamento (' +
        r.senza.detrazioneDaLavoro.toFixed(2) + ' → ' + r.con.detrazioneDaLavoro.toFixed(2) +
        '): sta venendo calcolata sull\'imponibile invece che sul reddito complessivo');
      deve(r.senza.ulterioreDetrazione === r.con.ulterioreDetrazione,
        g + ' a ' + lordo + ' €: l\'ulteriore detrazione cambia col versamento');
      deve(r.senza.redditoComplessivo === r.con.redditoComplessivo,
        g + ' a ' + lordo + ' €: il reddito complessivo cambia col versamento');
      deve(r.con.imponibile < r.senza.imponibile, g + ' a ' + lordo + ' €: l\'imponibile non scende');
    }
  }

  /* E la prova ha davvero mordente: se le detrazioni si calcolassero
     sull'imponibile, in questa fascia cambierebbero di parecchio. Il numero
     qui sotto è quanto verrebbe regalato al cliente. */
  const lordo = 26000;
  const r = P.risparmioDaDeduzione(lordo, versato, 'dipendenti_privati');
  const sbagliata = P.detrazioneLavoro(r.con.imponibile, 'dipendenti_privati');
  const giusta = P.detrazioneLavoro(r.senza.redditoComplessivo, 'dipendenti_privati');
  deve(sbagliata - giusta > 100,
    'il caso di prova non ha mordente: calcolarle sull\'imponibile cambierebbe solo di ' +
    (sbagliata - giusta).toFixed(2) + ' €');
  return 'calcolarle sull\'imponibile regalerebbe ' + Math.round(sbagliata - giusta) + ' € di detrazione a 26.000 € lordi';
});

/* ── IL CASO DOCUMENTATO ─────────────────────────────────────────────────── */

prova('il documento di formazione è ancora quello che il motore produce', () => {
  /* È materiale che i collaboratori studiano: se invecchia in silenzio,
     insegna cose false. Non si scrive a mano — lo genera il motore — e questa
     prova controlla che il file nel repository sia ancora aggiornato.
     Se fallisce: node server/verifica/casi/genera-salti-di-scaglione.mjs */
  const fs2 = require('fs');
  const path2 = require('path');
  const dove = path2.join(process.cwd(), 'server/verifica/casi/salti-di-scaglione.md');
  deve(fs2.existsSync(dove), 'il caso documentato non c\'è più');
  const scritto = fs2.readFileSync(dove, 'utf8');
  deve(scritto.indexOf(P.VERSIONE_REGOLE) >= 0,
    'il documento porta una versione delle regole diversa da quella del motore: va rigenerato');
  /* Due numeri a campione, per non fidarsi della sola versione. */
  const r = P.risparmioDaDeduzione(30000, 2400, 'gs_collaboratori');
  deve(scritto.indexOf(Math.round(r.senza.dovutoNetto).toLocaleString('it-IT', { useGrouping: 'always' })) >= 0,
    'i numeri del documento non corrispondono più a quelli del motore: rigeneralo');
  return 'allineato alla versione ' + P.VERSIONE_REGOLE;
});

/* ── esecuzione ──────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' IRPEF previdenza: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
