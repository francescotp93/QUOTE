// ═══════════════════════════════════════════════════════════════════════════════
//  LE PROVE DEL MOTORE PREVIDENZIALE
//
//  PERCHE' ESISTONO
//    Un calcolo previdenziale sbagliato non si vede. Non va in errore, non
//    lascia una pagina bianca: stampa un numero credibile. Una persona guarda
//    quel numero e decide quanto mettere da parte per i prossimi trent'anni.
//    L'unico posto dove quell'errore si puo' ancora incontrare e' qui.
//
//    Le prove si concentrano su tre famiglie di guai:
//      · L'ORDINE DELLE OPERAZIONI — rivalutare prima o dopo il contributo
//        dell'anno cambia il risultato, e il codice sbagliato gira benissimo.
//      · LE UNITA' — 33 invece di 0.33, punti percentuali invece di frazioni.
//        Sono errori che fanno uscire numeri piu' belli, quindi nessuno li
//        contesta.
//      · I BUCHI — coefficiente mancante, reddito zero, zero anni. Il motore
//        deve fermarsi e dirlo, non riempire con uno zero.
//
//  I NUMERI QUI SOTTO SONO FINTI, TUTTI.
//    Aliquote, coefficienti, tetti, rendimenti: sono valori scelti perche' i
//    conti si controllino a mente (un'aliquota del 100%, un coefficiente di
//    0,05, una rivalutazione del 10%). NON sono i valori di legge e non vanno
//    copiati da nessuna parte. I valori veri arrivano da fuori: l'elenco di
//    cosa serve sta in PARAMETRI_RICHIESTI dentro pensione.js.
// ═══════════════════════════════════════════════════════════════════════════════
import {
  montanteContributivo, proiezioneRedditi, pensioneAnnua, tassoSostituzione,
  versamentoPerColmare, deduzioneFiscale, tassazionePrestazione,
  ipotesiUsate, ORDINE_ITALIANO, ORDINE_FONDO, PARAMETRI_RICHIESTI,
} from './pensione.js';

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };
/* I soldi non si confrontano con === : 0.1+0.2 non fa 0.3 in nessun computer.
   Si confronta con una tolleranza relativa, che regge anche sui montanti grossi. */
const vicino = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const uguale = (a, b, dove) => deve(vicino(a, b), `${dove}: doveva venire ${b}, è venuto ${a} (differenza ${a - b})`);
/* Non basta che si fermi: deve fermarsi DICENDO la cosa giusta. Un errore che
   non spiega manda a riprovare a caso, e in un preventivo si riprova mettendo
   uno zero. */
const sbaglia = (fn, atteso, dove) => {
  let m = null;
  try { fn(); } catch (e) { m = e.message; }
  deve(m !== null, `${dove}: non si è fermato, ha restituito un numero come se niente fosse`);
  deve(atteso.test(m), `${dove}: si è fermato ma con un messaggio che non aiuta — «${m}»`);
  return m;
};

/* ── VALORI FINTI ─────────────────────────────────────────────────────────────
   Servono solo a far girare le prove: non sono i coefficienti veri, non sono le
   aliquote vere, non sono i tetti veri. Scelti tondi apposta. */
const FINTO = {
  aliquotaPiena: 1,        // il 100% del reddito versato: rende i conti leggibili
  aliquotaMeta: 0.5,
  rivalutazione: 0.1,      // 10%: un decimo, si controlla a mente
  coefficiente: 0.05,      // un ventesimo: 100.000 di montante = 5.000 di rendita
  tetto: 5000,             // euro
  irpef: 0.35,
  tassa: { aliquotaBase: 0.15, riduzionePerAnno: 0.003, aliquotaMinima: 0.09, annoDaCuiSiRiduce: 15 },
};

// ── 1. IL MONTANTE: L'ORDINE DELLE OPERAZIONI ─────────────────────────────────

prova('un anno solo, con i conti fatti a mano', () => {
  /* La prova piu' semplice che esista: se sbaglia questa, tutto il resto e'
     rumore. 1000 già in cassa, rivalutati del 10%, più metà di 30.000. */
  const r = montanteContributivo({ storico: [30000], aliquota: FINTO.aliquotaMeta, rivalutazioni: FINTO.rivalutazione, montanteIniziale: 1000 });
  uguale(r.montante, 1000 * 1.1 + 15000, 'il montante dopo un anno');
  uguale(r.contributi, 15000, 'i contributi versati');
  uguale(r.rivalutazione, 100, 'quanto ci ha messo la rivalutazione');
  return '1000 rivalutati + 15.000 di contributo = 16.100';
});

prova('l\'ordine cambia il risultato, e si può scegliere', () => {
  /* E' IL PUNTO. In Italia il montante si rivaluta e POI si somma il contributo
     dell'anno; un fondo dove versi a gennaio fa il contrario. Le due strade
     danno numeri diversi, e chi legge il preventivo ha il diritto di sapere
     quale si è usata. Se un giorno queste due venissero uguali, vorrebbe dire
     che l'opzione non è collegata a niente. */
  const dati = { storico: [10000, 10000], aliquota: FINTO.aliquotaPiena, rivalutazioni: FINTO.rivalutazione };
  const ita = montanteContributivo({ ...dati, ordine: ORDINE_ITALIANO });
  const fondo = montanteContributivo({ ...dati, ordine: ORDINE_FONDO });
  uguale(ita.montante, 21000, 'regola italiana: (0×1,1+10.000)×1,1+10.000');
  uguale(fondo.montante, 23100, 'regola del fondo: (10.000×1,1) poi (21.000×1,1)');
  deve(fondo.montante > ita.montante, 'l\'ordine del fondo dovrebbe dare un montante più alto, invece dà ' + fondo.montante);
  return 'due ordini, due montanti: 21.000 contro 23.100 su due soli anni';
});

prova('il contributo dell\'ultimo anno non viene rivalutato', () => {
  /* Conseguenza diretta della regola italiana, ed è la parte che si dimentica:
     chi versa l'ultimo anno prima della pensione non guadagna nessuna
     rivalutazione su quel versamento. Se il motore lo rivalutasse, il montante
     finale sarebbe più alto del vero proprio all'anno che pesa di più. */
  const r = montanteContributivo({ storico: [10000, 10000], aliquota: FINTO.aliquotaPiena, rivalutazioni: FINTO.rivalutazione });
  uguale(r.rivalutazione, 1000, 'la rivalutazione totale su due anni');
  return 'solo il primo dei due contributi si è rivalutato: 1.000, non 2.100';
});

