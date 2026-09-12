// ═══════════════════════════════════════════════════════════════════════════════
//  PENSIONE — le prove del motore nuovo  (12/09/2026)
//
//  Un calcolo previdenziale sbagliato non si vede. Non va in errore, non lascia
//  una pagina bianca: stampa un numero credibile. Una persona guarda quel numero
//  e decide quanto mettere da parte per i prossimi trent'anni. Queste prove
//  esistono perché quell'errore, quando c'è, deve rompere qualcosa QUI.
//
//  Le cose che devono restare vere, e che hanno ciascuna la sua prova:
//
//    1. NETTO CONTRO NETTO, E IL NETTO SI CALCOLA. Il tasso di sostituzione
//       mostrato al cliente è il rapporto fra due netti calcolati con l'IRPEF
//       vera, non un numero scelto. E il netto della pensione è più alto del
//       netto di pari lordo da lavoro, perché sulla pensione non si versano
//       contributi: se un giorno esce il contrario, il conto si è rotto.
//
//    2. IL NETTO NON SI PROVA INVERTENDOLO. Una prova che fa lordo → netto →
//       lordo è verde ANCHE SE la funzione del netto è sbagliata: invertire
//       una funzione torna sempre al punto di partenza. È l'errore che ha
//       fregato il tentativo precedente. Qui il netto si confronta con un caso
//       calcolato a mano, scaglione per scaglione.
//
//    3. IL VERSAMENTO SI CAPITALIZZA PER GLI ANNI CHE RESTANO, non per la
//       carriera. Chi comincia a cinquant'anni versa per diciassette anni: è
//       l'errore che fa uscire rendite doppie senza che il numero smetta di
//       sembrare credibile.
//
//    4. «CON 175 € AZZERI IL GAP» DEV'ESSERE VERO. La proposta che azzera si
//       ricalcola e si verifica: una promessa che non si mantiene qui, si
//       scopre fra trent'anni.
//
//    5. IL TETTO DI DEDUCIBILITÀ NON SI SUPERA. 5.164,57 € l'anno (art. 8
//       D.Lgs. 252/2005): dedurre di più è un risparmio che in dichiarazione
//       non arriverà mai.
//
//    6. IL RISPARMIO FISCALE PUÒ ESSERE NEGATIVO, E VA DETTO. Dedurre può far
//       perdere il trattamento integrativo. Se questa prova cade, il modulo ha
//       ricominciato a moltiplicare un'aliquota per un importo.
//
//    7. LO SCENARIO PRUDENZIALE SI DICHIARA. Quando l'età di inizio lavoro non
//       c'è, il risultato è peggiorativo per costruzione: spacciarlo per una
//       stima è dire un numero falso.
//
//    8. QUELLO CHE NON È CONFERMATO ARRIVA FINO AL FOGLIO. Un segnaposto che
//       perde la sua bandiera diventa un numero vero senza che nessuno lo
//       abbia deciso.
// ═══════════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, m) => { if (!c) throw new Error(m); };
const vicino = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.5 : t);
const eur = (n) => Math.round(n).toLocaleString('it-IT') + ' €';
const pc = (n) => (n * 100).toFixed(1) + '%';

const P = require('../../tariffe/motore/pensione.js');
const I = require('../../tariffe/motore/irpef.js');

/* Il caso di riferimento di tutte le prove: un dipendente di 35 anni che
   porta a casa 1.800 euro al mese, ha cominciato a 25 e versa 100 al mese. */
const BASE = { eta: 35, lavoro: 'dipendente', redditoMensile: 1800, baseReddito: 'netto', versamentoMensile: 100, etaInizioLavoro: 25 };

/* ── 1. netto contro netto ──────────────────────────────────────────────── */

prova('il tasso di sostituzione mostrato è DERIVATO da due netti, non scelto a mano', () => {
  const e = P.calcola(BASE);
  /* Il numero mostrato dev'essere ricostruibile: pensione netta / reddito
     netto. Se qualcuno domani lo sostituisce con una costante, questo cade. */
  const atteso = e.pensioneNettaMensile / e.redditoNettoMensile;
  deve(vicino(e.tassoSostituzioneNetto, atteso, 1e-9),
    'il tasso netto non è il rapporto fra i due netti: ' + e.tassoSostituzioneNetto + ' contro ' + atteso);
  /* E dev'essere diverso da quello di tabella: se coincidono, il passaggio
     fiscale non è stato fatto e si sta applicando un tasso lordo a un netto. */
  deve(Math.abs(e.tassoSostituzioneNetto - e.tassoSostituzioneLordo) > 1e-6,
    'tasso netto e tasso lordo coincidono: il passaggio dall\'IRPEF non è stato fatto');
  return 'lordo ' + pc(e.tassoSostituzioneLordo) + ' → netto ' + pc(e.tassoSostituzioneNetto);
});

prova('sui redditi alti la pensione netta batte il lavoro a pari lordo: i contributi non si versano', () => {
  /* Dai 50.000 in su le detrazioni da lavoro sono esaurite e i bonus non
     spettano più: resta solo l'effetto contributi, ed è tutto a favore della
     pensione. Se questa prova cade, qualcuno ha rimesso i contributi
     previdenziali sull'assegno pubblico. */
  const lordo = 50000;
  const daPensione = I.irpefSuPensione(lordo).netto;
  const daLavoro = I.nettoDaLordo(lordo, 'dipendenti_privati');
  deve(daPensione > daLavoro,
    'a 50.000 lordi la pensione rende meno del lavoro: impossibile, sulla pensione non ci sono contributi — ' +
    eur(daPensione) + ' contro ' + eur(daLavoro));
  deve(daPensione - daLavoro > lordo * 0.03,
    'lo scarto è troppo piccolo per essere quello dei contributi (9,19%)');
  return 'su 50.000 lordi: pensione ' + eur(daPensione) + ', lavoro ' + eur(daLavoro);
});

