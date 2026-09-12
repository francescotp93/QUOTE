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
const P = require('../../tariffe/motore/irpef.js');

const esiti = [];
const prova = (nome, fn) => { try { esiti.push([true, nome, fn() || '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };
const vicino = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 0.01 : eps);
const pc = (n) => ((Number(n) || 0) * 100).toFixed(2) + '%';
const eur = (n) => Math.round(n).toLocaleString('it-IT') + ' €';

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


prova('in nessun punto si somma un\'aliquota contributiva a una fiscale', () => {
  /* L'audit chiesto da Francesco il 04/09/2026. L'unico punto in cui i due
     mondi si incontrano è la base imponibile: i contributi si TOLGONO dal
     reddito, e le aliquote non si sommano mai fra loro. */
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(process.cwd(), 'tariffe/motore/irpef.js'), 'utf8')
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


/* ── Quello che arriva al modulo ─────────────────────────────────────────── */


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


/* ── SOVRACOPERTURA ──────────────────────────────────────────────────────── */

const persona = () => P.prospettivaPensionistica({ eta: 33, etaPensionamento: 67, redditoAnnuo: 24000,
  anniContributiGia: 9, annoRiferimento: 2026 });


/* ── L'IMPOSTA SOSTITUTIVA SUL TFR ───────────────────────────────────────── */


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

/* ── RIPRESE DAL VECCHIO BANCO (12/09/2026) ───────────────────────────────
   Tre prove che stavano nella suite del motore vecchio e provavano fatti
   FISCALI, non il flusso a cinque passi. Il flusso se n'è andato; i fatti no,
   e senza queste resterebbero scoperti. Riscritte contro le funzioni che
   sopravvivono. */

prova('il canale di versamento NON cambia il beneficio fiscale, e lo dice', () => {
  /* Decisione di Francesco del 04/09/2026. Un primo giro faceva scendere il
     reddito complessivo nel canale «tramite datore» e la detrazione da lavoro
     — che a quel reddito è commisurata — saliva: a 24.000 euro il beneficio
     risultava del 32,2% invece del 23%. Il beneficio è lo stesso; a cambiare è
     QUANDO si incassa e a cosa dà accesso. */
  for (const lordo of [16000, 24000, 35000, 60000]) {
    const r = P.risparmioDaDeduzione(lordo, 2400, 'dipendenti_privati');
    deve(isFinite(r.risparmio), 'risparmio non calcolabile a ' + lordo);
  }
  const datore = P.differenzeCanale('datore');
  const diretto = P.differenzeCanale('diretto');
  deve(datore.beneficioFiscale === diretto.beneficioFiscale,
    'i due canali dichiarano benefici fiscali diversi: è tornata l\'aliquota gonfiata del canale «tramite datore»');
  deve(/stesso/i.test(datore.beneficioFiscale),
    'il modulo non dice esplicitamente che il beneficio è lo stesso nei due canali: chi legge penserà che ce n\'è uno migliore');
  deve(datore.punti.some(x => /datore di lavoro/i.test(x)), 'il canale «datore» non nomina il contributo datoriale');
  deve(diretto.punti.some(x => /dichiarazione/i.test(x)), 'il canale diretto non dice che il beneficio arriva con la dichiarazione dell\'anno dopo');
  return 'beneficio identico, differenze dichiarate su tempi e accessi';
});

prova('ogni gestione porta la sua certezza e la sua fonte, e chi non è confermato lo dichiara', () => {
  /* Un\'aliquota letta su una fonte secondaria e una letta su circolare non
     valgono uguale, e chi firma un foglio deve poterlo sapere. */
  const pubblico = P.forbiceContributiva(30000, 'dipendenti_pubblici');
  deve(pubblico.certezza === 'secondaria',
    'il dipendente pubblico non è più marcato «secondaria»: la ripartizione 24,20/8,80 non è mai stata letta su documento ufficiale');
  deve(/DA VERIFICARE/i.test(pubblico.fonte || ''), 'la fonte del dipendente pubblico non porta più l\'avviso');
  const privato = P.forbiceContributiva(30000, 'dipendenti_privati');
  deve(privato.certezza === 'ufficiale', 'il dipendente privato ha perso la marcatura «ufficiale»');
  deve(/INPS/.test(privato.fonte || ''), 'la fonte del dipendente privato non cita la circolare INPS');
  return 'pubblico «secondaria» con avviso, privato «ufficiale» con circolare';
});

prova('chi non ha TFR né datoriale lo dichiara, invece di lasciare il campo vuoto', () => {
  /* Un campo vuoto in un confronto lo legge come «zero» chi lo guarda di
     fretta, e come «non lo sappiamo» chi lo guarda con calma: nessuna delle
     due è quello che si vuole dire. */
  const pubblico = P.forbiceContributiva(30000, 'dipendenti_pubblici');
  deve(/non modellat/i.test(pubblico.tfr || ''), 'il dipendente pubblico non dichiara che il suo TFR segue regole proprie');
  deve(/non modellat/i.test(pubblico.datoriale || ''), 'il dipendente pubblico non dichiara che il datoriale segue regole proprie');
  const artigiano = P.forbiceContributiva(30000, 'artigiani');
  deve(artigiano.tfr === 'no' && artigiano.datoriale === 'no', 'l\'artigiano non dichiara di non avere TFR né datoriale');
  return 'pubblico «regole proprie», artigiano «no»: nessun campo muto';
});

/* ══ LA TASSAZIONE SEPARATA DEL TFR (art. 19 c. 1 TUIR) ════════════════
   Decide se al cliente conviene portare il TFR nel fondo. Era la riga del
   foglio scritta «tipicamente sopra il 20%»: vera in media, falsa per il
   singolo — e il foglio lo firma un singolo. */

prova('l\'aliquota del TFR si calcola sul reddito di riferimento, non sul TFR', () => {
  /* Il reddito di riferimento e' (TFR / anni) × 12: è quello che decide lo
     scaglione. Due TFR molto diversi, maturati in tempi proporzionati, danno
     la STESSA aliquota — se cosi' non fosse, il conto starebbe usando il
     montante invece del riferimento. */
  const a = P.tassazioneSeparataTfr(50000, 30);
  const b = P.tassazioneSeparataTfr(100000, 60);
  deve(vicino(a.aliquota, b.aliquota, 1e-9),
    'stesso reddito di riferimento, aliquote diverse: ' + pc(a.aliquota) + ' contro ' + pc(b.aliquota));
  deve(vicino(a.redditoRiferimento, 20000, 0.01), 'reddito di riferimento sbagliato: ' + a.redditoRiferimento);
  return 'riferimento ' + Math.round(a.redditoRiferimento) + ' € → ' + pc(a.aliquota);
});

prova('l\'aliquota del TFR sale col reddito, e a mano torna', () => {
  /* Il caso si rifa' a mano: 20.000 € di riferimento stanno tutti nel primo
     scaglione, quindi l'aliquota media è esattamente il 23%. */
  const basso = P.tassazioneSeparataTfr(50000, 30);        // riferimento 20.000
  deve(vicino(basso.aliquota, 0.23, 1e-9), 'sotto i 28.000 l\'aliquota media non è il 23%: ' + pc(basso.aliquota));
  /* 120.000 € di TFR su 30 anni → riferimento 48.000: 28.000 al 23% e 20.000
     al 33% = 6.440 + 6.600 = 13.040 → 27,1̅6̅%. */
  const alto = P.tassazioneSeparataTfr(120000, 30);
  deve(vicino(alto.redditoRiferimento, 48000, 0.01), 'riferimento sbagliato: ' + alto.redditoRiferimento);
  const atteso = (28000 * 0.23 + 20000 * 0.33) / 48000;
  deve(vicino(alto.aliquota, atteso, 1e-9),
    'aliquota diversa dal conto a mano: ' + pc(alto.aliquota) + ' invece di ' + pc(atteso));
  deve(alto.aliquota > basso.aliquota, 'l\'aliquota non sale col reddito');
  return pc(basso.aliquota) + ' a 20.000 €, ' + pc(alto.aliquota) + ' a 48.000 €';
});

prova('l\'imposta è l\'aliquota per TUTTO il TFR, e il netto torna', () => {
  const t = P.tassazioneSeparataTfr(60000, 30);
  deve(vicino(t.imposta, 60000 * t.aliquota, 0.01), 'l\'imposta non è l\'aliquota per il TFR');
  deve(vicino(t.netto + t.imposta, 60000, 0.01), 'netto e imposta non ricompongono il TFR');
  return eur(t.imposta) + ' su 60.000 €';
});

prova('meno di un anno di servizio non gonfia l\'aliquota', () => {
  /* Dividere per zero (o per mezzo anno) produrrebbe un reddito di
     riferimento enorme e l'aliquota massima: un numero falso che rende il
     fondo piu' conveniente di quanto sia. Si tiene il pavimento a un anno. */
  for (const anni of [0, -5, null, undefined, NaN, 0.5]) {
    const t = P.tassazioneSeparataTfr(10000, anni);
    deve(t.anniServizio >= 1, 'anni di servizio sotto l\'uno con ' + String(anni) + ': ' + t.anniServizio);
    deve(t.aliquota <= 0.43, 'aliquota fuori scala con ' + String(anni) + ': ' + pc(t.aliquota));
  }
  return 'pavimento a un anno, nessuna aliquota inventata';
});

prova('un TFR a zero non produce imposta né aliquota', () => {
  const t = P.tassazioneSeparataTfr(0, 30);
  deve(t.imposta === 0 && t.aliquota === 0, 'un TFR a zero produce imposta o aliquota');
  return 'zero resta zero';
});

/* ── esecuzione ──────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' IRPEF: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