prova('l\'ordine di riserva è quello italiano', () => {
  // Chi non passa nulla deve ottenere la regola di legge, non l'altra.
  const senza = montanteContributivo({ storico: [10000], aliquota: FINTO.aliquotaPiena, rivalutazioni: FINTO.rivalutazione, montanteIniziale: 1000 });
  deve(senza.ordine === ORDINE_ITALIANO, 'senza indicazioni ha usato l\'ordine ' + senza.ordine);
  uguale(senza.montante, 11100, 'il montante con l\'ordine di riserva');
  return 'chi non sceglie ottiene la regola italiana, e il risultato lo dichiara';
});

// ── IL MONTANTE: I CASI CHE ROMPONO ───────────────────────────────────────────

prova('nessun anno di lavoro: resta quello che c\'era', () => {
  /* Un giovane senza storia contributiva, o un preventivo aperto per errore.
     Non deve venire NaN e non deve venire una rivalutazione fantasma: senza
     anni non è passato tempo. */
  const r = montanteContributivo({ storico: [], aliquota: FINTO.aliquotaPiena, rivalutazioni: FINTO.rivalutazione, montanteIniziale: 7000 });
  uguale(r.montante, 7000, 'il montante senza anni');
  uguale(r.contributi, 0, 'i contributi senza anni');
  uguale(r.rivalutazione, 0, 'la rivalutazione senza anni');
  deve(r.anni.length === 0, 'ha inventato ' + r.anni.length + ' anni che non esistono');
  return 'zero anni, zero movimenti: il montante iniziale resta lì';
});

prova('tutto a zero non produce NaN', () => {
  // Il caso del cliente che non ha mai versato niente: zero, non «NaN euro».
  const r = montanteContributivo({ storico: [0, 0, 0], aliquota: 0, rivalutazioni: 0, montanteIniziale: 0 });
  uguale(r.montante, 0, 'il montante di chi non ha mai versato');
  deve(Number.isFinite(r.montante), 'è uscito ' + r.montante);
  return 'zero moltiplicato per zero fa zero, non NaN';
});

prova('rivalutazione zero: il montante è la somma dei contributi', () => {
  /* Serve da riprova indipendente: senza rivalutazione il conto lo può rifare
     chiunque con una calcolatrice, e deve tornare identico. */
  const r = montanteContributivo({ storico: [20000, 30000, 25000], aliquota: FINTO.aliquotaMeta, rivalutazioni: 0 });
  uguale(r.montante, 37500, 'la somma di metà dei tre redditi');
  uguale(r.rivalutazione, 0, 'la rivalutazione con tasso zero');
  return 'senza rivalutazione il montante è pura somma: 37.500';
});

prova('rivalutazione negativa: il montante scende, e va bene così', () => {
  /* Il 2020 è esistito, e la media quinquennale del PIL nominale può essere
     negativa. Rifiutare un tasso negativo vorrebbe dire non saper rappresentare
     un anno che è successo davvero. */
  const r = montanteContributivo({ storico: [10000, 10000], aliquota: FINTO.aliquotaPiena, rivalutazioni: -0.5 });
  uguale(r.montante, 15000, 'il montante con rivalutazione negativa');
  deve(r.montante < 20000, 'con un tasso negativo il montante dovrebbe essere sotto la somma versata');
  return 'il primo contributo si è dimezzato: 15.000 invece di 20.000';
});

prova('sotto il -100% ci si ferma', () => {
  // Un capitale che si rivaluta di -150% diventerebbe negativo: non vuol dire niente.
  sbaglia(() => montanteContributivo({ storico: [10000], aliquota: 1, rivalutazioni: -1.5 }), /rivalutazione/i, 'rivalutazione impossibile');
  return 'un montante negativo non è un montante';
});

prova('ogni anno può avere la sua aliquota e la sua rivalutazione', () => {
  /* Le carriere vere cambiano cassa e le rivalutazioni cambiano ogni anno: un
     tasso unico per trent'anni è una semplificazione, non la realtà. */
  const r = montanteContributivo({
    storico: [
      { anno: 2024, reddito: 10000, aliquota: 1, rivalutazione: 0 },
      { anno: 2025, reddito: 10000, aliquota: 0.5, rivalutazione: 0.1 },
    ],
    aliquota: 0.33, rivalutazioni: 0.99,   // valori generali che devono essere ignorati
  });
  uguale(r.montante, 10000 * 1.1 + 5000, 'il montante con parametri per anno');
  deve(r.anni[0].anno === 2024 && r.anni[1].anno === 2025, 'ha perso per strada l\'etichetta dell\'anno');
  return 'i valori del singolo anno battono quelli generali';
});

prova('redditi scritti come numeri o come oggetti danno lo stesso risultato', () => {
  // Due modi di passare la stessa cosa non devono dare due risposte.
  const a = montanteContributivo({ storico: [10000, 20000], aliquota: 0.5, rivalutazioni: 0.1 });
  const b = montanteContributivo({ storico: [{ reddito: 10000 }, { reddito: 20000 }], aliquota: 0.5, rivalutazioni: 0.1 });
  uguale(a.montante, b.montante, 'le due scritture');
  return 'stessa cosa scritta in due modi, stesso montante';
});

prova('se manca la rivalutazione non si mette zero: ci si ferma', () => {
  /* E' la prova che protegge la regola più importante di tutto il file. Uno zero
     messo al posto di un tasso mancante non fa rumore: fa uscire un montante
     più basso del vero e un preventivo che sembra funzionare. */
  const m = sbaglia(() => montanteContributivo({ storico: [10000], aliquota: 0.33 }), /rivalutazione/i, 'rivalutazione mancante');
  deve(/riserva|deve arrivare|manca/i.test(m), 'il messaggio non spiega che il dato deve arrivare da fuori: «' + m + '»');
  return 'niente valore di comodo: «' + m.slice(0, 60) + '…»';
});

prova('se manca l\'aliquota ci si ferma, col nome del dato che manca', () => {
  sbaglia(() => montanteContributivo({ storico: [10000], rivalutazioni: 0.1 }), /aliquota/i, 'aliquota mancante');
  return 'il messaggio dice quale dato manca, non «undefined»';
});