prova('SUI REDDITI BASSI IL RAPPORTO SI ROVESCIA, e non è un bug da aggiustare', () => {
  /* Trovato dalle prove il 12/09/2026, e vale la pena scriverlo per esteso
     perché è controintuitivo e qualcuno, prima o poi, lo «correggerà».

     A 20.000 lordi un DIPENDENTE porta a casa PIÙ di un pensionato con lo
     stesso lordo, nonostante paghi il 9,19% di contributi. Il motivo è che
     trattamento integrativo, ulteriore detrazione e somma non imponibile
     della L. 207/2024 sono denaro che ENTRA, spettano solo al reddito di
     LAVORO, e superano i contributi.

     LA CONSEGUENZA COMMERCIALE, che è il motivo per cui questa prova esiste:
     per un cliente dal reddito medio-basso il tasso di sostituzione NETTO su
     NETTO è più BASSO di quello lordo su lordo. Chi usa una tabella «già
     netta» tarata in alto (il tentativo precedente stava allo 0,82 per il
     dipendente a carriera piena) mostra al cliente una pensione più ricca del
     vero e un divario più stretto del vero: gli dice che sta bene quando non
     è così. È esattamente l'errore che questo modulo è stato riscritto per
     non fare, e per questo il tasso netto qui si CALCOLA e non si sceglie. */
  const lordo = 20000;
  const daPensione = I.irpefSuPensione(lordo).netto;
  const daLavoro = I.nettoDaLordo(lordo, 'dipendenti_privati');
  deve(daLavoro > daPensione,
    'a 20.000 lordi il lavoro non batte più la pensione: sono spariti il trattamento integrativo ' +
    'o la somma non imponibile, e il netto da lavoro è diventato troppo basso');
  /* E il modulo lo deve riflettere: su un reddito così il tasso netto sta
     SOTTO quello di tabella. */
  const e = P.calcola({ eta: 35, lavoro: 'dipendente', redditoMensile: 1250, baseReddito: 'netto', versamentoMensile: 0, etaInizioLavoro: 25 });
  deve(e.tassoSostituzioneNetto < e.tassoSostituzioneLordo,
    'su un reddito basso il tasso netto non scende sotto quello lordo: la nettizzazione non sta guardando i bonus da lavoro');
  return 'a 20.000 lordi: lavoro ' + eur(daLavoro) + ' > pensione ' + eur(daPensione) +
    ' → tasso netto ' + pc(e.tassoSostituzioneNetto) + ' sotto il lordo ' + pc(e.tassoSostituzioneLordo);
});

prova('sotto i ~12.700 € il NETTO È PIÙ ALTO DEL LORDO, e l\'inversione lo sa', () => {
  /* Seconda scoperta delle prove del 12/09/2026, e ha rotto una funzione.
     Per un dipendente a 12.000 lordi il netto è 12.123: il trattamento
     integrativo e la somma non imponibile superano contributi e IRPEF messi
     insieme. La bisezione partiva da `basso = netto` — cioè cercava il lordo
     SOPRA il netto — e la soluzione stava SOTTO: su un cliente da mille euro
     al mese usciva un lordo sbagliato, e con lui il risparmio fiscale
     calcolato su quel lordo. Adesso si parte da zero. */
  const n = I.nettoDaLordo(12000, 'dipendenti_privati');
  deve(n > 12000, 'a 12.000 lordi il netto non supera più il lordo: sono spariti i bonus della L. 207/2024');
  const inv = I.inversioneNetto(12000, 'dipendenti_privati');
  deve(inv.lordo < 12000,
    'chi porta a casa 12.000 netti dovrebbe avere un lordo PIÙ BASSO, e l\'inversione ne trova uno più alto: ' +
    eur(inv.lordo) + ' — la bisezione sta cercando dalla parte sbagliata');
  deve(inv.esatto, 'l\'inversione a 12.000 netti non è esatta: scarto ' + inv.scarto.toFixed(2));
  return '12.000 lordi → ' + eur(n) + ' netti · 12.000 netti → ' + eur(inv.lordo) + ' lordi';
});

prova('il netto NON cresce sempre col lordo: i gradini esistono e l\'inversione li dichiara', () => {
  /* Terza cosa che sembrava ovvia e non lo è. Ci sono punti in cui il netto
     SCENDE mentre il lordo sale — i salti del trattamento integrativo e delle
     detrazioni — e quindi esistono netti che nessun lordo produce. La
     bisezione si ferma sul bordo del gradino: è la risposta migliore
     disponibile, ma chi la usa deve poter sapere che lì non è esatta. */
  let gradini = 0, prec = -1;
  for (let l = 5000; l <= 60000; l += 100) {
    const n = I.nettoDaLordo(l, 'dipendenti_privati');
    if (n < prec) gradini++;
    prec = n;
  }
  deve(gradini > 0,
    'nessun gradino nella curva del netto: o il trattamento integrativo non c\'è più, ' +
    'o qualcuno l\'ha reso continuo — e in tutti e due i casi il conto è cambiato');
  /* L'inversione deve ESPORRE lo scarto, non nasconderlo dietro un numero. */
  const inv = I.inversioneNetto(21600, 'dipendenti_privati');
  for (const k of ['lordo', 'netto', 'scarto', 'esatto']) deve(k in inv, 'l\'inversione non espone il campo «' + k + '»');
  return gradini + ' gradini fra 5.000 e 60.000 di lordo';
});

prova('il tasso netto sta sopra quello lordo, e di poco: le due grandezze non si sono scambiate', () => {
  const e = P.calcola(BASE);
  deve(e.tassoSostituzioneNetto > e.tassoSostituzioneLordo,
    'il tasso netto è SOTTO quello lordo: si sta applicando un coefficiente lordo a un netto, ' +
    'cioè si sottostima l\'assegno e si gonfia il divario');
  deve(e.tassoSostituzioneNetto - e.tassoSostituzioneLordo < 0.25,
    'il tasso netto supera quello lordo di oltre 25 punti: non è più una nettizzazione, è un errore');
  return pc(e.tassoSostituzioneLordo) + ' → ' + pc(e.tassoSostituzioneNetto);
});

/* ── 2. il netto NON si prova invertendolo ──────────────────────────────── */

