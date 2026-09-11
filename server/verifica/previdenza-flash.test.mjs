// ═══════════════════════════════════════════════════════════════════════════════
//  PREVIDENZA FLASH — quattro campi, due minuti
//
//  Un calcolo previdenziale sbagliato non si vede. Non va in errore, non lascia
//  una pagina bianca: stampa un numero credibile. Una persona guarda quel numero
//  e decide quanto mettere da parte per i prossimi trent'anni.
//
//  Semplificare il calcolo non rende quell'errore meno grave — lo rende più
//  facile. Le cose che devono restare vere:
//
//    1. NETTO SU NETTO. L'input è il reddito netto, e i tassi di sostituzione
//       pubblicati sono LORDI. Applicare un coefficiente lordo a un reddito
//       netto sottostima l'assegno e gonfia il divario: comodo per vendere,
//       indifendibile davanti a chiunque sappia leggere. La tabella è
//       dichiarata netta, e questa prova tiene ferma la dichiarazione.
//
//    2. IL VERSAMENTO SI CAPITALIZZA PER GLI ANNI CHE RESTANO, non per la
//       carriera. Chi comincia a cinquant'anni versa per diciassette anni, non
//       per quaranta: è l'errore che fa uscire rendite doppie, e non si vede
//       perché il numero resta credibile.
//
//    3. «CON 100 € AZZERI IL GAP» DEV'ESSERE VERO. Una proposta che non copre
//       quello che promette è la promessa che poi non si mantiene.
//
//    4. IL TETTO DI DEDUCIBILITÀ NON SI SUPERA. 5.164,57 € l'anno (art. 8
//       D.Lgs. 252/2005): dedurre di più è un risparmio fiscale che in
//       dichiarazione non arriverà.
//
//    5. LO SCENARIO PRUDENZIALE SI DICHIARA. Quando l'età di inizio lavoro non
//       c'è, il risultato è peggiorativo per costruzione: spacciarlo per una
//       stima è dire un numero falso.
//
//    6. IL RISPARMIO FISCALE NON SI INVENTA. Passa dal motore completo, che sa
//       del trattamento integrativo; senza motore si dice che non c'è.
// ═══════════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const esiti = [];
const prova = (nome, fn) => {
  try { fn(); esiti.push([true, nome, '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, m) => { if (!c) throw new Error(m); };
const vicino = (a, b, t) => Math.abs(a - b) <= (t || 0.5);

const F = require('../../tariffe/motore/previdenza-flash.js');
const MOTORE = require('../../tariffe/motore/previdenza.js');

/* ── 1. netto su netto ───────────────────────────────────────────────────── */

prova('la tabella dei tassi è dichiarata netta, e il calcolo la usa così', () => {
  /* Se un giorno qualcuno ci mette dentro i tassi lordi della Ragioneria
     (che per un dipendente a carriera piena stanno intorno al 70%), questa
     prova cade: sono sensibilmente più bassi dei netti. */
  const pieno = F.tassoSostituzione('dipendente', 40);
  deve(pieno >= 0.78 && pieno <= 0.90,
    'il tasso pieno del dipendente non è più netto su netto: ' + pieno +
    ' — con i tassi lordi si sottostima l\'assegno e si gonfia il divario');
  const r = F.calcola({ eta: 30, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 0 }, MOTORE);
  deve(vicino(r.pensionePubblicaMensile, 2000 * pieno),
    'la pensione non è il reddito netto per il tasso: ' + r.pensionePubblicaMensile);
});

prova('l\'autonomo prende meno del dipendente, a parità di carriera', () => {
  /* 24% di aliquota contro 33%: non è un'opinione, è quanto entra nel
     montante. Se un giorno i due coincidono, qualcuno ha copiato una riga. */
  for (const anni of [25, 30, 35, 40]) {
    const d = F.tassoSostituzione('dipendente', anni);
    const a = F.tassoSostituzione('autonomo', anni);
    deve(a < d, 'a ' + anni + ' anni l\'autonomo prende quanto il dipendente: ' + a + ' vs ' + d);
    deve(a / d > 0.55 && a / d < 0.85,
      'il rapporto fra autonomo e dipendente è fuori scala a ' + anni + ' anni: ' + (a / d).toFixed(2));
  }
});

prova('più anni di contributi, più pensione — mai il contrario', () => {
  for (const lavoro of ['dipendente', 'autonomo', 'professionista']) {
    let prec = -1;
    for (const anni of [10, 25, 30, 35, 40, 45]) {
      const t = F.tassoSostituzione(lavoro, anni);
      deve(t >= prec, lavoro + ': a ' + anni + ' anni il tasso scende (' + t + ' dopo ' + prec + ')');
      prec = t;
    }
  }
});

/* ── 2. gli anni che restano, non la carriera ───────────────────────────── */

prova('il versamento si capitalizza per gli anni che restano', () => {
  /* Stesso versamento, stessa carriera lunga, ma uno ha 30 anni e l'altro 55:
     al secondo restano 12 anni di versamenti, non 42. */
  const giovane = F.calcola({ eta: 30, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 100 }, MOTORE);
  const maturo  = F.calcola({ eta: 55, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 100 }, MOTORE);
  deve(giovane.anniAllaPensione === 37, 'anni alla pensione sbagliati per il giovane: ' + giovane.anniAllaPensione);
  deve(maturo.anniAllaPensione === 12, 'anni alla pensione sbagliati per il maturo: ' + maturo.anniAllaPensione);
  deve(giovane.fondo.renditaMensile > maturo.fondo.renditaMensile * 3,
    'chi versa per 37 anni non prende molto più di chi versa per 12: si sta capitalizzando la carriera invece degli anni che restano');
});

prova('e il versato totale è versamento × 12 × anni che restano', () => {
  const r = F.renditaFondo(100, 10, F.FONDO);
  deve(r.versatoTotale === 12000, 'il versato non torna: ' + r.versatoTotale);
  deve(r.montante > r.versatoTotale, 'il montante non supera il versato: il rendimento non viene applicato');
});

prova('zero versamento, zero rendita — e nessun NaN', () => {
  const r = F.calcola({ eta: 40, etaInizioLavoro: 22, lavoro: 'dipendente', redditoNettoMensile: 1800, versamentoMensile: 0 }, MOTORE);
  deve(r.fondo.renditaMensile === 0, 'senza versare esce una rendita: ' + r.fondo.renditaMensile);
  deve(isFinite(r.gapMensile) && r.gapMensile >= 0, 'il divario non è un numero: ' + r.gapMensile);
});

/* ── 3. le proposte devono essere vere ──────────────────────────────────── */

prova('la proposta che dice di azzerare il gap lo azzera davvero', () => {
  const r = F.calcola({ eta: 35, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 0 }, MOTORE);
  const azzera = r.proposte.filter(p => p.azzera);
  deve(azzera.length > 0, 'nessuna proposta arriva ad azzerare il divario');
  for (const p of azzera) {
    deve(p.renditaMensile >= r.gapMensile - 0.5,
      'dice di azzerare ' + Math.round(r.gapMensile) + ' € con ' + p.versamentoMensile +
      ' € al mese, ma la rendita è ' + Math.round(p.renditaMensile) + ' €');
  }
});

prova('e quelle che non lo azzerano non lo dicono', () => {
  const r = F.calcola({ eta: 55, etaInizioLavoro: 30, lavoro: 'autonomo', redditoNettoMensile: 2500, versamentoMensile: 0 }, MOTORE);
  for (const p of r.proposte) {
    if (!p.azzera) {
      deve(p.renditaMensile < r.gapMensile,
        p.versamentoMensile + ' € risulta insufficiente ma copre tutto il divario');
      deve(p.coperturaGap < 1, 'una proposta che non azzera dichiara copertura piena');
    }
  }
});

prova('la copertura non supera mai il 100%', () => {
  const r = F.calcola({ eta: 25, etaInizioLavoro: 20, lavoro: 'dipendente', redditoNettoMensile: 1200, versamentoMensile: 0 }, MOTORE);
  for (const p of r.proposte) {
    deve(p.coperturaGap <= 1, 'copertura oltre il 100%: ' + p.coperturaGap + ' — in pagina uscirebbe «130% del divario»');
  }
});

prova('le tre cifre d\'esempio ci sono sempre', () => {
  const r = F.calcola({ eta: 40, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 50 }, MOTORE);
  for (const v of [20, 50, 100]) {
    deve(r.proposte.some(p => p.versamentoMensile === v), 'manca la proposta da ' + v + ' €');
  }
});

prova('quando azzerare il gap è fuori portata, si dice', () => {
  /* Un autonomo con un divario del 40% dovrebbe versare 600 € al mese. È il
     numero onesto, e va mostrato — ma messo lì da solo è un muro, non una
     proposta: chi lo legge chiude il discorso. La schermata deve poter
     cambiare registro, e per farlo deve saperlo. */
  const r = F.calcola({ eta: 40, etaInizioLavoro: 28, lavoro: 'autonomo', redditoNettoMensile: 2500, versamentoMensile: 0 }, MOTORE);
  const azzera = r.proposte.find(p => p.eQuelloCheAzzera);
  deve(azzera, 'non viene proposto nessun importo che azzeri il divario');
  deve(azzera.fuoriPortata === true,
    'un versamento di ' + azzera.versamentoMensile + ' € al mese su 2.500 € netti non risulta fuori portata');
});

prova('e quando è alla portata, non si segnala come muro', () => {
  const r = F.calcola({ eta: 35, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 1800, versamentoMensile: 0 }, MOTORE);
  const azzera = r.proposte.find(p => p.eQuelloCheAzzera);
  if (azzera) {
    deve(azzera.fuoriPortata === false,
      azzera.versamentoMensile + ' € su 1.800 € netti risulta fuori portata: la soglia è troppo stretta');
  }
});

prova('e si dice anche quando supera il tetto di deducibilità', () => {
  /* 5.164,57 l'anno fanno 430 al mese: oltre, ogni euro versato non porta più
     risparmio fiscale. Mostrare «servono 710 al mese» senza dirlo fa sembrare
     il fondo molto meno conveniente di quello che è. */
  const r = F.calcola({ eta: 38, etaInizioLavoro: 30, lavoro: 'professionista', redditoNettoMensile: 3000, versamentoMensile: 0 }, MOTORE);
  const azzera = r.proposte.find(p => p.eQuelloCheAzzera);
  deve(azzera, 'manca la proposta che azzera');
  deve(azzera.versamentoMensile > F.TETTO_DEDUZIONE / 12, 'caso scelto male: non supera il tetto');
  deve(azzera.oltreIlTettoDeducibile === true,
    'non segnala che oltre ' + Math.round(F.TETTO_DEDUZIONE / 12) + ' € al mese non si deduce più');
});

/* ── 4. il tetto di deducibilità ────────────────────────────────────────── */

prova('non si deduce mai oltre 5.164,57 € l\'anno', () => {
  /* 600 € al mese fanno 7.200 l'anno: 2.035 sopra il tetto. Dedurli tutti
     mostrerebbe un risparmio che in dichiarazione non arriva. */
  const r = F.calcola({ eta: 40, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 3000, versamentoMensile: 600 }, MOTORE);
  deve(r.fiscale, 'il risparmio fiscale non viene calcolato');
  deve(vicino(r.fiscale.dedotto, F.TETTO_DEDUZIONE, 0.01),
    'ha dedotto oltre il tetto: ' + r.fiscale.dedotto);
  deve(r.fiscale.oltreIlTetto === true,
    'non avvisa che una parte del versamento non è deducibile: il cliente si aspetterebbe un risparmio più alto');
});

prova('e sotto il tetto si deduce tutto', () => {
  const r = F.calcola({ eta: 40, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 100 }, MOTORE);
  deve(vicino(r.fiscale.dedotto, 1200, 0.01), 'non deduce tutto il versato: ' + r.fiscale.dedotto);
  deve(r.fiscale.oltreIlTetto === false, 'segnala il tetto superato quando non lo è');
  deve(r.fiscale.risparmioAnnuo > 0, 'il risparmio fiscale è nullo su 1.200 € dedotti');
});

/* ── 5. lo scenario prudenziale si dichiara ─────────────────────────────── */

prova('senza età di inizio lavoro il risultato si marca prudenziale', () => {
  const r = F.calcola({ eta: 40, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 50 }, MOTORE);
  deve(r.prudenziale === true, 'non risulta prudenziale: passerebbe per una stima');
  deve(r.etaInizioUsata === F.ETA_INIZIO_PRUDENZIALE, 'non usa l\'inizio tardivo: ' + r.etaInizioUsata);
  deve(/prudenziale/i.test(F.disclaimer(true)), 'il disclaimer non dice che è uno scenario peggiorativo');
});

prova('ed è davvero peggiorativo, non solo marcato', () => {
  /* Se «prudenziale» fosse un'etichetta senza conseguenze sarebbe peggio che
     non averla: rassicurerebbe due volte. */
  const noto = F.calcola({ eta: 40, etaInizioLavoro: 22, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 0 }, MOTORE);
  const ignoto = F.calcola({ eta: 40, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 0 }, MOTORE);
  deve(ignoto.pensionePubblicaMensile < noto.pensionePubblicaMensile,
    'lo scenario «prudenziale» non è più basso di quello con i dati veri');
  deve(ignoto.gapMensile > noto.gapMensile, 'il divario prudenziale non è più ampio');
});

prova('un\'età di inizio impossibile si tratta come sconosciuta', () => {
  /* Inizio a 50 per chi oggi ne ha 35: è un dato sbagliato, non un caso da
     arrotondare. Usarlo darebbe 17 anni di contributi e una pensione da fame,
     credibile e falsa. */
  const r = F.calcola({ eta: 35, etaInizioLavoro: 50, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 0 }, MOTORE);
  deve(r.prudenziale === true, 'accetta un inizio lavoro successivo all\'età attuale');
  deve(r.etaInizioUsata === F.ETA_INIZIO_PRUDENZIALE, 'usa il dato sbagliato: ' + r.etaInizioUsata);
});

prova('con i dati completi il disclaimer non parla di scenario peggiorativo', () => {
  deve(!/prudenziale/i.test(F.disclaimer(false)),
    'dice «prudenziale» anche quando i dati ci sono: il disclaimer perde credibilità');
  deve(/non è una promessa/i.test(F.disclaimer(false)), 'manca il cuore del disclaimer');
  deve(/INPS/.test(F.disclaimer(false)), 'non dice che non è una previsione dell\'assegno INPS');
});

/* ── 6. il risparmio fiscale non si inventa ─────────────────────────────── */

prova('senza il motore completo non esce un risparmio inventato', () => {
  const r = F.calcola({ eta: 40, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 100 }, null);
  deve(r.fiscale === null,
    'ha calcolato un risparmio fiscale senza il motore che sa fare l\'IRPEF: ' + JSON.stringify(r.fiscale));
  deve(r.gapMensile >= 0, 'senza motore si rompe anche il resto del calcolo');
});

prova('dal netto al lordo si tolgono LE TASSE E I CONTRIBUTI, non solo le tasse', () => {
  /* Il difetto vero, trovato leggendo e non provando: `dovutoNetto` del motore
     è SOLO l'IRPEF — i contributi previdenziali stanno in `contributi`, a
     parte. Sottraendo solo il primo, il «netto» era lordo-meno-tasse, cioè
     circa il 9% sopra quello che arriva in busta a un dipendente, e il lordo
     ricavato usciva basso della stessa misura insieme al risparmio fiscale.

     E la prova di prima NON lo vedeva: invertiva la stessa funzione sbagliata
     e tornava sempre al punto di partenza. Qui si guarda il RAPPORTO, che è
     una cosa che si sa da fuori: un dipendente su 24.000 € netti sta intorno
     all'80% del lordo, mai al 90%. */
  const lordo = F.lordoDaNetto(24000, 'dipendente', MOTORE);
  const r = MOTORE.irpefNetta(lordo, 0, false);
  deve(vicino(lordo - r.contributi - r.dovutoNetto, 24000, 2),
    'il netto ricostruito non torna: ' + Math.round(lordo - r.contributi - r.dovutoNetto));
  deve(r.contributi > 0, 'i contributi non entrano nel conto: sono il 9,19% della retribuzione');
  const rapporto = 24000 / lordo;
  deve(rapporto < 0.86,
    'il netto è il ' + (rapporto * 100).toFixed(1) + '% del lordo: troppo alto per un dipendente, ' +
    'i contributi non vengono sottratti');
  deve(rapporto > 0.70, 'il netto è solo il ' + (rapporto * 100).toFixed(1) + '% del lordo: qualcosa si sottrae due volte');
});

prova('e un autonomo, a parità di netto, ha un lordo più alto', () => {
  /* 24% di contributi contro 9,19%: per portare a casa lo stesso netto deve
     fatturare sensibilmente di più. Se i due lordi coincidessero, vorrebbe
     dire che la gestione previdenziale non viene guardata. */
  const dip = F.lordoDaNetto(24000, 'dipendente', MOTORE);
  const aut = F.lordoDaNetto(24000, 'autonomo', MOTORE);
  deve(aut > dip * 1.15,
    'l\'autonomo ha quasi lo stesso lordo del dipendente (' + Math.round(aut) + ' contro ' +
    Math.round(dip) + '): i contributi della sua gestione non entrano');
});

prova('e il risparmio fiscale cresce col reddito, come l\'aliquota', () => {
  /* Controprova di buon senso sul giro completo: a parità di versamento, chi
     sta in uno scaglione più alto risparmia di più. Se i due coincidessero,
     il lordo non starebbe arrivando all'IRPEF. */
  const basso = F.calcola({ eta: 40, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 1500, versamentoMensile: 100 }, MOTORE);
  const alto  = F.calcola({ eta: 40, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 3500, versamentoMensile: 100 }, MOTORE);
  deve(alto.fiscale.risparmioAnnuo > basso.fiscale.risparmioAnnuo,
    'chi guadagna di più non risparmia di più: ' + Math.round(alto.fiscale.risparmioAnnuo) +
    ' contro ' + Math.round(basso.fiscale.risparmioAnnuo));
});

prova('e il trattamento integrativo perso viene riportato, non nascosto', () => {
  /* È il gradino che può rendere NEGATIVO il risparmio: versare costerebbe
     più del versamento. Il motore lo sa dire, e questo modulo deve passarlo. */
  const r = F.calcola({ eta: 40, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 1100, versamentoMensile: 200 }, MOTORE);
  deve(r.fiscale && 'perdeIlTrattamentoIntegrativo' in r.fiscale,
    'l\'avviso sul trattamento integrativo non arriva fino alla schermata');
  deve('impostaAzzerata' in r.fiscale, 'non si sa se la deduzione non vale niente perché l\'imposta è già zero');
});

/* ── 7. la tassazione della prestazione ─────────────────────────────────── */

prova('il 15% scende dello 0,3% oltre il quindicesimo anno, e si ferma al 9%', () => {
  deve(vicino(F.aliquotaPrestazione(10), 0.15, 1e-9), 'a 10 anni non è il 15%: ' + F.aliquotaPrestazione(10));
  deve(vicino(F.aliquotaPrestazione(15), 0.15, 1e-9), 'a 15 anni non è ancora il 15%');
  deve(vicino(F.aliquotaPrestazione(20), 0.135, 1e-9), 'a 20 anni non è il 13,5%: ' + F.aliquotaPrestazione(20));
  deve(vicino(F.aliquotaPrestazione(35), 0.09, 1e-9), 'a 35 anni non tocca il minimo: ' + F.aliquotaPrestazione(35));
  deve(vicino(F.aliquotaPrestazione(60), 0.09, 1e-9), 'oltre il minimo continua a scendere: sarebbe sotto il 9%');
});

/* ── 8. il confronto TFR ────────────────────────────────────────────────── */

prova('il TFR si mostra ai dipendenti e a nessun altro', () => {
  deve(F.calcola({ eta: 40, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 50 }, MOTORE).mostraTfr === true,
    'al dipendente non si mostra il confronto TFR');
  for (const l of ['autonomo', 'professionista']) {
    deve(F.calcola({ eta: 40, lavoro: l, redditoNettoMensile: 2000, versamentoMensile: 50 }, MOTORE).mostraTfr === false,
      'si mostra il TFR a un ' + l + ', che non ce l\'ha');
  }
});

prova('il confronto non raccomanda: mette a fianco', () => {
  const testo = JSON.stringify(F.TFR).toLowerCase();
  deve(!/conviene|consigliamo|meglio (il|lo|la) fondo|ti consiglio/.test(testo),
    'il confronto contiene una raccomandazione: la scelta sul TFR è del lavoratore');
  for (const r of F.TFR.righe) {
    deve(r.azienda && r.fondo, 'la riga «' + r.voce + '» ha una colonna vuota: sembrerebbe che da una parte non ci sia niente');
  }
});

prova('le quattro voci del confronto ci sono tutte', () => {
  const voci = F.TFR.righe.map(r => r.voce.toLowerCase()).join(' | ');
  for (const v of ['tassazione', 'rivalutazione', 'datore', 'anticipazioni']) {
    deve(voci.includes(v), 'manca la voce «' + v + '»: ' + voci);
  }
});

prova('e i numeri del TFR in azienda sono quelli di legge', () => {
  const az = F.TFR.righe.find(r => /rivalutazione/i.test(r.voce)).azienda;
  deve(/1,5%/.test(az) && /75%/.test(az),
    'la rivalutazione del TFR non riporta 1,5% + 75% dell\'inflazione (art. 2120 c.c.): ' + az);
});

/* ── 9. «quando posso riprendere i miei soldi» ──────────────────────────── */

prova('il blocco sul riscatto c\'è, su entrambe le colonne', () => {
  const q = F.TFR.quandoLiRiprendo;
  deve(q && q.azienda && q.fondo && q.fondo.length,
    'manca il blocco sul riscatto: è l\'obiezione numero uno, e senza risposta se la fa comunque');
});

prova('e riporta i termini del D.Lgs. 252/2005', () => {
  const t = F.TFR.quandoLiRiprendo.fondo.join(' ');
  deve(/50%/.test(t) && /12 mesi/.test(t), 'manca il 50% dopo 12 mesi di inoccupazione');
  deve(/100%/.test(t) && /48 mesi/.test(t), 'manca il 100% dopo 48 mesi');
  deve(/75%/.test(t) && /sanitarie/i.test(t), 'manca il 75% per spese sanitarie gravi');
  deve(/prima casa/i.test(t) && /otto anni|8 anni/.test(t), 'manca la prima casa dopo otto anni');
  deve(/30%/.test(t), 'manca il 30% per altre esigenze');
});

prova('e quello che non sappiamo ancora è marcato, non scritto come certo', () => {
  /* I tempi materiali di liquidazione cambiano da compagnia a compagnia.
     Scriverli senza averli confermati con HDI vorrebbe dire dare una data a
     un cliente che poi ci tornerà indietro. */
  const q = F.TFR.quandoLiRiprendo;
  deve(q.daVerificare && /HDI/.test(q.daVerificare),
    'i tempi di liquidazione da confermare con HDI non risultano da confermare');
  deve(!/30 giorni/.test(JSON.stringify(F.TFR)),
    'c\'è un termine di 30 giorni scritto come certo: non è ancora confermato da HDI');
});

/* ── 10. i parametri non confermati si dichiarano ───────────────────────── */

prova('finché i numeri del fondo sono segnaposto, il risultato lo dice', () => {
  const r = F.calcola({ eta: 40, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 2000, versamentoMensile: 100 }, MOTORE);
  deve(r.daConfermare.length > 0, 'nessun parametro risulta da confermare: il report si potrebbe consegnare così com\'è');
  deve(r.daConfermare.some(x => /sostituzione/i.test(x)),
    'il tasso di sostituzione non risulta da confermare, ed è il numero da cui dipende tutto');
  deve(r.daConfermare.some(x => /rendita|coefficiente/i.test(x)),
    'il coefficiente di conversione in rendita non risulta da confermare');
});

/* ── 11. l'aggancio all'anagrafica ──────────────────────────────────────── */

prova('l\'età si ricava dalla data di nascita, e il compleanno non ancora passato vale un anno in meno', () => {
  /* Su una soglia come i 67 anni un arrotondamento all'anno solare sposta
     l'intero risultato: chi compie gli anni a dicembre, a settembre ne ha
     ancora uno di meno. */
  deve(F.etaDa('1990-06-15', '2026-09-11') === 36, 'compleanno passato: ' + F.etaDa('1990-06-15', '2026-09-11'));
  deve(F.etaDa('1990-12-15', '2026-09-11') === 35, 'compleanno non passato: ' + F.etaDa('1990-12-15', '2026-09-11'));
  deve(F.etaDa('1990-09-11', '2026-09-11') === 36, 'il giorno del compleanno vale l\'anno pieno');
});

prova('e la data di oggi si passa da fuori, non si legge dall\'orologio', () => {
  /* Stessa regola del resto del modulo: un\'analisi rifatta domani sugli
     stessi dati deve dare lo stesso numero. Senza il secondo argomento non si
     inventa la data di sistema — si dice che non si sa. */
  deve(F.etaDa('1990-06-15') === null, 'senza la data di riferimento l\'età esce lo stesso: l\'ha presa dall\'orologio');
  deve(F.etaDa('', '2026-09-11') === null, 'senza data di nascita esce un\'età');
  deve(F.etaDa('non-una-data', '2026-09-11') === null, 'una data illeggibile produce un\'età');
});

prova('la professione dell\'anagrafica si riconduce alle tre gestioni', () => {
  deve(F.lavoroDaProfessione('Impiegato').lavoro === 'dipendente', 'impiegato non risulta dipendente');
  deve(F.lavoroDaProfessione('OPERAIO EDILE').lavoro === 'dipendente' || F.lavoroDaProfessione('OPERAIO EDILE').certo === false,
    'un caso ambiguo passa per certo');
  deve(F.lavoroDaProfessione('Avvocato').lavoro === 'professionista', 'avvocato non risulta professionista');
  deve(F.lavoroDaProfessione('idraulico').lavoro === 'autonomo', 'idraulico non risulta autonomo');
  deve(F.lavoroDaProfessione('Commerciante').lavoro === 'autonomo', 'commerciante non risulta autonomo');
});

prova('e quando non si capisce NON si indovina', () => {
  /* Fra dipendente e autonomo ballano venti punti di tasso di sostituzione.
     Un tipo di lavoro sbagliato non dà errore: dà una pensione credibile e
     sbagliata. Meglio una domanda in più. */
  for (const t of ['', null, 'Boh', 'Pensionato', 'xyz']) {
    const g = F.lavoroDaProfessione(t);
    deve(g.certo === false, 'la professione «' + t + '» viene data per certa');
    deve(g.motivo && g.motivo.length > 0, 'non dice perché non è sicuro');
  }
  /* «Medico dipendente» porta due segnali in contrasto: si propone, non si
     decide. */
  const c = F.lavoroDaProfessione('medico con partita iva');
  deve(c.certo === false, 'un caso in contrasto viene dato per certo: ' + JSON.stringify(c));
});

/* ── 12. il foglio che resta in mano al cliente ─────────────────────────── */

const esitoDip = () => F.calcola({ eta: 35, etaInizioLavoro: 24, lavoro: 'dipendente', redditoNettoMensile: 1800, versamentoMensile: 50 }, MOTORE);
const esitoAut = () => F.calcola({ eta: 45, etaInizioLavoro: 25, lavoro: 'autonomo', redditoNettoMensile: 2200, versamentoMensile: 100 }, MOTORE);
const foglio = (esito, extra) => F.reportFlash(Object.assign({
  esito, cliente: { nome: 'Mario Rossi' }, consulente: { nome: 'Francesco' }, dataRiferimento: '11/09/2026',
}, extra || {}));

prova('senza data o senza firma il foglio non esce', () => {
  /* Meglio nessun documento che un documento non datato e non firmato: fra un
     anno quel foglio torna indietro, e deve dire da chi e da quando viene. */
  deve(F.reportFlash({ esito: esitoDip(), consulente: { nome: 'Francesco' } }).ok === false,
    'il foglio esce senza data');
  deve(F.reportFlash({ esito: esitoDip(), dataRiferimento: '11/09/2026' }).ok === false,
    'il foglio esce senza il consulente che firma');
  deve(F.reportFlash({ dataRiferimento: '11/09/2026', consulente: { nome: 'F' } }).ok === false,
    'il foglio esce senza il calcolo');
});

prova('il disclaimer obbligatorio c\'è, per intero', () => {
  /* Senza, una proiezione diventa una promessa — e una promessa su
     trent'anni non la può fare nessuno. */
  const h = foglio(esitoDip()).html;
  deve(/scopo illustrativo/i.test(h), 'manca «a scopo illustrativo»');
  deve(/non è una promessa di rendimento/i.test(h), 'manca «non è una promessa di rendimento»');
  deve(/previsione dell(&#39;|')assegno INPS/i.test(h), 'manca che non è una previsione dell\'assegno INPS');
  deve(/al variare dei parametri/i.test(h), 'manca che i valori cambiano al variare dei parametri');
});

prova('lo scenario peggiorativo è marcato sul foglio, non solo a schermo', () => {
  const senza = F.calcola({ eta: 35, lavoro: 'dipendente', redditoNettoMensile: 1800, versamentoMensile: 50 }, MOTORE);
  deve(senza.prudenziale === true, 'senza età di inizio lavoro il calcolo non si dichiara prudenziale');
  const h = foglio(senza).html;
  deve(/[Ss]tima prudenziale/.test(h), 'il foglio non marca la stima prudenziale');
  deve(/inizio tardivo/i.test(h), 'il foglio non dice che assume un inizio tardivo');
  /* E quando l'età c'è, la marcatura NON deve comparire: un foglio che si
     dichiara prudenziale sempre non dichiara più niente. */
  deve(!/[Ss]tima prudenziale/.test(foglio(esitoDip()).html),
    'il foglio si dichiara prudenziale anche quando l\'età di inizio lavoro c\'è');
});

prova('il blocco sul riscatto è sul foglio, su tutte e due le colonne', () => {
  /* È l'obiezione numero uno. Se non sta sul foglio, il cliente ci pensa lo
     stesso — solo a casa, e senza risposta. */
  const h = foglio(esitoDip()).html;
  deve(h.indexOf(F.TFR.quandoLiRiprendo.titolo) >= 0, 'manca il titolo del blocco sul riscatto');
  deve(h.indexOf(F.TFR.quandoLiRiprendo.azienda.slice(0, 40)) >= 0, 'manca la colonna «in azienda» del riscatto');
  deve(/50%/.test(h) && /12 mesi/.test(h) && /48 mesi/.test(h), 'mancano i termini del riscatto nella colonna del fondo');
});

prova('e c\'è anche per chi il TFR non ce l\'ha', () => {
  /* Un autonomo non ha la tabella del TFR, ma la domanda «quando li
     riprendo» se la fa uguale. */
  const r = esitoAut();
  deve(r.mostraTfr === false, 'all\'autonomo si mostra il confronto TFR');
  const h = foglio(r).html;
  deve(h.indexOf(F.TFR.quandoLiRiprendo.titolo) >= 0, 'all\'autonomo manca il blocco sul riscatto');
  deve(/48 mesi/.test(h), 'all\'autonomo mancano i termini del riscatto');
});

prova('il confronto TFR non diventa una raccomandazione', () => {
  const h = foglio(esitoDip()).html;
  deve(/non è una raccomandazione/i.test(h), 'il confronto TFR non dichiara di non essere una raccomandazione');
  deve(/1,5%|1,50%/.test(h), 'manca la rivalutazione dell\'1,5% del TFR in azienda');
  deve(/tassazione separata/i.test(h), 'manca la tassazione separata del TFR in azienda');
});

prova('il tetto di deducibilità è scritto sul foglio, non solo applicato', () => {
  /* E va scritto ANCHE a chi non lo supera: è il confine del beneficio.
     Chi legge «risparmio fiscale» senza sapere fin dove arriva, o crede che
     non finisca mai, o sospetta una trappola non detta. */
  const sotto = esitoDip();
  deve(sotto.fiscale && sotto.fiscale.oltreIlTetto === false, 'questo caso doveva restare sotto il tetto');
  deve(/5\.164,57/.test(foglio(sotto).html), 'il tetto non compare sul foglio di chi non lo supera');
  const sopra = F.calcola({ eta: 40, etaInizioLavoro: 25, lavoro: 'dipendente', redditoNettoMensile: 3500, versamentoMensile: 600 }, MOTORE);
  deve(sopra.fiscale && sopra.fiscale.oltreIlTetto === true, 'questo caso doveva superare il tetto');
  const h = foglio(sopra).html;
  deve(/5\.164,57/.test(h), 'il tetto non compare sul foglio di chi lo supera');
  deve(/supera/.test(h), 'a chi versa oltre il tetto non viene detto che lo supera');
  /* Il numero di legge non si arrotonda: «5.165» sembra una nostra stima. */
  deve(!/€ 5\.165\b/.test(h), 'il tetto è stampato arrotondato: sembra una stima, non un numero di legge');
});

prova('quello che non è confermato non si stampa come certo', () => {
  const h = foglio(esitoDip()).html;
  deve(/attesa di conferma/i.test(h), 'il foglio non dice che ci sono parametri da confermare');
  deve(/HDI/.test(h), 'il foglio non cita la tariffa di riferimento HDI');
  deve(/COVIP/.test(h), 'manca l\'albo COVIP del PIP');
  deve(!/30 giorni/.test(h), 'c\'è un termine di 30 giorni scritto come certo: non è confermato da HDI');
});

prova('la frase sulla proposta è UNA, per la schermata e per il foglio', () => {
  /* «con 20 € sei ancora lontano, con 50 € ti avvicini, con 100 € azzeri»: è
     il discorso che si fa a voce. Stava scritto in due posti e i due posti si
     erano già scostati — la stessa proposta al 40% era «sei ancora lontano»
     sullo schermo e «ti avvicina» sul foglio. Il cliente li vede tutti e due. */
  deve(typeof F.frasePer === 'function', 'il motore non dice come si chiama una proposta');
  deve(F.frasePer({ azzera: true, coperturaGap: 1 }) === 'azzera il divario', 'chi azzera non lo dice');
  /* Nessuna cortesia sotto un quarto del divario: è la parola che poi non
     regge quando si guarda la colonna «copre» accanto. */
  deve(!/avvicin|quasi/.test(F.frasePer({ azzera: false, coperturaGap: 0.16 })),
    'al 16% si dice già che ci si avvicina');
  deve(/avvicin/.test(F.frasePer({ azzera: false, coperturaGap: 0.40 })), 'al 40% non ci si avvicina');
  /* E sale sempre: mai una frase più tiepida su una copertura più alta. */
  const ordine = ['sei ancora lontano', 'ti avvicini', 'ci sei quasi', 'azzera il divario'];
  let prec = -1;
  for (const c of [0, 0.1, 0.25, 0.4, 0.6, 0.9]) {
    const i = ordine.indexOf(F.frasePer({ azzera: false, coperturaGap: c }));
    deve(i >= 0, 'frase sconosciuta al ' + c);
    deve(i >= prec, 'al ' + c + ' la frase peggiora rispetto a una copertura più bassa');
    prec = i;
  }
  /* E il foglio la prende da lì, non se la riscrive. */
  const r = esitoDip();
  const h = foglio(r).html;
  for (const p of r.proposte.filter((x) => x.versamentoMensile > 0)) {
    deve(h.indexOf(F.frasePer(p)) >= 0,
      'sul foglio la proposta da ' + p.versamentoMensile + ' € non porta la frase del motore («' + F.frasePer(p) + '»)');
  }
});

/* ── 13. il messaggio precompilato ─────────────────────────────────────── */

prova('il messaggio precompilato dice i numeri del foglio, non altri', () => {
  const r = esitoDip();
  const m = F.messaggioWhatsapp(r, { nome: 'Mario Rossi' });
  deve(/Mario/.test(m), 'non chiama il cliente per nome');
  deve(m.indexOf(String(Math.round(r.gapMensile))) >= 0, 'non dice il divario calcolato');
  deve(/non una promessa di rendimento/i.test(m), 'il messaggio non porta l\'avvertenza');
});

prova('e dichiara la stima prudenziale anche lì', () => {
  /* Il messaggio arriva prima del foglio, e spesso è l'unica cosa che viene
     letta: se la marcatura sta solo sul PDF, non sta da nessuna parte. */
  const senza = F.calcola({ eta: 35, lavoro: 'dipendente', redditoNettoMensile: 1800, versamentoMensile: 50 }, MOTORE);
  deve(/prudente|prudenziale/i.test(F.messaggioWhatsapp(senza, { nome: 'Mario' })),
    'il messaggio non dice che la stima è prudenziale');
  deve(!/prudente|prudenziale/i.test(F.messaggioWhatsapp(esitoDip(), { nome: 'Mario' })),
    'il messaggio si dichiara prudenziale anche quando non lo è');
});

prova('e non promette di azzerare il divario con una cifra fuori portata', () => {
  /* Chi ha 60 anni e 1.200 € di reddito ha bisogno di 700 € al mese per
     azzerare: scriverglielo in un messaggio non è una proposta, è un muro. */
  const tardi = F.calcola({ eta: 60, etaInizioLavoro: 35, lavoro: 'autonomo', redditoNettoMensile: 1200, versamentoMensile: 0 }, MOTORE);
  const fuori = tardi.proposte.filter(p => p.fuoriPortata)[0];
  deve(fuori, 'questo caso doveva produrre una proposta fuori portata');
  const m = F.messaggioWhatsapp(tardi, { nome: 'Mario' });
  deve(m.indexOf('€ ' + fuori.versamentoMensile + ' al mese in un fondo pensione lo copri per intero') < 0,
    'il messaggio propone come normale una cifra segnata fuori portata');
});

/* ── esecuzione ─────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Previdenza flash: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