prova('mancano i tassi per gli ultimi anni: lo dice quanti', () => {
  /* Un elenco di rivalutazioni più corto dello storico è l'errore di chi copia
     da un foglio: senza controllo gli ultimi anni prenderebbero undefined. */
  const m = sbaglia(
    () => montanteContributivo({ storico: [1, 2, 3, 4, 5], aliquota: 0.33, rivalutazioni: [0.01, 0.02] }),
    /manca/i, 'tassi in numero insufficiente');
  deve(/3/.test(m), 'non dice quanti ne mancano: «' + m + '»');
  return 'dice esattamente quanti anni sono scoperti';
});

prova('33 invece di 0,33 viene rifiutato', () => {
  /* L'errore più caro di tutti, perché non fa saltare niente: fa uscire un
     montante cento volte più grande, che sembra soltanto una bella notizia. */
  const m = sbaglia(() => montanteContributivo({ storico: [30000], aliquota: 33, rivalutazioni: 0.01 }), /percentuale/i, 'aliquota come percentuale');
  deve(/0\.33|0,33/.test(m), 'non mostra come si scrive giusto: «' + m + '»');
  return 'il messaggio dice anche come si scrive: «' + m.slice(0, 70) + '…»';
});

prova('un reddito scritto come testo non passa', () => {
  /* «30.000» convertito in numero fa 30. Accettare stringhe qui vuol dire che
     un modulo compilato all'italiana produce un montante da fame senza che
     nessuno se ne accorga. */
  const m = sbaglia(() => montanteContributivo({ storico: ['30000'], aliquota: 0.33, rivalutazioni: 0.01 }), /numero/i, 'reddito come testo');
  deve(/30\.000|convertit/i.test(m), 'il messaggio non avverte del punto delle migliaia: «' + m + '»');
  return 'chi legge il modulo converte prima, e il messaggio glielo ricorda';
});

prova('lo storico deve essere un elenco', () => {
  sbaglia(() => montanteContributivo({ storico: 30000, aliquota: 0.33, rivalutazioni: 0.01 }), /elenco/i, 'storico non elenco');
  sbaglia(() => montanteContributivo({}), /elenco/i, 'storico assente');
  return 'un reddito solo non è una carriera';
});

prova('i numeri fuori scala si fermano invece di diventare infinito', () => {
  /* Un importo assurdo (incollato male, o un test di stress) manda il conto
     oltre quello che il computer sa scrivere. Da lì in poi ogni risultato è
     Infinity o NaN, ma stampato sembra ancora un numero. */
  sbaglia(
    () => montanteContributivo({ storico: [1e308, 1e308], aliquota: 1, rivalutazioni: 0 }),
    /rappresent|scala/i, 'importi fuori scala');
  // Mentre una carriera grande ma vera deve continuare a funzionare.
  const vero = montanteContributivo({ storico: Array(40).fill(1000000), aliquota: 0.33, rivalutazioni: 0.02 });
  deve(Number.isFinite(vero.montante) && vero.montante > 0, 'una carriera da 40 anni a un milione l\'anno non torna: ' + vero.montante);
  return 'si ferma sull\'assurdo, regge sul grande ma possibile';
});

// ── 2. LA PROIEZIONE DEI REDDITI ──────────────────────────────────────────────

prova('la crescita è composta, non lineare', () => {
  /* Sommare ogni anno la stessa cifra è l'errore che si fa a mente. Su tre anni
     si vede appena; su trenta cambia il montante finale in modo vistoso. */
  const r = proiezioneRedditi({ redditoOggi: 100, anni: 3, crescitaAnnua: 0.1 });
  deve(r.length === 3, 'ha restituito ' + r.length + ' anni invece di 3');
  uguale(r[0], 100, 'il primo anno');
  uguale(r[1], 110, 'il secondo anno');
  uguale(r[2], 121, 'il terzo anno');
  deve(r[2] !== 120, 'la crescita è lineare: il terzo anno fa 120 invece di 121');
  return '100 → 110 → 121, non 120';
});

prova('il primo anno è il reddito di oggi, salvo dire il contrario', () => {
  /* Scelta di modello, non regola: chi guarda la tabella si aspetta di vedere in
     cima lo stipendio che ha adesso. Chi vuole far partire la crescita subito
     lo chiede, e allora tutti gli anni si spostano di uno. */
  const fermo = proiezioneRedditi({ redditoOggi: 100, anni: 2, crescitaAnnua: 0.1 });
  const subito = proiezioneRedditi({ redditoOggi: 100, anni: 2, crescitaAnnua: 0.1, crescitaDalPrimoAnno: true });
  uguale(fermo[0], 100, 'primo anno fermo');
  uguale(subito[0], 110, 'primo anno già cresciuto');
  uguale(subito[1], 121, 'secondo anno già cresciuto');
  return 'due letture legittime dello stesso dato: la scelta è dichiarata';
});

prova('crescita zero: lo stesso reddito per tutti gli anni', () => {
  const r = proiezioneRedditi({ redditoOggi: 25000, anni: 5, crescitaAnnua: 0 });
  deve(r.every((x) => x === 25000), 'con crescita zero i redditi non sono tutti uguali: ' + r.join(', '));
  return 'cinque anni, cinque volte lo stesso stipendio';
});

prova('zero anni: elenco vuoto, non un errore', () => {
  /* Chi è già in pensione, o chi compila una simulazione al giorno prima. Non è
     un guasto: è che non c'è niente da proiettare. */
  const r = proiezioneRedditi({ redditoOggi: 25000, anni: 0, crescitaAnnua: 0.02 });
  deve(Array.isArray(r) && r.length === 0, 'con zero anni ha restituito ' + JSON.stringify(r));
  return 'nessun anno davanti, nessuna riga in tabella';
});

prova('gli anni si contano interi', () => {
  /* «2,5 anni» sembra innocuo e invece nasconde una decisione: quel mezzo anno
     si arrotonda su o giù? Deve deciderlo chi conosce il caso, non il motore. */
  sbaglia(() => proiezioneRedditi({ redditoOggi: 100, anni: 2.5, crescitaAnnua: 0.01 }), /inter/i, 'anni non interi');
  sbaglia(() => proiezioneRedditi({ redditoOggi: 100, anni: -3, crescitaAnnua: 0.01 }), /anni/i, 'anni negativi');
  return 'gli anni parziali li decide un umano, non un arrotondamento nascosto';
});