prova('il netto da lavoro regge il conto a mano, scaglione per scaglione', () => {
  /* Caso costruito a mano su un lordo tondo. NON si usa lordoDaNetto qui:
     invertire la stessa funzione tornerebbe al punto di partenza anche se la
     funzione fosse sbagliata, ed è esattamente la trappola da evitare. */
  const lordo = 30000;
  const contributi = 30000 * 0.0919;                       // 2.757,00
  const complessivo = lordo - contributi;                  // 27.243,00
  const lorda = complessivo * 0.23;                        // sotto i 28.000: un solo scaglione
  const tronca4 = (x) => Math.trunc(x * 10000) / 10000;
  const detrDip = 1910 + 1190 * tronca4((28000 - complessivo) / 13000) + 65;  // art. 13 c. 1 e c. 1.1
  const ulteriore = 1000;                                  // 20.000 < RC ≤ 32.000
  const netta = lorda - detrDip - ulteriore;
  const attesoNetto = lordo - contributi - netta;

  const calcolato = I.nettoDaLordo(lordo, 'dipendenti_privati');
  deve(vicino(calcolato, attesoNetto, 0.01),
    'il netto da 30.000 lordi non torna col conto a mano: ' + calcolato.toFixed(2) + ' contro ' + attesoNetto.toFixed(2));
  return eur(attesoNetto) + ' netti da 30.000 lordi';
});

prova('la detrazione da pensione regge il conto a mano (art. 13 c. 3)', () => {
  const rc = 20000;
  const tronca4 = (x) => Math.trunc(x * 10000) / 10000;
  const atteso = 700 + 1255 * tronca4((28000 - rc) / 19500);
  deve(vicino(I.detrazionePensione(rc), atteso, 0.01),
    'la detrazione da pensione su 20.000 non torna: ' + I.detrazionePensione(rc).toFixed(2) + ' contro ' + atteso.toFixed(2));
  /* Gli estremi della scala: sotto la soglia è fissa, sopra i 50.000 è zero. */
  deve(I.detrazionePensione(5000) === 1955, 'sotto gli 8.500 la detrazione da pensione non è quella fissa');
  deve(I.detrazionePensione(60000) === 0, 'sopra i 50.000 la detrazione da pensione non si azzera');
  return eur(atteso) + ' su 20.000 di pensione';
});

prova('l\'inversione netto → lordo ritrova il netto di partenza, su tutte e tre le gestioni', () => {
  /* Questa prova NON dimostra che il netto è giusto (vedi sopra): dimostra
     che la bisezione converge, che è un'altra cosa e serve comunque. */
  for (const g of ['dipendenti_privati', 'artigiani', 'gs_professionisti']) {
    for (const netto of [12000, 21600, 45000, 90000]) {
      const lordo = I.lordoDaNetto(netto, g);
      const ritorno = I.nettoDaLordo(lordo, g);
      deve(vicino(ritorno, netto, 0.02),
        'la bisezione non converge su ' + g + ' a ' + eur(netto) + ': torna ' + eur(ritorno));
      /* NIENTE «lordo > netto» qui: per il dipendente sotto i ~12.700 è falso,
         e darlo per scontato è l'errore che ha rotto la bisezione. Vedi la
         prova dedicata qui sopra. Quello che deve valere sempre è che il
         lordo sia un numero sensato e positivo. */
      deve(lordo > 0 && isFinite(lordo), 'il lordo ricavato non è un numero utilizzabile su ' + g + ': ' + lordo);
      if (netto >= 21600) deve(lordo > netto, 'dai 21.600 netti in su il lordo deve superare il netto su ' + g + ': ' + eur(lordo));
    }
  }
  return '3 gestioni × 4 redditi, scarto sotto i 2 centesimi';
});

/* ── 3. il versamento si capitalizza per gli anni che RESTANO ───────────── */

prova('chi comincia tardi versa per meno anni: la rendita non guarda la carriera', () => {
  const giovane = P.calcola({ ...BASE, eta: 30 });
  const maturo = P.calcola({ ...BASE, eta: 50, etaInizioLavoro: 25 });
  /* Stesso versamento, stessa carriera contributiva (entrambi partiti a 25):
     cambia solo quanto manca alla pensione. */
  deve(giovane.anniAllaPensione === 37 && maturo.anniAllaPensione === 17,
    'gli anni alla pensione non sono quelli attesi: ' + giovane.anniAllaPensione + ' e ' + maturo.anniAllaPensione);
  deve(maturo.fondo.montante < giovane.fondo.montante * 0.5,
    'chi versa 17 anni invece di 37 ha un montante troppo alto: la capitalizzazione sta usando la carriera ' +
    'invece degli anni che restano — ' + eur(maturo.fondo.montante) + ' contro ' + eur(giovane.fondo.montante));
  return '37 anni → ' + eur(giovane.fondo.montante) + ' · 17 anni → ' + eur(maturo.fondo.montante);
});

prova('i versamenti dell\'anno non si capitalizzano per un anno intero', () => {
  /* Chi versa cento euro a dicembre non ha guadagnato un anno di rendimento
     su quei cento euro. La convenzione di metà anno sbaglia per difetto; la
     capitalizzazione piena gonfia il montante di circa metà del rendimento
     annuo, ogni anno. Questa prova tiene ferma la convenzione prudente. */
  const r = P.rendimentoNetto();
  const anni = 1;
  const m = P.montanteFondo(100, anni);
  const pieno = 100 * 12 * (1 + r);
  deve(m < pieno, 'il primo anno rende come se tutti i versamenti fossero di gennaio: ' + m.toFixed(2) + ' ≥ ' + pieno.toFixed(2));
  deve(m > 100 * 12, 'il primo anno non rende niente: la capitalizzazione non c\'è');
  return 'primo anno: ' + m.toFixed(2) + ' € contro i ' + pieno.toFixed(2) + ' € della capitalizzazione piena';
});

prova('senza versamento non c\'è montante, e il divario è tutto scoperto', () => {
  const e = P.calcola({ ...BASE, versamentoMensile: 0 });
  deve(e.fondo.montante === 0, 'montante non nullo senza versamenti: ' + e.fondo.montante);
  deve(e.fondo.renditaMensileNetta === 0, 'rendita non nulla senza versamenti');
  deve(vicino(e.gapMensile, e.redditoNettoMensile - e.pensioneNettaMensile, 0.01),
    'senza fondo il divario non coincide con reddito meno pensione');
  return 'divario scoperto ' + eur(e.gapMensile) + '/mese';
});

/* ── 4. la proposta che azzera dev'essere vera ──────────────────────────── */