prova('«crescita del 2%» scritta 2 viene rifiutata', () => {
  // Scritta così sarebbe un raddoppio dello stipendio ogni anno.
  sbaglia(() => proiezioneRedditi({ redditoOggi: 25000, anni: 30, crescitaAnnua: 2 }), /percentuale/i, 'crescita come percentuale');
  return 'nessuno raddoppia lo stipendio ogni anno per trent\'anni';
});

// ── 3-4. PENSIONE E TASSO DI SOSTITUZIONE ─────────────────────────────────────

prova('la pensione annua è montante per coefficiente', () => {
  uguale(pensioneAnnua({ montante: 300000, coefficiente: FINTO.coefficiente }), 15000, 'la pensione annua');
  return '300.000 × 0,05 = 15.000 (coefficiente finto)';
});

prova('senza coefficiente non esce un numero', () => {
  /* Restituire zero sarebbe la cosa peggiore: «la tua pensione sarà zero» è una
     frase credibile, spaventosa e falsa. Il coefficiente dipende dall'età di
     uscita, e se non la sappiamo non sappiamo la pensione. */
  sbaglia(() => pensioneAnnua({ montante: 300000 }), /coefficiente/i, 'coefficiente mancante');
  sbaglia(() => pensioneAnnua({ montante: 300000, coefficiente: 0 }), /coefficiente/i, 'coefficiente zero');
  return 'meglio fermarsi che dire «zero euro al mese»';
});

prova('montante zero: pensione zero, senza fermarsi', () => {
  /* Qui invece lo zero è una risposta vera: chi non ha versato niente non
     prende niente. Fermarsi sarebbe sbagliato quanto inventare un numero. */
  uguale(pensioneAnnua({ montante: 0, coefficiente: FINTO.coefficiente }), 0, 'la pensione di chi non ha montante');
  return 'zero versato, zero pensione: è una risposta, non un guasto';
});

prova('il motore non arrotonda i soldi', () => {
  /* Chi mostra arrotonda una volta sola, alla fine. Arrotondare qui e poi
     rimoltiplicare per trent'anni fa sparire centinaia di euro. */
  const p = pensioneAnnua({ montante: 333333, coefficiente: FINTO.coefficiente });
  uguale(p, 16666.65, 'la pensione con i centesimi');
  deve(p % 1 !== 0, 'ha arrotondato: è uscito ' + p);
  return 'i centesimi restano, li toglie chi stampa';
});

prova('il tasso di sostituzione esce come frazione, non come percentuale', () => {
  /* Se qui uscisse 50 invece di 0.5, chi mostra moltiplicherebbe di nuovo per
     100 e stamperebbe «5000%». Tutti i tassi di questo motore sono frazioni. */
  const t = tassoSostituzione({ pensione: 15000, ultimoReddito: 30000 });
  uguale(t, 0.5, 'il tasso di sostituzione');
  deve(t <= 1, 'ha restituito una percentuale invece di una frazione: ' + t);
  return '15.000 su 30.000 = 0,5 (che chi stampa scriverà 50%)';
});

prova('ultimo reddito zero: non esce «infinito»', () => {
  /* In JavaScript dividere per zero non solleva niente: restituisce Infinity.
     Un tasso di sostituzione infinito su un preventivo è peggio di un errore. */
  sbaglia(() => tassoSostituzione({ pensione: 15000, ultimoReddito: 0 }), /reddito|confront/i, 'divisione per zero');
  return 'senza busta paga non c\'è niente da confrontare';
});

// ── 5. QUANTO VERSARE PER COLMARE IL BUCO ─────────────────────────────────────

prova('rendimento zero: il buco si divide per gli anni', () => {
  /* «Tengo i soldi fermi» è quello che fa un sacco di gente, ed è anche il caso
     in cui la formula generale dividerebbe per zero. Deve venire il conto della
     serva: capitale che serve, diviso gli anni. */
  const r = versamentoPerColmare({ gapAnnuo: 5000, anni: 10, rendimento: 0, coefficiente: FINTO.coefficiente });
  uguale(r.capitaleObiettivo, 100000, 'il capitale che serve');
  uguale(r.annuo, 10000, 'il versamento annuo senza rendimento');
  return '5.000 di rendita = 100.000 di capitale = 10.000 all\'anno per dieci anni';
});

prova('con rendimento serve versare meno, e il conto torna all\'indietro', () => {
  /* La riprova migliore non è un numero copiato: è rifare la strada al
     contrario. Si versa quello che dice il motore, lo si accumula anno per anno
     con lo stesso motore del montante, e alla fine deve uscire esattamente la
     rendita che mancava. Se le due funzioni non fossero d'accordo, il
     preventivo prometterebbe una cosa e la simulazione ne farebbe un'altra. */
  const gap = 5000;
  const r = versamentoPerColmare({ gapAnnuo: gap, anni: 10, rendimento: 0.1, coefficiente: FINTO.coefficiente });
  deve(r.annuo < 10000, 'col rendimento dovrebbe servire meno di 10.000, invece chiede ' + r.annuo);

  const accumulo = montanteContributivo({
    storico: Array(10).fill(r.annuo), aliquota: 1, rivalutazioni: 0.1, ordine: ORDINE_ITALIANO,
  });
  uguale(accumulo.montante, r.capitaleObiettivo, 'il capitale davvero accumulato');
  uguale(pensioneAnnua({ montante: accumulo.montante, coefficiente: FINTO.coefficiente }), gap, 'la rendita che ne esce');
  return 'versati ' + r.annuo.toFixed(2) + ' l\'anno, il buco si chiude esattamente';
});