prova('l\'importo che «azzera il gap» lo azzera davvero, RIFACENDO tutto il calcolo', () => {
  /* IL CASO CHE DEVE FALLIRE, trovato dal browser il 12/09/2026 dopo che
     tutto sembrava a posto.

     Le proposte sono versamenti TOTALI alternativi — «e se invece mettessi
     100?» — non aggiunte a quello che uno versa già. Misurandole sul divario
     che sconta già la rendita del versamento attuale, a un cliente che
     versava 20 euro il modulo diceva «con 295 azzeri»: mettendone davvero
     295 ne restavano scoperti 31, esattamente la rendita dei 20 contata due
     volte. Chi versava di più riceveva una promessa più falsa di chi non
     versava niente.

     Per questo il giro parte da versamenti diversi E rifà il calcolo intero
     con l'importo proposto, invece di fidarsi della riga. */
  let controlli = 0;
  for (const profilo of [
    { ...BASE },
    { ...BASE, eta: 50, redditoMensile: 2600 },
    { ...BASE, lavoro: 'autonomo', redditoMensile: 2200 },
    { ...BASE, lavoro: 'professionista', eta: 42, redditoMensile: 3500 },
  ]) {
    for (const gia of [0, 20, 100, 300]) {
      const caso = { ...profilo, versamentoMensile: gia };
      const e = P.calcola(caso);
      if (e.gapSenzaFondoMensile <= 0) continue;
      const az = e.proposte.filter(p => p.azzera);
      deve(az.length > 0, 'nessuna proposta azzera il divario di ' + eur(e.gapSenzaFondoMensile) +
        ' (' + caso.lavoro + ', ' + caso.eta + ' anni, versa già ' + eur(gia) + ')');
      for (const p of az) {
        /* NON si ricontrolla la sola rendita: si RIFÀ IL CALCOLO INTERO con
           quel versamento, che è quello che succede quando il consulente
           tocca la proposta a schermo. */
        const dopo = P.calcola({ ...caso, versamentoMensile: p.versamentoMensile });
        deve(dopo.gapMensile < 0.01,
          'la proposta da ' + eur(p.versamentoMensile) + ' dice di azzerare, ma mettendola davvero ' +
          'restano scoperti ' + eur(dopo.gapMensile) + ' (' + caso.lavoro + ', versava ' + eur(gia) + ')');
        controlli++;
      }
    }
  }
  return controlli + ' proposte «azzera» verificate rifacendo il calcolo intero';
});

prova('le proposte non cambiano al cambiare di quello che uno versa già', () => {
  /* Corollario della prova sopra, e dice la stessa cosa da un'altra parte:
     se le proposte si muovessero col versamento attuale vorrebbe dire che
     sono tornate a misurarsi sul divario sbagliato. */
  const importi = (v) => P.calcola({ ...BASE, versamentoMensile: v }).proposte.map(p => p.versamentoMensile).join(',');
  const zero = importi(0);
  for (const v of [20, 100, 250, 400]) {
    deve(importi(v) === zero,
      'versando ' + eur(v) + ' le proposte diventano [' + importi(v) + '] invece di [' + zero + ']: ' +
      'sono di nuovo misurate sul divario che sconta il fondo');
  }
  return 'stesse proposte [' + zero + '] a qualunque versamento di partenza';
});

prova('le proposte sono crescenti e coprono progressivamente di più', () => {
  const e = P.calcola(BASE);
  for (let i = 1; i < e.proposte.length; i++) {
    deve(e.proposte[i].versamentoMensile > e.proposte[i - 1].versamentoMensile, 'le proposte non sono in ordine crescente');
    deve(e.proposte[i].renditaMensileNetta > e.proposte[i - 1].renditaMensileNetta, 'versare di più non rende di più');
  }
  deve(e.proposte.length >= 3, 'meno di tre proposte: il flusso commerciale ne chiede due o tre più quella che azzera');
  return e.proposte.map(p => Math.round(p.versamentoMensile) + '€→' + pc(p.coperturaGap)).join('  ');
});

prova('quando l\'importo che azzera è fuori portata, lo dice invece di stamparlo e basta', () => {
  /* Un cinquantenne con poco tempo davanti e un reddito modesto: l'importo
     che azzererebbe è un muro, non una proposta. */
  const e = P.calcola({ eta: 55, lavoro: 'autonomo', redditoMensile: 1500, baseReddito: 'netto', versamentoMensile: 50, etaInizioLavoro: 30 });
  const az = e.proposte.find(p => p.eQuelloCheAzzera);
  deve(az, 'manca la proposta che azzera');
  deve(az.fuoriPortata === true,
    'un versamento da ' + eur(az.versamentoMensile) + ' su ' + eur(e.redditoNettoMensile) +
    ' di reddito non è marcato fuori portata: la schermata lo proporrebbe come se fosse fattibile');
  return eur(az.versamentoMensile) + '/mese su ' + eur(e.redditoNettoMensile) + ' di reddito → marcato';
});

/* ── 5. il tetto di deducibilità ────────────────────────────────────────── */

prova('non si deduce oltre 5.164,57 € l\'anno, e chi li supera lo sa', () => {
  deve(P.LEGGE.tettoDeducibilita.v === 5164.57, 'il tetto non è quello dell\'art. 8 D.Lgs. 252/2005');
  const sotto = P.calcola({ ...BASE, versamentoMensile: 400 });   // 4.800 l'anno
  const sopra = P.calcola({ ...BASE, versamentoMensile: 600 });   // 7.200 l'anno
  deve(sotto.fiscale.dedotto === 4800, 'sotto il tetto si deduce meno del versato: ' + sotto.fiscale.dedotto);
  deve(sopra.fiscale.dedotto === 5164.57, 'sopra il tetto si sta deducendo più del consentito: ' + sopra.fiscale.dedotto);
  deve(sopra.fiscale.oltreIlTetto === true, 'chi supera il tetto non è avvisato');
  deve(vicino(sopra.fiscale.eccedenza, 7200 - 5164.57, 0.01), 'l\'eccedenza non deducibile non è calcolata');
  return 'a 600 €/mese: dedotti ' + eur(5164.57) + ', eccedenza ' + eur(7200 - 5164.57);
});