prova('versare a inizio anno costa meno che a fine anno', () => {
  /* Ogni rata guadagna un anno di rendimento in più. E' una scelta di modello
     che cambia il preventivo: va dichiarata, non decisa di nascosto. La prova
     verifica anche che «inizio» corrisponda all'ordine del fondo, così le due
     opzioni del motore restano coerenti fra loro. */
  const comune = { gapAnnuo: 5000, anni: 10, rendimento: 0.1, coefficiente: FINTO.coefficiente };
  const fine = versamentoPerColmare({ ...comune, quando: 'fine' });
  const inizio = versamentoPerColmare({ ...comune, quando: 'inizio' });
  deve(inizio.annuo < fine.annuo, 'versare prima dovrebbe costare meno: inizio ' + inizio.annuo + ', fine ' + fine.annuo);
  uguale(inizio.annuo, fine.annuo / 1.1, 'il rapporto fra anticipato e posticipato');

  const accumulo = montanteContributivo({ storico: Array(10).fill(inizio.annuo), aliquota: 1, rivalutazioni: 0.1, ordine: ORDINE_FONDO });
  uguale(accumulo.montante, inizio.capitaleObiettivo, 'il capitale accumulato versando a inizio anno');
  return 'anticipato = posticipato diviso (1+rendimento), e la simulazione lo conferma';
});

prova('di riserva si sceglie il momento prudente', () => {
  // Chi non dichiara nulla non deve ottenere il preventivo più bello, ma il più cauto.
  const senza = versamentoPerColmare({ gapAnnuo: 5000, anni: 10, rendimento: 0.1, coefficiente: FINTO.coefficiente });
  deve(senza.quando === 'fine', 'senza indicazioni ha scelto «' + senza.quando + '»');
  return 'chi non sceglie ottiene la stima che non promette più del vero';
});

prova('i costi si mangiano il rendimento', () => {
  /* Un rendimento lordo senza costi è un numero da pubblicità. Con costi pari
     al rendimento si torna esattamente al caso «soldi fermi»: è la riprova che
     i costi entrano nel conto per davvero e nel verso giusto. */
  const senzaCosti = versamentoPerColmare({ gapAnnuo: 5000, anni: 10, rendimento: 0.1, coefficiente: FINTO.coefficiente });
  const conCosti = versamentoPerColmare({ gapAnnuo: 5000, anni: 10, rendimento: 0.1, costiAnnui: 0.02, coefficiente: FINTO.coefficiente });
  const tuttoMangiato = versamentoPerColmare({ gapAnnuo: 5000, anni: 10, rendimento: 0.1, costiAnnui: 0.1, coefficiente: FINTO.coefficiente });
  deve(conCosti.annuo > senzaCosti.annuo, 'con i costi dovrebbe servire versare di più');
  uguale(tuttoMangiato.annuo, 10000, 'costi pari al rendimento');
  uguale(tuttoMangiato.rendimentoNetto, 0, 'il rendimento netto');
  return 'costi = rendimento → si torna ai 10.000 dei soldi fermi';
});

prova('rendimento negativo: si versa di più, e sotto il -100% ci si ferma', () => {
  /* Un rendimento negativo è possibile (obbligazioni, anni storti) e il motore
     deve saperlo rappresentare. Perdere tutto ogni anno, invece, non è un
     rendimento: è la fine del conto, e nessun versamento colmerebbe il buco. */
  const giu = versamentoPerColmare({ gapAnnuo: 5000, anni: 10, rendimento: -0.02, coefficiente: FINTO.coefficiente });
  deve(giu.annuo > 10000, 'con rendimento negativo dovrebbe servire più di 10.000, chiede ' + giu.annuo);
  sbaglia(() => versamentoPerColmare({ gapAnnuo: 5000, anni: 10, rendimento: -1, coefficiente: FINTO.coefficiente }), /azzererebbe|colmi/i, 'perdita totale');
  return 'il rosso si sa rappresentare, l\'azzeramento no';
});

prova('nessun buco da colmare: non si versa niente', () => {
  /* La pensione basta già, o addirittura supera l'ultimo stipendio. Non è un
     caso limite da respingere, è la risposta più bella che ci sia. Un numero
     negativo qui vorrebbe dire «ti restituiamo dei soldi», che nessuno fa. */
  for (const gap of [0, -1200]) {
    const r = versamentoPerColmare({ gapAnnuo: gap, anni: 10, rendimento: 0.03, coefficiente: FINTO.coefficiente });
    uguale(r.annuo, 0, 'il versamento con gap ' + gap);
  }
  return 'gap zero o negativo → zero da versare, senza errori';
});

prova('un buco e zero anni per colmarlo: è una notizia, non un conto', () => {
  /* Dividere per zero anni darebbe Infinity, cioè «versa infinito»: una risposta
     che nessuno può usare. Chi è già arrivato alla pensione va avvisato, non
     calcolato. */
  sbaglia(() => versamentoPerColmare({ gapAnnuo: 5000, anni: 0, rendimento: 0.03, coefficiente: FINTO.coefficiente }), /anno|anni/i, 'zero anni con buco aperto');
  return 'meglio una frase che «versa infinito all\'anno»';
});

prova('senza coefficiente non si sa nemmeno quanto capitale serve', () => {
  sbaglia(() => versamentoPerColmare({ gapAnnuo: 5000, anni: 10, rendimento: 0.03 }), /coefficiente/i, 'coefficiente mancante');
  sbaglia(() => versamentoPerColmare({ gapAnnuo: 5000, anni: 10, rendimento: 0.03, coefficiente: 0 }), /coefficiente/i, 'coefficiente zero');
  return 'il coefficiente serve due volte: per la pensione e per il rimedio';
});

prova('senza rendimento dichiarato ci si ferma', () => {
  /* Zero non è un valore di riserva innocente: qui direbbe «i tuoi soldi non
     renderanno niente», che è un'ipotesi, non un dato mancante. */
  sbaglia(() => versamentoPerColmare({ gapAnnuo: 5000, anni: 10, coefficiente: FINTO.coefficiente }), /rendimento/i, 'rendimento mancante');
  return 'anche l\'ipotesi più prudente resta un\'ipotesi da dichiarare';
});

// ── 6. LA DEDUZIONE FISCALE ───────────────────────────────────────────────────

prova('sotto il tetto si deduce tutto', () => {
  const r = deduzioneFiscale({ versato: 2000, tetto: FINTO.tetto, aliquotaIrpef: FINTO.irpef });
  uguale(r.dedotto, 2000, 'la parte dedotta');
  uguale(r.eccedenza, 0, 'l\'eccedenza');
  uguale(r.risparmio, 700, 'il risparmio');
  return '2.000 versati, 2.000 dedotti, 700 di risparmio (numeri finti)';
});

prova('sopra il tetto l\'eccedenza si vede', () => {
  /* Quello che supera il tetto non si perde e non si deduce. Restituirlo a parte
     serve a non far credere al cliente che tutto il versamento faccia
     risparmiare: è la frase che gli evita una brutta sorpresa a giugno. */
  const r = deduzioneFiscale({ versato: 8000, tetto: FINTO.tetto, aliquotaIrpef: FINTO.irpef });
  uguale(r.dedotto, 5000, 'la parte dedotta');
  uguale(r.eccedenza, 3000, 'la parte oltre il tetto');
  uguale(r.risparmio, 1750, 'il risparmio, limitato al tetto');
  return '3.000 oltre il tetto restano scritti, non spariscono';
});

prova('il tetto non ha un valore di riserva', () => {
  /* E' il numero che cambia più spesso e quello che nessuno ricontrolla. Se
     fosse scritto qui dentro, il giorno che cambia il preventivo continuerebbe
     a uscire uguale e sbagliato. */
  sbaglia(() => deduzioneFiscale({ versato: 2000, aliquotaIrpef: 0.35 }), /tetto/i, 'tetto mancante');
  sbaglia(() => deduzioneFiscale({ versato: 2000, tetto: 5000 }), /irpef/i, 'aliquota IRPEF mancante');
  return 'tetto e aliquota arrivano da fuori, sempre';
});

prova('non versato, non dedotto', () => {
  const r = deduzioneFiscale({ versato: 0, tetto: FINTO.tetto, aliquotaIrpef: FINTO.irpef });
  deve(r.dedotto === 0 && r.eccedenza === 0 && r.risparmio === 0, 'con zero versato è uscito ' + JSON.stringify(r));
  return 'zero versato: tre zeri, nessun NaN';
});

// ── 7. LA TASSAZIONE DELLA PRESTAZIONE ────────────────────────────────────────

prova('prima della soglia l\'aliquota è quella base', () => {
  const a = tassazionePrestazione({ anni: 10, ...FINTO.tassa });
  uguale(a, 0.15, 'l\'aliquota a dieci anni');
  return 'dieci anni di permanenza, nessuno sconto (parametri finti)';
});

prova('dopo la soglia scende di un passo per anno', () => {
  /* Si contano solo gli anni OLTRE la soglia: contarli tutti dal primo è
     l'errore che regala sconti a chi non li ha maturati. */
  const a = tassazionePrestazione({ anni: 20, ...FINTO.tassa });
  uguale(a, 0.15 - 0.003 * 5, 'l\'aliquota a vent\'anni');
  return 'cinque anni oltre la soglia, cinque passi di sconto';
});

prova('lo sconto ha un pavimento', () => {
  /* Senza il pavimento, una carriera lunga porterebbe l'aliquota sotto zero:
     cioè lo Stato che paga il cliente. */
  const a = tassazionePrestazione({ anni: 50, ...FINTO.tassa });
  uguale(a, 0.09, 'l\'aliquota dopo cinquant\'anni');
  const b = tassazionePrestazione({ anni: 500, ...FINTO.tassa });
  deve(b >= 0.09, 'sotto il pavimento: ' + b);
  return 'sconto sì, aliquota negativa no';
});

prova('gli anni parziali non contano, salvo dire il contrario', () => {
  /* Undici anni e mezzo valgono undici. E' la scelta prudente e va confermata:
     chi vuole contare anche i mesi lo chiede esplicitamente. */
  uguale(tassazionePrestazione({ anni: 20.9, ...FINTO.tassa }), tassazionePrestazione({ anni: 20, ...FINTO.tassa }), 'i mesi in più');
  const conMesi = tassazionePrestazione({ anni: 20.9, ...FINTO.tassa, soloAnniInteri: false });
  deve(conMesi < tassazionePrestazione({ anni: 20, ...FINTO.tassa }), 'contando i mesi l\'aliquota dovrebbe scendere un po\', invece resta ' + conMesi);
  return 'di riserva si arrotonda per difetto, ma la scelta è a vista';
});

prova('nessuno dei quattro parametri fiscali ha un valore di riserva', () => {
  /* Sono quattro numeri di legge. Se uno solo di loro avesse un valore scritto
     qui, il preventivo continuerebbe a uscire dopo la prossima riforma — uguale
     e sbagliato. */
  const casi = [
    [{ anni: 20, riduzionePerAnno: 0.003, aliquotaMinima: 0.09, annoDaCuiSiRiduce: 15 }, /aliquotaBase/i],
    [{ anni: 20, aliquotaBase: 0.15, aliquotaMinima: 0.09, annoDaCuiSiRiduce: 15 }, /riduzionePerAnno/i],
    [{ anni: 20, aliquotaBase: 0.15, riduzionePerAnno: 0.003, annoDaCuiSiRiduce: 15 }, /aliquotaMinima/i],
    [{ anni: 20, aliquotaBase: 0.15, riduzionePerAnno: 0.003, aliquotaMinima: 0.09 }, /annoDaCuiSiRiduce/i],
  ];
  for (const [dati, atteso] of casi) sbaglia(() => tassazionePrestazione(dati), atteso, 'parametro fiscale mancante');
  return 'quattro parametri, quattro rifiuti col nome giusto';
});

prova('parametri invertiti o scritti in punti percentuali: si vede', () => {
  /* Un minimo più alto della base vuol dire che chi ha compilato ha invertito
     due caselle: l'aliquota crescerebbe con gli anni di permanenza. */
  sbaglia(() => tassazionePrestazione({ anni: 20, aliquotaBase: 0.09, riduzionePerAnno: 0.003, aliquotaMinima: 0.15, annoDaCuiSiRiduce: 15 }), /invertit|minima/i, 'minimo sopra la base');
  // «0,30 punti all'anno» scritto 30 invece che 0.003.
  sbaglia(() => tassazionePrestazione({ anni: 20, aliquotaBase: 0.15, riduzionePerAnno: 30, aliquotaMinima: 0.09, annoDaCuiSiRiduce: 15 }), /percentuale/i, 'riduzione in punti');
  return 'due modi tipici di compilare male, due errori parlanti';
});

// ── LE IPOTESI DA STAMPARE ACCANTO AL RISULTATO ───────────────────────────────