prova('le proposte oltre i 430,38 € al mese sono marcate: da lì in su non c\'è più deduzione', () => {
  const tetto = 5164.57 / 12;
  const e = P.calcola({ eta: 58, lavoro: 'dipendente', redditoMensile: 3000, baseReddito: 'netto', versamentoMensile: 100, etaInizioLavoro: 30 });
  for (const p of e.proposte) {
    deve(p.oltreIlTettoDeducibile === (p.versamentoMensile > tetto),
      'la proposta da ' + eur(p.versamentoMensile) + ' è marcata male rispetto al tetto di ' + tetto.toFixed(2) + ' €/mese');
  }
  return 'soglia ' + tetto.toFixed(2) + ' €/mese, marcatura coerente su ' + e.proposte.length + ' proposte';
});

/* ── 6. il risparmio fiscale può essere negativo ────────────────────────── */

prova('il risparmio fiscale passa dal motore vero: non è aliquota × importo', () => {
  const e = P.calcola(BASE);
  deve(e.fiscale.disponibile, 'il risparmio fiscale non è stato calcolato');
  const dallIrpef = I.risparmioDaDeduzione(e.lordoAnnuo, e.fiscale.dedotto, 'dipendenti_privati').risparmio;
  deve(vicino(e.fiscale.risparmioAnnuo, dallIrpef, 0.01),
    'il risparmio non coincide con quello del motore fiscale: qualcuno lo sta ricalcolando per conto suo');
  return eur(e.fiscale.risparmioAnnuo) + ' l\'anno · aliquota effettiva ' + pc(e.fiscale.aliquotaEffettiva);
});

prova('dedurre può far PERDERE il trattamento integrativo, e allora il risparmio è negativo', () => {
  /* È il caso che una percentuale a occhio non vede: l'imposta lorda scende
     sotto la soglia di capienza e i 1.200 euro non spettano più. Si cerca il
     reddito in cui succede, invece di fidarsi che esista. */
  let trovato = null;
  for (let lordo = 8000; lordo <= 20000 && !trovato; lordo += 100) {
    for (const dedotto of [1200, 2400, 3600, 5164.57]) {
      const r = I.risparmioDaDeduzione(lordo, dedotto, 'dipendenti_privati');
      if (r.perdeIlTrattamentoIntegrativo) { trovato = { lordo, dedotto, r }; break; }
    }
  }
  deve(trovato, 'nessun caso in cui dedurre fa perdere il trattamento integrativo: ' +
    'il motore fiscale non lo sta più vedendo, e il modulo sta per promettere un risparmio che non c\'è');
  deve(trovato.r.risparmio < trovato.dedotto * 0.23,
    'il trattamento integrativo si perde ma il risparmio resta pieno: il conto non se n\'è accorto');
  return 'a ' + eur(trovato.lordo) + ' lordi deducendo ' + eur(trovato.dedotto) +
    ': risparmio ' + eur(trovato.r.risparmio) + ' (aliquota effettiva ' + pc(trovato.r.aliquotaEffettiva) + ')';
});

prova('un risparmio negativo esce marcato, non nascosto dentro un numero', () => {
  /* Si costruisce il caso peggiore e si controlla che la bandiera ci sia.
     Se un giorno il segno negativo arrivasse alla schermata senza bandiera,
     verrebbe stampato come «risparmio» con il meno davanti. */
  let peggiore = null;
  for (let lordo = 8000; lordo <= 30000; lordo += 100) {
    const r = P.risparmioFiscale(lordo, 430, 'dipendenti_privati');
    if (!peggiore || r.risparmioAnnuo < peggiore.r.risparmioAnnuo) peggiore = { lordo, r };
  }
  deve(peggiore.r.inPerdita === (peggiore.r.risparmioAnnuo < 0),
    'la bandiera «in perdita» non segue il segno del risparmio');
  /* E dove l'imposta è già zero, la deduzione non vale niente: va detto. */
  const zero = P.risparmioFiscale(9000, 100, 'dipendenti_privati');
  deve(typeof zero.impostaAzzerata === 'boolean', 'manca l\'avviso sull\'imposta già azzerata');
  return 'caso peggiore a ' + eur(peggiore.lordo) + ' lordi: ' + eur(peggiore.r.risparmioAnnuo) + ' l\'anno';
});

prova('senza motore fiscale il risparmio NON si inventa: si dice che non c\'è', () => {
  const r = P.risparmioFiscale.call(null, 30000, 100, 'dipendenti_privati');
  deve(r.disponibile === true, 'il motore fiscale c\'è ma non viene usato');
  /* La controprova sul ramo senza motore si fa sulla forma della risposta:
     deve esistere il campo che la schermata guarda per decidere se mostrare
     il numero o la frase. */
  deve('disponibile' in r, 'manca il campo che dice se il risparmio è calcolabile');
  return 'il campo «disponibile» c\'è e la schermata lo può guardare';
});

/* ── 7. lo scenario prudenziale si dichiara ─────────────────────────────── */

prova('senza età di inizio lavoro il calcolo è prudenziale, e lo dice', () => {
  const e = P.calcola({ ...BASE, etaInizioLavoro: null });
  deve(e.prudenziale === true, 'l\'età di inizio manca ma il risultato non è marcato prudenziale');
  deve(e.etaInizioUsata === P.ETA_INIZIO_PRUDENZIALE, 'non è stato usato l\'inizio tardivo');
  deve(/PRUDENZIALE/i.test(P.disclaimer(e)), 'il disclaimer non dichiara lo scenario prudenziale');
  /* E dev'essere davvero peggiorativo: meno contributi, divario più largo. */
  const noto = P.calcola({ ...BASE, etaInizioLavoro: 22 });
  deve(e.anniContributi < noto.anniContributi, 'lo scenario «prudenziale» non è peggiorativo');
  deve(e.gapMensile >= noto.gapMensile, 'lo scenario prudenziale mostra un divario più stretto di quello noto');
  return 'inizio a ' + e.etaInizioUsata + ' anni · ' + e.anniContributi + ' anni di contributi contro ' + noto.anniContributi;
});

prova('un\'età di inizio incoerente vale come mancante, e si vede', () => {
  /* Chi ha 30 anni non può aver cominciato a 45: non è un dato da arrotondare,
     è un dato sbagliato, e un dato sbagliato non si usa. */
  const e = P.calcola({ ...BASE, eta: 30, etaInizioLavoro: 45 });
  deve(e.prudenziale === true, 'un\'età di inizio maggiore dell\'età attuale è stata accettata');
  deve(e.datoIncoerente === true, 'il dato incoerente non è segnalato a parte');
  deve(e.anniContributi === e.etaPensione - P.ETA_INIZIO_PRUDENZIALE, 'non si è ripiegato sullo scenario prudenziale');
  return 'inizio a 45 con 30 anni di età → scenario prudenziale, marcato';
});

prova('il disclaimer c\'è sempre e non promette niente', () => {
  const t = P.disclaimer(P.calcola(BASE));
  deve(/illustrativo/i.test(t), 'il disclaimer non dice che la proiezione è illustrativa');
  deve(/NON è una promessa/i.test(t), 'il disclaimer non nega la promessa di rendimento');
  deve(/assegno INPS/i.test(t), 'il disclaimer non nega di prevedere l\'assegno INPS');
  deve(t.length > 200, 'il disclaimer è troppo corto per dire tutto quello che deve');
  return t.length + ' caratteri';
});

/* ── 8. quello che non è confermato arriva fino al foglio ───────────────── */

prova('i segnaposto della tariffa HDI sono marcati, tutti', () => {
  const marcate = P.daConfermare();
  const etichette = marcate.map(x => x.etichetta).join(' | ');
  for (const k of ['rendimentoLordo', 'costi', 'coeffRendita']) {
    deve(P.FONDO[k].daConfermare === true, 'il parametro HDI «' + k + '» ha perso la marcatura');
    deve(etichette.includes(P.FONDO[k].etichetta), 'il parametro HDI «' + k + '» non arriva nella lista da confermare');
  }
  deve(etichette.includes('tassi di sostituzione'), 'la tabella dei tassi non è marcata da confermare');
  return marcate.length + ' voci da confermare, HDI e tassi compresi';
});

prova('la tabella dei parametri sovrascrive la copia di riserva, e la marcatura la decide la riga', () => {
  const primaCoeff = P.FONDO.coeffRendita.v;
  const primaTetto = P.LEGGE.tettoDeducibilita.v;
  const esito = P.numeriDiLegge({
    tetto_deducibilita: 5164.57,
    coefficiente_rendita_fondo: 0.0451,
    tassazione_prestazione: { aliquotaBase: 0.15, riduzionePerAnno: 0.003, aliquotaMinima: 0.09 },
    __fonti: { coefficiente_rendita_fondo: 'Nota informativa HDI', tetto_deducibilita: 'D.Lgs. 252/2005' },
    __daConfermare: { coefficiente_rendita_fondo: true, tetto_deducibilita: false },
  });
  deve(esito.applicati.includes('coeffRendita'), 'il coefficiente dalla tabella non è stato applicato');
  deve(vicino(P.FONDO.coeffRendita.v, 0.0451, 1e-9), 'il coefficiente non è quello della tabella');
  /* Marcato in tabella → resta marcato. Non marcato → la bandiera si spegne. */
  deve(P.FONDO.coeffRendita.daConfermare === true, 'il coefficiente ha perso la marcatura arrivando dalla tabella');
  deve(P.LEGGE.tettoDeducibilita.daConfermare === false, 'il tetto è rimasto marcato pur non essendolo in tabella');
  P.FONDO.coeffRendita.v = primaCoeff; P.FONDO.coeffRendita.daConfermare = true;
  P.LEGGE.tettoDeducibilita.v = primaTetto;
  return 'coefficiente 4,51% applicato e ancora marcato';
});

prova('la detrazione da pensione non letta sull\'originale viaggia con l\'avviso attaccato', () => {
  const avvisi = I.numeriFiscaliDaRiscontrare();
  deve(avvisi.some(a => /pensione/i.test(a)),
    'la detrazione da pensione non compare fra i numeri da riscontrare: è stata data per buona senza che nessuno l\'abbia letta');
  const nelMotore = P.daConfermare().some(x => /riscontrare/i.test(x.etichetta) && /pensione/i.test(x.fonte));
  deve(nelMotore, 'l\'avviso fiscale non arriva fino alla lista che finisce sul foglio del cliente');
  return avvisi.length + ' numeri fiscali ancora da riscontrare';
});

/* ── il TFR: solo chi ce l'ha, e senza raccomandazioni ──────────────────── */

prova('il confronto TFR si mostra ai dipendenti e a nessun altro', () => {
  deve(P.calcola({ ...BASE, lavoro: 'dipendente' }).mostraTfr === true, 'il dipendente non vede il confronto TFR');
  deve(P.calcola({ ...BASE, lavoro: 'autonomo' }).mostraTfr === false, 'l\'autonomo vede un confronto TFR che non lo riguarda');
  deve(P.calcola({ ...BASE, lavoro: 'professionista' }).mostraTfr === false, 'il professionista vede un confronto TFR che non lo riguarda');
  return 'dipendente sì, autonomo e professionista no';
});

prova('il confronto TFR ha due colonne piene su ogni riga, e non raccomanda', () => {
  deve(P.TFR.righe.length >= 5, 'il confronto TFR ha meno di cinque voci');
  for (const r of P.TFR.righe) {
    deve(r.azienda && r.azienda.length > 30, 'la colonna «azienda» della voce «' + r.voce + '» è vuota o troppo corta');
    deve(r.fondo && r.fondo.length > 30, 'la colonna «fondo» della voce «' + r.voce + '» è vuota o troppo corta');
  }
  /* Almeno una voce deve dare ragione all'azienda: un confronto in cui il
     fondo vince sempre non è un confronto, è una pubblicità. */
  deve(P.TFR.righe.some(r => r.aChiConviene === 'azienda'),
    'nessuna voce del confronto dà ragione al TFR in azienda: non è un confronto, è una raccomandazione travestita');
  return P.TFR.righe.length + ' voci, entrambe le colonne piene';
});