prova('le ipotesi stampate sono quelle davvero ricevute', () => {
  /* E' il punto di tutta la funzione. Se l'elenco per il cliente fosse una
     seconda lista scritta a mano, prima o poi direbbe un coefficiente e il conto
     ne userebbe un altro — e la differenza si scoprirebbe sul foglio consegnato.
     Qui si cambia un valore e si controlla che il testo cambi con lui, e che il
     numero grezzo torni indietro identico a quello passato. */
  const usati = { coefficiente: 0.05, etaUscita: 67, aliquota: 0.33 };
  const a = ipotesiUsate(usati);
  const coeff = a.find((x) => x.nome === 'coefficiente');
  deve(coeff, 'il coefficiente non compare nell\'elenco delle ipotesi');
  deve(coeff.valore === usati.coefficiente, 'il valore riportato (' + coeff.valore + ') non è quello usato nel conto (' + usati.coefficiente + ')');
  deve(/5/.test(coeff.testo), 'il testo non mostra il valore: «' + coeff.testo + '»');
  const b = ipotesiUsate({ ...usati, coefficiente: 0.061 });
  deve(b.find((x) => x.nome === 'coefficiente').testo !== coeff.testo, 'cambiando il coefficiente il foglio dice ancora la stessa cosa: l\'elenco non è collegato ai parametri');
  return 'cambia il parametro, cambia la riga stampata';
});

prova('si elenca solo quello che è stato usato', () => {
  /* Stampare tutto il catalogo, anche i parametri che non c'entrano con questo
     conto, vorrebbe dire mettere sul foglio del cliente numeri che non hanno
     toccato il risultato: sembrerebbero ipotesi e non lo sono. */
  const e = ipotesiUsate({ aliquota: 0.33 });
  deve(!e.some((x) => x.nome === 'tetto'), 'ha stampato il tetto di deducibilità in un conto dove non è mai entrato');
  deve(e.some((x) => x.nome === 'aliquota'), 'non ha stampato l\'unico parametro che è stato usato');
  return 'sul foglio finisce quello che ha toccato il risultato';
});

prova('l\'età sta accanto al coefficiente', () => {
  /* Un coefficiente senza l'età non si può ricontrollare: sono decine di numeri
     diversi in una tabella sola, e senza sapere a che età si riferisce nessuno
     può dire se era quello giusto. */
  const e = ipotesiUsate({ coefficiente: 0.057, etaUscita: 67 });
  const eta = e.find((x) => x.nome === 'etaUscita');
  deve(eta && /67/.test(eta.testo), 'l\'età di uscita non compare accanto al coefficiente');
  deve(e.findIndex((x) => x.nome === 'etaUscita') === e.findIndex((x) => x.nome === 'coefficiente') + 1, 'l\'età non è vicina al coefficiente nell\'elenco');
  return 'coefficiente 0,057 e a che età: 67 anni';
});

prova('i tassi si scrivono in percentuale italiana, gli euro in euro', () => {
  /* Sul foglio del cliente non ci va «0.0175». Chi lo legge deve riconoscere il
     numero che ha sentito al telegiornale, con la virgola al posto giusto. */
  const e = ipotesiUsate({ rivalutazioni: 0.0175, tetto: 5164.57, riduzionePerAnno: 0.003 });
  const dice = (n) => e.find((x) => x.nome === n).testo;
  deve(/1,75%/.test(dice('rivalutazioni')), 'la rivalutazione è scritta «' + dice('rivalutazioni') + '»');
  deve(/5\.164,57 €/.test(dice('tetto')), 'il tetto è scritto «' + dice('tetto') + '»');
  deve(/0,3 punti/.test(dice('riduzionePerAnno')), 'la riduzione è scritta «' + dice('riduzionePerAnno') + '»');
  return '1,75% — 5.164,57 € — 0,3 punti percentuali all\'anno';
});

prova('trenta tassi diversi diventano una riga leggibile', () => {
  /* Una rivalutazione per ogni anno di carriera stampata riga per riga non la
     legge nessuno: si dice quanti anni sono e fra quali estremi si sono mossi, e
     il dettaglio resta nel campo «valore» per chi deve ricontrollare. */
  const tassi = [0.01, 0.025, -0.005];
  const v = ipotesiUsate({ rivalutazioni: tassi }).find((x) => x.nome === 'rivalutazioni');
  deve(/3 anni/.test(v.testo) && /-0,5%/.test(v.testo) && /2,5%/.test(v.testo), 'la riga dice «' + v.testo + '»');
  deve(v.valore === tassi, 'il dettaglio anno per anno è andato perso');
  return '«' + v.testo + '», col dettaglio ancora disponibile';
});

prova('le scelte di modello si stampano anche quando nessuno le ha fatte', () => {
  /* E' la parte che si dimentica: il conto una strada l'ha presa comunque. Se
     sul foglio non c'è scritta, fra due anni nessuno saprà se quella cifra era
     stata fatta rivalutando prima o dopo — ed è proprio lì che le due strade si
     allontanano. */
  const e = ipotesiUsate({ aliquota: 0.33 });
  const ordine = e.find((x) => x.nome === 'ordine');
  deve(ordine, 'l\'ordine di rivalutazione non compare sul foglio');
  deve(ordine.valore === ORDINE_ITALIANO, 'la scelta di riserva stampata (' + ordine.valore + ') non è quella che il motore usa davvero');
  deve(ordine.diRiserva === true && /riserva/i.test(ordine.testo), 'non dice che era la scelta di riserva: «' + ordine.testo + '»');
  const scelto = ipotesiUsate({ aliquota: 0.33, ordine: ORDINE_FONDO }).find((x) => x.nome === 'ordine');
  deve(scelto.diRiserva === false && !/riserva/i.test(scelto.testo), 'una scelta fatta apposta viene spacciata per valore di riserva');
  deve(/somma.*poi.*rivaluta/i.test(scelto.testo), 'non spiega in italiano quale strada è stata presa: «' + scelto.testo + '»');
  return 'la strada presa è scritta, anche quando l\'ha scelta il motore';
});