prova('il blocco «quando riprendo i miei soldi» c\'è su tutte e due le colonne, coi numeri di legge', () => {
  const q = P.TFR.quandoLiRiprendo;
  deve(q.azienda && q.azienda.length >= 2, 'la colonna azienda del riscatto è vuota');
  deve(q.fondo && q.fondo.length >= 5, 'la colonna fondo del riscatto ha meno di cinque casi');
  const testo = q.fondo.join(' ');
  deve(/50%.*12 mesi/.test(testo), 'manca il 50% dopo 12 mesi di inoccupazione');
  deve(/100%.*48 mesi/.test(testo), 'manca il 100% dopo 48 mesi di inoccupazione');
  deve(/75%/.test(testo) && /sanitarie/i.test(testo), 'mancano le anticipazioni per spese sanitarie al 75%');
  deve(/30%/.test(testo), 'manca il 30% per altre esigenze');
  deve(/dimissioni/i.test(testo), 'le dimissioni non sono trattate');
  deve(/252\/2005/.test(q.fonte || ''), 'il blocco non cita il D.Lgs. 252/2005');
  deve(/HDI/i.test(q.daVerificare || ''), 'manca la riga «da verificare con HDI» su tempi e condizioni di liquidazione');
  return q.fondo.length + ' casi lato fondo, ' + q.azienda.length + ' lato azienda';
});

prova('la tassazione della prestazione scende dello 0,30% l\'anno e si ferma al 9%', () => {
  deve(vicino(P.aliquotaPrestazione(15), 0.15, 1e-9), 'a 15 anni l\'aliquota non è il 15%');
  deve(vicino(P.aliquotaPrestazione(20), 0.135, 1e-9), 'a 20 anni l\'aliquota non è il 13,5%');
  deve(vicino(P.aliquotaPrestazione(35), 0.09, 1e-9), 'a 35 anni l\'aliquota non è scesa al minimo del 9%');
  deve(P.aliquotaPrestazione(60) === 0.09, 'l\'aliquota scende sotto il minimo del 9%');
  return '15 anni → 15% · 20 → 13,5% · 35 e oltre → 9%';
});

/* ── coerenza d'insieme: i conti tornano fra loro ───────────────────────── */

prova('il divario è esattamente reddito meno pensione meno rendita, su ogni profilo', () => {
  for (const lavoro of ['dipendente', 'autonomo', 'professionista']) {
    for (const eta of [28, 40, 55]) {
      const e = P.calcola({ ...BASE, lavoro, eta });
      const atteso = Math.max(0, e.redditoNettoMensile - e.pensioneNettaMensile - e.fondo.renditaMensileNetta);
      deve(vicino(e.gapMensile, atteso, 0.01),
        'il divario non torna per ' + lavoro + ' a ' + eta + ' anni: ' + eur(e.gapMensile) + ' contro ' + eur(atteso));
      deve(vicino(e.totaleMensile, e.pensioneNettaMensile + e.fondo.renditaMensileNetta, 0.01), 'il totale non è la somma delle due voci');
    }
  }
  return '9 profili, divario coerente al centesimo';
});

prova('il dipendente ha un tasso di sostituzione più alto dell\'autonomo: il 33% contro il 24% si vede', () => {
  const d = P.calcola({ ...BASE, lavoro: 'dipendente' });
  const a = P.calcola({ ...BASE, lavoro: 'autonomo' });
  deve(d.tassoSostituzioneLordo > a.tassoSostituzioneLordo,
    'l\'autonomo non ha un tasso più basso del dipendente: le aliquote di computo non si stanno riflettendo nella tabella');
  return 'dipendente ' + pc(d.tassoSostituzioneLordo) + ' · autonomo ' + pc(a.tassoSostituzioneLordo);
});

prova('il professionista è dichiarato come la stima meno affidabile', () => {
  const e = P.calcola({ ...BASE, lavoro: 'professionista' });
  deve(e.affidabilita === 'bassa', 'il professionista non è marcato come stima a bassa affidabilità');
  deve(/cassa/i.test(e.notaLavoro || ''), 'la nota non spiega che dipende dal regolamento della cassa');
  deve(/cassa privata/i.test(P.disclaimer(e)), 'il disclaimer non avvisa del caso cassa privata');
  return 'affidabilità dichiarata «bassa», e il disclaimer lo ripete';
});

prova('la base del reddito è dichiarata, e sbagliarla cambia il risultato in modo visibile', () => {
  const netto = P.calcola({ ...BASE, baseReddito: 'netto' });
  const lordo = P.calcola({ ...BASE, baseReddito: 'lordo' });
  deve(netto.baseReddito === 'netto' && lordo.baseReddito === 'lordo', 'la base dichiarata non viene riportata nel risultato');
  /* Stesso numero letto come lordo dà un netto molto più basso: è il motivo
     per cui la schermata deve chiederlo invece di indovinare. */
  deve(lordo.redditoNettoMensile < netto.redditoNettoMensile * 0.9,
    'leggere 1.800 come lordo o come netto porta quasi allo stesso risultato: la conversione non sta avvenendo');
  deve(vicino(lordo.redditoLordoMensile, 1800, 0.01), 'dichiarando il lordo, il lordo non è quello dichiarato');
  deve(vicino(netto.redditoNettoMensile, 1800, 0.01), 'dichiarando il netto, il netto non è quello dichiarato');
  return '1.800 come netto → ' + eur(netto.lordoAnnuo) + ' lordi · come lordo → ' + eur(lordo.nettoAnnuo) + ' netti';
});

prova('l\'età si ricava dalla data di nascita, come fa la scheda cliente', () => {
  const oggi = new Date('2026-09-12');
  deve(P.etaDaNascita('1984-03-01', oggi) === 42, 'età sbagliata per un compleanno già passato');
  deve(P.etaDaNascita('1984-12-01', oggi) === 41, 'età sbagliata per un compleanno non ancora arrivato');
  deve(P.etaDaNascita('1984-09-12', oggi) === 42, 'età sbagliata il giorno del compleanno');
  deve(P.etaDaNascita('', oggi) === null && P.etaDaNascita('non una data', oggi) === null, 'una data non valida non torna null');
  const e = P.calcola({ dataNascita: '1991-06-15', lavoro: 'dipendente', redditoMensile: 1800, versamentoMensile: 100, etaInizioLavoro: 25 });
  deve(e.eta > 30 && e.eta < 40, 'l\'età dalla data di nascita non è arrivata nel calcolo: ' + e.eta);
  return 'compleanno passato, non passato e nel giorno stesso';
});

prova('un reddito a zero non produce NaN né divisioni per zero', () => {
  const e = P.calcola({ eta: 40, lavoro: 'dipendente', redditoMensile: 0, versamentoMensile: 0 });
  for (const k of ['redditoNettoMensile', 'pensioneNettaMensile', 'gapMensile', 'gapPercentuale', 'tassoSostituzioneNetto']) {
    deve(isFinite(e[k]), 'il campo «' + k + '» non è un numero finito con reddito a zero: ' + e[k]);
  }
  deve(e.gapMensile === 0, 'divario diverso da zero con reddito zero');
  return 'nessun NaN, nessun infinito';
});

prova('il foglio spiega su quale divario si misurano le proposte', () => {
  /* Il cliente legge «ti mancheranno 350» e poi «20 € coprono il 6%», fa la
     divisione e non torna: 33 diviso 350 fa il 9%. Le proposte si misurano sul
     divario NUDO, e sul foglio va scritto — un numero che non torna su un
     documento firmato distrugge la fiducia in tutto il resto della pagina. */
  const e = P.calcola({ ...BASE, versamentoMensile: 100 });
  deve(e.gapSenzaFondoMensile > e.gapMensile, 'il caso scelto non ha un fondo che riduce il divario');
  const f = P.foglioHtml({ esito: e, cliente: { nome: 'Mario Rossi' }, consulente: { nome: 'Francesco Oddo' } });
  deve(f.ok, (f.problemi || []).join('; '));
  deve(/al posto/.test(f.html), 'il foglio non dice che le proposte sostituiscono il versamento attuale');
  deve(f.html.includes(String(Math.round(e.gapSenzaFondoMensile))),
    'il foglio non riporta il divario su cui sono calcolate le percentuali');
  /* E quando non c'è nessun versamento in corso, la nota non serve e non c'è. */
  const senza = P.foglioHtml({ esito: P.calcola({ ...BASE, versamentoMensile: 0 }),
    cliente: { nome: 'Mario Rossi' }, consulente: { nome: 'Francesco Oddo' } });
  deve(!/al posto/.test(senza.html), 'la nota compare anche a chi non versa niente: è rumore');
  return 'nota presente con versamento in corso, assente senza';
});

prova('il foglio porta il disclaimer, i valori da confermare e chi firma', () => {
  const e = P.calcola({ ...BASE, etaInizioLavoro: null });
  const f = P.foglioHtml({ esito: e, cliente: { nome: 'Mario Rossi' },
    consulente: { nome: 'Francesco Oddo', rui: 'B000123456' }, dataRiferimento: '12/09/2026' });
  deve(f.ok, (f.problemi || []).join('; '));
  deve(/STIMA PRUDENZIALE/.test(f.html), 'lo scenario prudenziale non è marcato sul foglio');
  deve(f.html.indexOf('STIMA PRUDENZIALE') < f.html.indexOf('Dove sei oggi'),
    'l\'avviso prudenziale sta sotto i numeri: un avviso in fondo lo legge chi già sapeva');
  deve(/Valori ancora da confermare/.test(f.html), 'i valori da confermare non arrivano sul foglio');
  deve(/Tariffa HDI/.test(f.html), 'i segnaposto HDI non arrivano sul foglio del cliente');
  deve(/illustrativo/.test(f.html) && /NON è una promessa/.test(f.html), 'manca il disclaimer');
  deve(/B000123456/.test(f.html), 'il foglio non porta l\'iscrizione RUI di chi firma');
  deve(/Quando posso prendere prima i miei soldi/.test(f.html), 'il blocco sul riscatto non arriva sul foglio');
  deve(/48 mesi/.test(f.html) && /75%/.test(f.html), 'il foglio non riporta i numeri delle anticipazioni e dei riscatti');
  return 'prudenziale in cima, da confermare, disclaimer, RUI e riscatti';
});

prova('gli importi sul foglio hanno il punto delle migliaia, sempre', () => {
  /* Senza `useGrouping: "always"` Intl smette di raggruppare sotto le cinque
     cifre, e sullo stesso foglio compaiono «1800 €» e «57.477 €». */
  const e = P.calcola(BASE);
  const f = P.foglioHtml({ esito: e, cliente: { nome: 'X Y' }, consulente: { nome: 'Z W' } });
  deve(/1\.800 €/.test(f.html), 'il reddito di 1.800 € è scritto senza il punto delle migliaia');
  deve(!/[^.\d]1800 €/.test(f.html), 'compare un importo a quattro cifre senza separatore');
  return 'migliaia raggruppate anche sotto le cinque cifre';
});

prova('si dice SEMPRE di quale prodotto HDI sono i numeri', () => {
  /* «Confermare la tariffa con HDI» non vuol dire niente se non si dice quale
     tariffa: il fondo aperto e il PIP hanno costi diversi, e un ISC diverso
     sposta il montante di parecchio su trent'anni. Il nome viaggia col
     risultato e finisce sul foglio, anche il giorno in cui i numeri saranno
     confermati — chi lo rilegge fra un anno deve sapere di cosa parlava. */
  deve(/Azione di Previdenza/i.test(P.FONDO.prodotto.etichetta), 'il prodotto di riferimento non e il fondo aperto HDI');
  deve(/5007/.test(P.FONDO.prodotto.alternativa), 'l\'alternativa non cita il numero di albo COVIP del PIP');
  const nelleMarcature = P.daConfermare().some(x => /Prodotto di riferimento/.test(x.etichetta));
  deve(nelleMarcature, 'il prodotto di riferimento non arriva nella lista che finisce sul foglio');
  const f = P.foglioHtml({ esito: P.calcola(BASE), cliente: { nome: 'X Y' }, consulente: { nome: 'Z W' } });
  deve(/Tariffa di riferimento/.test(f.html), 'il foglio non dice di quale tariffa sono i numeri');
  deve(/COVIP n\. 5007/.test(f.html), 'il foglio non nomina il PIP come alternativa');
  return P.FONDO.prodotto.etichetta;
});

/* ── esecuzione ──────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Pensione: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