prova('quello che il motore usa davvero e quello che stampa coincidono', () => {
  /* La riprova che le due cose non possono divergere: si fa il conto senza
     indicare l'ordine, si stampa l'ipotesi, e si rifà il conto forzando proprio
     quello che l'ipotesi dichiara. Devono venire identici. Se un giorno la
     scelta di riserva del motore cambiasse senza cambiare il foglio, questa
     prova diventerebbe rossa. */
  const dati = { storico: [10000, 10000], aliquota: 1, rivalutazioni: 0.1 };
  const senza = montanteContributivo(dati);
  const dichiarato = ipotesiUsate(dati).find((x) => x.nome === 'ordine').valore;
  const forzato = montanteContributivo({ ...dati, ordine: dichiarato });
  uguale(forzato.montante, senza.montante, 'il montante rifatto con l\'ordine dichiarato sul foglio');
  return 'il foglio dichiara la stessa strada che il motore ha preso';
});

prova('niente sparisce dal foglio, nemmeno quello che non sappiamo etichettare', () => {
  /* Un'ipotesi che non compare è peggio di un'ipotesi scritta male: la prima
     nessuno la può contestare. Se qualcuno passa un parametro nuovo, esce col
     suo nome tecnico — brutto da vedere, e proprio per questo si sistema. */
  const e = ipotesiUsate({ aliquota: 0.33, sconto_speciale: 0.1 });
  const ignoto = e.find((x) => x.nome === 'sconto_speciale');
  deve(ignoto, 'un parametro non catalogato è sparito dall\'elenco delle ipotesi');
  deve(ignoto.tipo === 'altro', 'non è segnalato come voce senza etichetta');
  return 'una voce senza etichetta si vede, e si può sistemare';
});

prova('l\'ordine delle righe non dipende da come sono arrivati i dati', () => {
  /* Due analisi fatte lo stesso giorno devono avere le ipotesi nello stesso
     ordine, altrimenti confrontarle diventa un lavoro da fare a occhio. */
  const a = ipotesiUsate({ aliquota: 0.33, coefficiente: 0.05, tetto: 5000 });
  const b = ipotesiUsate({ tetto: 5000, coefficiente: 0.05, aliquota: 0.33 });
  deve(a.map((x) => x.nome).join() === b.map((x) => x.nome).join(), 'stesse ipotesi, ordine diverso:\n  ' + a.map((x) => x.nome).join() + '\n  ' + b.map((x) => x.nome).join());
  return 'stesse ipotesi, stesso ordine, sempre';
});

prova('il valore esatto resta accanto al testo arrotondato', () => {
  /* Il testo è per gli occhi, il valore è per i controlli. Se restasse solo il
     testo, ricostruire il conto di due anni fa vorrebbe dire ripartire da un
     numero già arrotondato. */
  const v = ipotesiUsate({ coefficiente: 0.0571234567 }).find((x) => x.nome === 'coefficiente');
  deve(v.valore === 0.0571234567, 'il valore esatto è stato arrotondato anche lui: ' + v.valore);
  deve(v.testo.length < 30, 'il testo per il cliente è illeggibile: «' + v.testo + '»');
  return 'testo corto per il foglio, numero intero per i controlli';
});

prova('una stampa non esplode mai per colpa di un valore storto', () => {
  /* Il calcolo si ferma sugli ingressi sbagliati, e fa bene. Questa funzione no:
     serve a stampare, e una stampa che esplode lascia il cliente senza foglio e
     il collaboratore senza sapere perché. Il valore storto si scrive com'è. */
  const e = ipotesiUsate({ coefficiente: 'zero virgola zero cinque', tetto: null });
  const c = e.find((x) => x.nome === 'coefficiente');
  deve(c && /non utilizzabile/i.test(c.testo), 'un valore storto non viene segnalato: «' + (c && c.testo) + '»');
  const t = e.find((x) => x.nome === 'tetto');
  deve(t && /non utilizzabile/i.test(t.testo), 'un tetto vuoto passa come se fosse un numero: «' + (t && t.testo) + '»');
  // Ma un elenco al posto di un oggetto è un errore di chi chiama, e va detto.
  sbaglia(() => ipotesiUsate([0.33]), /oggetto/i, 'ipotesi passate come elenco');
  return 'il foglio esce comunque, col valore storto bene in vista';
});

prova('senza parametri l\'elenco dice comunque le scelte di modello', () => {
  // Un'analisi senza ipotesi non esiste, ma il foglio non deve venire vuoto e muto.
  const e = ipotesiUsate();
  deve(e.length === 4 && e.every((x) => x.tipo === 'scelta di modello'), 'chiamata a vuoto ha restituito ' + JSON.stringify(e.map((x) => x.nome)));
  return 'restano le quattro scelte di modello, tutte marcate «di riserva»';
});

// ── L'ELENCO DEI PARAMETRI ────────────────────────────────────────────────────

prova('l\'elenco dei parametri ufficiali è completo e senza valori', () => {
  /* L'elenco serve a farlo compilare al cliente: se una voce non dice l'unità di
     misura, tornerà indietro un 33 al posto di uno 0,33. E se qualcuno un
     giorno ci scrive dentro un valore, questa prova diventa rossa — che è
     esattamente il momento in cui un numero di legge sta entrando nel codice. */
  deve(Array.isArray(PARAMETRI_RICHIESTI) && PARAMETRI_RICHIESTI.length >= 10, 'l\'elenco ha solo ' + PARAMETRI_RICHIESTI.length + ' voci');
  for (const p of PARAMETRI_RICHIESTI) {
    deve(p.nome && p.cosaE && p.unita && p.fonte, 'una voce è incompleta: ' + JSON.stringify(p));
    deve(!('valore' in p) && !('default' in p), 'la voce «' + p.nome + '» ha un valore scritto dentro: i numeri ufficiali non stanno nel codice');
    deve(/frazione|EURO|anni/i.test(p.unita), 'la voce «' + p.nome + '» non dice l\'unità di misura: ' + p.unita);
    /* Senza etichetta e formato la voce non arriverebbe sul foglio del cliente,
       o ci arriverebbe col suo nome tecnico: il catalogo serve a due cose e
       deve essere completo per tutte e due. */
    deve(p.etichetta && p.formato, 'la voce «' + p.nome + '» non sa come farsi stampare al cliente');
  }
  return PARAMETRI_RICHIESTI.length + ' parametri, tutti con unità di misura e nessun valore';
});

const ko = esiti.filter((e) => !e[0]);
console.log('\n── Il motore previdenziale ──────────────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
