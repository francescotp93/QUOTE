/* ═══════════════════════════════════════════════════════════════════════════
   PREVIDENZA — il calcolo TFR e fondo pensione, in un posto solo.

   Come gli altri motori di questa cartella, il file lo caricano DUE mondi: la
   pagina nel browser (<script src>) e Node (require) per le prove. Niente
   import/export, niente compilazione: in fondo si espone a chi lo carica.

   ── DA DOVE VIENE ────────────────────────────────────────────────────────
   Il corpo di `pianoAzienda` e' quello di `buildPIVATable` del progetto Lab
   (lab-insurance-marketing), spostato senza cambiare un'operazione. Non e'
   pigrizia: e' l'unico modo di poter affermare che i numeri non sono cambiati
   spostandosi. Una riscrittura «piu' pulita» di un calcolo non da' nessun
   errore quando sbaglia — produce un preventivo storto che finisce in mano a
   un cliente. La prova di parita' rifa' il conto con la formula vecchia e
   confronta: server/verifica/parita-previdenza.test.mjs.

   ── TRE COSE CAMBIATE APPOSTA ────────────────────────────────────────────

   1) LE IPOTESI SONO DATI, NON COSTANTI SEPOLTE. Nel Lab erano `const` in
      cima al file: nessuno le vedeva e nessuno poteva cambiarle. Qui ognuna
      porta con se' etichetta, valore, unita' e da dove viene, cosi' la
      schermata puo' mostrarle ACCANTO ai numeri e il consulente puo'
      correggerle. Un rendimento del 3,5% non e' un fatto: e' un'ipotesi, e chi
      firma il report deve poterla leggere e discutere.

   2) NESSUNA DATA «ADESSO» NASCOSTA DENTRO. Il Lab chiamava
      `new Date().getFullYear()` dentro il calcolo. Un conto che cambia da solo
      col passare del tempo non si puo' firmare, e qui si firma davvero: il
      report va al cliente. L'anno di partenza si passa da fuori, sempre.

   3) OGNI RISULTATO PORTA LE SUE IPOTESI E LA VERSIONE DELLE REGOLE. Un report
      di sei mesi fa deve restare rileggibile con le regole con cui e' nato.
      Per questo ogni risultato include lo snapshot completo di cio' che e'
      stato usato per produrlo: senza, fra un anno nessuno sapra' piu' dire
      perche' quel numero era quel numero.

   TUTTO STA DENTRO UN CONTENITORE: da <script src> ogni `var` di primo livello
   diventerebbe una variabile globale della pagina, e index.html ha gia' i suoi
   nomi.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* Cambia quando cambia una REGOLA di calcolo, non quando si cambia un'ipotesi
   (quelle viaggiano nello snapshot di ogni singolo risultato). */
/* Cambiata il 04/09/2026: importi in euro di oggi, tassi nominali costruiti
   da inflazione e componente reale, coefficiente di trasformazione che decade.
   I fogli consegnati prima portano la versione precedente, ed e' quello che li
   distingue: gli stessi dati danno numeri molto diversi. */
var VERSIONE_REGOLE = '2026-09-04b';

/* ── Le ipotesi ────────────────────────────────────────────────────────────
   `v` e' il valore usato dal calcolo. Il resto serve a mostrarlo a chi legge:
   `etichetta` sulla schermata, `unita` per formattare, `fonte` per rispondere
   alla domanda «e questo numero da dove esce?» senza aprire il codice.
   `modificabile:false` marca cio' che viene dalla legge e non si tocca. */
var IPOTESI = {
  coeffTfr: { v: 13.5, etichetta: 'Divisore del TFR', unita: '', modificabile: false,
    fonte: 'Art. 2120 c.c.: la quota annua è la retribuzione divisa per 13,5' },
  dedAzienda: { v: 0.04, etichetta: 'Deduzione dal reddito d\'impresa', unita: '%', modificabile: false,
    fonte: 'Art. 105 TUIR: 4%, che diventa 6% sotto i 50 dipendenti' },
  dedAziendaPiccola: { v: 0.06, etichetta: 'Deduzione (sotto i 50 dipendenti)', unita: '%', modificabile: false,
    fonte: 'Art. 105 TUIR' },
  sogliaPiccola: { v: 50, etichetta: 'Soglia «piccola impresa»', unita: 'dipendenti', modificabile: false,
    fonte: 'Sotto questa soglia la deduzione passa dal 4% al 6%' },
  fondoGaranzia: { v: 0.002, etichetta: 'Esonero Fondo di Garanzia INPS', unita: '%', modificabile: false,
    fonte: '0,20% del monte retributivo' },
  oneriImpropri: { v: 0.0028, etichetta: 'Riduzione oneri impropri', unita: '%', modificabile: false,
    fonte: '0,28% del monte retributivo' },
  /* DERIVATA, non piu' scritta a mano: art. 2120 c.c. dice 1,5% fisso piu' il
     75% dell'aumento ISTAT. Con un valore cablato, cambiare l'inflazione
     lasciava la rivalutazione del TFR ferma dov'era — due ipotesi che si
     contraddicono dentro lo stesso foglio. */
  rivalTfrFissa: { v: 0.015, etichetta: 'TFR: quota fissa di rivalutazione', unita: '%', modificabile: false,
    fonte: 'Art. 2120 c.c.: 1,5% fisso' },
  rivalTfrQuotaInflazione: { v: 0.75, etichetta: 'TFR: quota dell\'inflazione', unita: '%', modificabile: false,
    fonte: 'Art. 2120 c.c.: 75% dell\'aumento dell\'indice ISTAT' },
  rivalTfr: { v: 0.03, etichetta: 'Rivalutazione annua del TFR in azienda', unita: '%', modificabile: false,
    derivata: 'rivalTfrFissa + rivalTfrQuotaInflazione × inflazione',
    fonte: 'Art. 2120 c.c.: 1,5% fisso + 75% dell\'inflazione attesa' },
  /* ATTENZIONE — numero cambiato rispetto al Lab, ed e' l'unico.
     Il Lab usava 11%: e' l'aliquota in vigore FINO AL 2014. Dal 2015 (Legge di
     Stabilita' 2015) e' il 17%. Tenere l'11% sottostimava di circa un terzo il
     vantaggio dell'azienda su quella voce — un errore che gioca CONTRO la
     proposta, ma resta un errore. `daConfermare` resta acceso finche' qualcuno
     non lo verifica sul testo di legge: vedi `NUMERI_DA_CONFERMARE`. */
  /* Il 17% dal 1° gennaio 2015. Nota storica, che sta QUI e non nella fonte
     letta dal cliente: fino al 2014 era l'11%, ed e' il valore che usava il
     progetto da cui questo calcolo e' stato ripreso. Tenere l'11% sottostimava
     di circa un terzo il vantaggio dell'azienda su quella voce. */
  aliqImpostaRival: { v: 0.17, etichetta: 'Imposta sostitutiva sulla rivalutazione', unita: '%', modificabile: false,
    fonte: 'Art. 11 c. 3 D.Lgs. 47/2000, come modificato dalla L. 190/2014 art. 1 c. 623, in vigore dal 1° gennaio 2015' },
  /* IL DEFLATORE DI TUTTO IL MODULO. Da qui si costruiscono la crescita del
     reddito, la rivalutazione del montante e quella del TFR, e con questa si
     riportano gli importi a euro di oggi. Cambiarla muove ogni numero del
     foglio, ed e' giusto cosi': prima era un'ipotesi che valeva per un conto
     solo. */
  inflazione: { v: 0.02, etichetta: 'Inflazione attesa', unita: '%', modificabile: true,
    fonte: 'Obiettivo BCE (2%) e ipotesi standard COVIP per il Prospetto delle prestazioni' },
  crescitaRealeReddito: { v: 0.01, etichetta: 'Crescita del reddito OLTRE l\'inflazione', unita: '%', modificabile: true,
    fonte: 'Ipotesi standard COVIP per il Prospetto delle prestazioni' },
  crescitaRealePIL: { v: 0.01, etichetta: 'Crescita del PIL oltre l\'inflazione', unita: '%', modificabile: true,
    daConfermare: true,
    fonte: 'Da confermare sulle proiezioni della Ragioneria Generale dello Stato' },
  rendFondo: { v: 0.035, etichetta: 'Rendimento netto del fondo', unita: '%', modificabile: true,
    fonte: 'Ipotesi prudenziale, NOMINALE. Non è garantito e non è una promessa' },
  /* Il rendimento si contratta in nominale — e' cosi' che lo scrivono i fondi —
     ma quello che conta e' quanto batte l'inflazione: un 3,5% con inflazione al
     2% e' un 1,47% reale, e detto cosi' cambia la conversazione. */
  rendFondoReale: { v: 0.0147, etichetta: 'Rendimento del fondo oltre l\'inflazione', unita: '%', modificabile: false,
    derivata: '(1 + rendFondo) / (1 + inflazione) − 1',
    fonte: 'Ricavato dal rendimento nominale e dall\'inflazione attesa' },
  dedMax: { v: 5164.57, etichetta: 'Deduzione massima annua', unita: '€', modificabile: false,
    fonte: 'Art. 8 D.lgs. 252/2005, previdenza complementare' },
  aliqContributivaDipendente: { v: 0.33, etichetta: 'Aliquota contributiva (dipendente)', unita: '%', modificabile: true,
    fonte: 'Quota che finisce nel montante contributivo: 33% della retribuzione' },
  aliqContributivaAutonomo: { v: 0.24, etichetta: 'Aliquota contributiva (autonomo)', unita: '%', modificabile: true,
    fonte: 'Gestione separata / artigiani e commercianti, ordine di grandezza' },
  capitalizzazioneMontante: { v: 0.0302, etichetta: 'Rivalutazione del montante', unita: '%', modificabile: false,
    derivata: '(1 + inflazione) × (1 + crescitaRealePIL) − 1',
    fonte: 'Media quinquennale del PIL NOMINALE (L. 335/1995 art. 1 c. 9), costruita da inflazione e crescita reale' },
  /* NON PIU' UN NUMERO SCIOLTO. Con la crescita nominale al 2% e l'inflazione
     al 2%, lo stipendio REALE e' fermo — e il modulo lo presentava come una
     carriera che cresce. Adesso si sceglie di quanto cresce oltre l'inflazione,
     e la nominale viene da se'. */
  crescitaReddito: { v: 0.0302, etichetta: 'Crescita del reddito', unita: '%', modificabile: false,
    derivata: '(1 + inflazione) × (1 + crescitaRealeReddito) − 1',
    fonte: 'Costruita da inflazione attesa e crescita reale del reddito' },
  contributoFondoGaranziaTfr: { v: 0.005, etichetta: 'Contributo al Fondo di Garanzia sul TFR', unita: '%', modificabile: false,
    fonte: '0,50% della quota, trattenuto sul TFR lasciato in azienda' },
  tassaRendimentiFondo: { v: 0.20, etichetta: 'Imposta sui rendimenti del fondo', unita: '%', modificabile: false,
    daConfermare: true,
    fonte: '20% sui rendimenti maturati (ridotta al 12,5% sulla quota in titoli di Stato)' },
  tassFinaleFondoBase: { v: 0.15, etichetta: 'Tassazione della prestazione del fondo', unita: '%', modificabile: false,
    fonte: 'Art. 11 D.lgs. 252/2005: 15% di base' },
  tassFinaleFondoSconto: { v: 0.003, etichetta: 'Sconto per ogni anno oltre il quindicesimo', unita: '%', modificabile: false,
    fonte: '0,30% l\'anno dal 16° anno di adesione' },
  tassFinaleFondoMinima: { v: 0.09, etichetta: 'Tassazione minima della prestazione', unita: '%', modificabile: false,
    fonte: 'Il 15% non scende sotto il 9% (35 anni di adesione)' },
  aliqTfrInAzienda: { v: 0.23, etichetta: 'Aliquota media IRPEF sul TFR in azienda', unita: '%', modificabile: true,
    fonte: 'Tassazione separata: aliquota media dei 5 anni precedenti. Qui è un\'ipotesi, si corregge' },
  sogliaAdeguato: { v: 0.70, etichetta: 'Soglia «posizione adeguata»', unita: '%', modificabile: true,
    fonte: 'Quota del divario da coprire perché la posizione si consideri a posto' },
  sogliaParziale: { v: 0.33, etichetta: 'Soglia «copertura parziale»', unita: '%', modificabile: true,
    fonte: 'Sotto questa quota la copertura si considera insufficiente' },
};

/* ── LE REGOLE FISCALI ─────────────────────────────────────────────────────
   Prima qui c'erano tre scaglioni e nient'altro, e il risparmio fiscale della
   deduzione si calcolava come «importo dedotto × aliquota marginale». E'
   sbagliato in tre casi, e sono tutti e tre casi veri:

   · REDDITI BASSI. Le detrazioni da lavoro azzerano l'imposta. La deduzione
     non vale NIENTE, e il modulo mostrava lo stesso un risparmio del 23%.
   · LA FASCIA IN CUI LA DETRAZIONE DECRESCE. Fra 15.000 e 50.000 la detrazione
     cala col reddito: il beneficio effettivo non e' l'aliquota di scaglione.
   · IL VERSAMENTO CHE SCAVALCA UNO SCAGLIONE. Se la deduzione porta il reddito
     sotto una soglia, una parte del beneficio vale all'aliquota alta e una a
     quella bassa: una sola aliquota non puo' dirlo.

   La deduzione non vale «l'aliquota per l'importo»: vale la DIFFERENZA fra
   l'imposta dovuta senza il versamento e quella dovuta con il versamento. Si
   calcola due volte l'imposta netta e si sottrae. E' l'unico modo che risponde
   giusto in tutti e tre i casi.

   ── DA DOVE VENGONO QUESTI NUMERI ────────────────────────────────────────
   Come i coefficienti di trasformazione: la copia buona sta nella tabella
   «Parametri previdenziali», questa qui e' la riserva. Finche' `daVerificare`
   resta acceso, ogni calcolo porta con se' l'avviso fino al foglio del
   cliente: sono valori indicati da Francesco il 03/09/2026 e non ancora
   riscontrati sulle fonti ufficiali. La bandiera si toglie a mano, quando
   qualcuno li ha letti sulla norma. */
var FISCO = {
  /* Verificato da Giulia il 04/09/2026 su Normattiva e Agenzia delle Entrate,
     testi vigenti al 03/09/2026. Resta acceso per UNA riga sola, elencata qui
     sotto: i valori della circolare INPS n. 6 del 30/01/2026 sono confermati da
     cinque fonti professionali concordanti che la citano, ma non letti sul PDF
     originale — il portale INPS non lo espone. La bandiera si spegne quando
     qualcuno li ha letti sull'originale. */
  daVerificare: true,
  daRiscontrare: ['prima fascia di retribuzione pensionabile (56.224 €) e massimale contributivo (122.295 €): circolare INPS n. 6 del 30/01/2026, non letta sull\'originale'],
  fonte: 'TUIR artt. 11, 13, 16-ter; L. 199/2025 art. 1 c. 3; L. 207/2024 art. 1 cc. 4-6; D.L. 3/2020 art. 1; circolare INPS n. 6 del 30/01/2026',
  scaglioni: [
    { fino: 28000, aliquota: 0.23 },
    /* 33% e non 35%: L. 30 dicembre 2025 n. 199 art. 1 c. 3, che ha sostituito
       le parole «35 per cento» nell'art. 11 c. 1 lett. b) TUIR. In vigore dal
       1/1/2026, a regime. Il 35% era il valore 2024-2025. */
    { fino: 50000, aliquota: 0.33 },
    { fino: Infinity, aliquota: 0.43 },
  ],
  /* I CONTRIBUTI NON SONO L'ALIQUOTA DI COMPUTO. Il 33% del dipendente e' il
     totale (23,81% datore + 9,19% lavoratore) e per due terzi lo versa il
     datore: dal lordo in busta e' gia' fuori. Quello che si toglie per
     arrivare all'imponibile fiscale e' solo la quota trattenuta al lavoratore.
     Sottrarre il 33% sbaglierebbe di venti punti.
     Nota di Giulia: il 9,19% e' 8,89% IVS + 0,30% CIGS, quindi si chiama
     «quota a carico del lavoratore», non «IVS». Per i datori non soggetti a
     CIGS scende a 8,89%. */
  contributi: {
    dipendente: { aliquota: 0.0919, primaFascia: 56224, oltrePrimaFascia: 0.01, massimale: 122295 },
    autonomo: { aliquota: 0.24, massimale: 122295 },
  },
  /* ── LE GESTIONI PREVIDENZIALI ─────────────────────────────────────────
     TRE numeri diversi per ogni gestione, e confonderli e' l'errore che
     produce due conti sbagliati insieme:

     · COMPUTO — con questa si costruisce il montante ai fini della pensione;
     · DOVUTA — quella effettivamente versata sul reddito, addizionali
       comprese. Per il commerciante e' piu' alta del computo;
     · A CARICO DEL LAVORATORE — la parte che grava su di lui, e quindi la
       sola che abbassa il suo imponibile IRPEF. Per il dipendente e' un
       quarto della dovuta (il resto lo versa il datore e dal lordo in busta
       e' gia' fuori); per il collaboratore e' un terzo; per artigiani,
       commercianti e professionisti e' tutta.

     Da qui viene anche la forbice fra lordo e imponibile, che per un
     professionista e' larghissima — 26 punti contro i 9 di un dipendente — e
     per questo si mostra fra le ipotesi.

     I valori sono quelli indicati da Francesco il 04/09/2026 e sono IN ATTESA
     di riscontro sulle circolari INPS: finche' `daVerificare` resta acceso,
     l'avviso arriva fino al foglio del cliente. */
  gestioni: {
    dipendenti_privati: { etichetta: 'Dipendente privato', computo: 0.33, dovuta: 0.33,
      aCarico: 0.0919, primaFascia: 56224, oltrePrimaFascia: 0.01, massimale: 122295,
      tfr: 'si', datoriale: 'si', canale: true, esposta: true, certezza: 'ufficiale',
      fonte: 'Circolare INPS n. 6 del 30/01/2026 (minimali, massimale, aliquota aggiuntiva 1%)' },

    /* DUE CASSE, UN'OPZIONE SOLA. Lo Stato (CTPS) sta al 33% di computo con
       l'8,80% a carico; gli enti locali (CPDEL, e le sorelle CPS, CPI, CPUG)
       stanno al 32,65% con l'8,85%. Si tiene lo Stato, per decisione di
       Francesco: e' la cassa piu' numerosa e i due numeri distano poco. Chi ha
       davanti un dipendente di ente locale corregge l'aliquota nel passo delle
       ipotesi.
       ATTENZIONE: sono gli unici due valori che Giulia NON ha potuto leggere
       su documento ufficiale — la scheda INPS che li contiene si carica via
       JavaScript e non risponde. Restano marcati. */
    dipendenti_pubblici: { etichetta: 'Dipendente pubblico', computo: 0.33, dovuta: 0.33,
      aCarico: 0.0880, primaFascia: 56224, oltrePrimaFascia: 0.01, massimale: 122295,
      tfr: 'regole proprie, non modellate', datoriale: 'regole proprie, non modellate',
      canale: false, esposta: true, certezza: 'secondaria',
      fonte: 'CTPS (Stato). Ripartizione 24,20/8,80 trovata solo su fonti secondarie concordanti: DA VERIFICARE. L\'1% oltre la prima fascia è invece ufficiale (art. 3-ter D.L. 384/1992, conv. L. 438/1992; circolare INPS n. 6 del 30/01/2026). Enti locali (CPDEL): computo 32,65%, a carico 8,85%.' },

    /* Per artigiani e commercianti la distinzione computo/dovuta sulla parte
       IVS NON ha contenuto: l'art. 24 c. 22 del D.L. 201/2011 parla di aliquote
       «di finanziamento E DI COMPUTO». Lo scarto nasce solo dalle addizionali
       non pensionistiche — lo 0,48% dei commercianti e i 7,44 euro l'anno di
       maternita', che nel montante non entrano. */
    artigiani: { etichetta: 'Artigiano', computo: 0.24, dovuta: 0.24, aCarico: 0.24,
      primaFascia: 56224, oltrePrimaFascia: 0.01, minimale: 18808, massimale: 122295,
      massimaleAnte96: 93707, fissoAnnuo: 7.44,
      tfr: 'no', datoriale: 'no', canale: false, esposta: true, certezza: 'ufficiale',
      fonte: 'Circolare INPS n. 14 del 09/02/2026, par. 1-4; art. 24 c. 22 D.L. 201/2011 conv. L. 214/2011; maternità art. 49 c. 1 L. 488/1999' },

    commercianti: { etichetta: 'Commerciante', computo: 0.24, dovuta: 0.2448, aCarico: 0.2448,
      primaFascia: 56224, oltrePrimaFascia: 0.01, minimale: 18808, massimale: 122295,
      massimaleAnte96: 93707, fissoAnnuo: 7.44,
      tfr: 'no', datoriale: 'no', canale: false, esposta: true, certezza: 'ufficiale',
      /* Lo 0,48% e' l'indennizzo per la cessazione dell'attivita': 0,46% al
         Fondo per la razionalizzazione della rete commerciale piu' 0,02% alla
         gestione. NON alimenta il montante, ed e' per questo che il computo
         resta 24%. */
      fonte: 'Circolare INPS n. 14 del 09/02/2026, par. 1. Indennizzo cessazione: art. 5 c. 2 D.Lgs. 207/1996, reso strutturale dall\'art. 1 c. 284 L. 145/2018, elevato allo 0,48% dall\'art. 1 c. 380 L. 178/2020' },

    gs_professionisti: { etichetta: 'Professionista con partita IVA', computo: 0.25, dovuta: 0.2607,
      aCarico: 0.2607, minimale: 18808, massimale: 122295,
      tfr: 'no', datoriale: 'no', canale: false, esposta: true, certezza: 'ufficiale',
      fonte: 'Circolare INPS n. 8 del 03/02/2026, par. 2 e 4.2. 25,00% IVS (art. 1 c. 165 L. 232/2016) + 0,72% (art. 59 c. 16 L. 449/1997) + 0,35% ISCRO (art. 1 c. 154 L. 213/2023), interamente a suo carico' },

    gs_collaboratori: { etichetta: 'Collaboratore o co.co.co.', computo: 0.33, dovuta: 0.3503,
      /* Un terzo a lui, due terzi al committente: quei due terzi non formano
         mai il suo reddito, quindi non entrano nell'imponibile. */
      aCarico: 0.3503 / 3, minimale: 18808, massimale: 122295,
      tfr: 'no', datoriale: 'no', canale: false, esposta: true, certezza: 'ufficiale',
      fonte: 'Circolare INPS n. 8 del 03/02/2026, par. 1.1 e 4.1. 33,00% IVS + 0,50% + 0,22% + 1,31% DIS-COLL; ripartizione un terzo al collaboratore e due terzi al committente. Le figure senza DIS-COLL stanno al 33,72%' },

    /* NON esposta nello step 2: e' un caso raro, e una domanda in piu' la
       pagherebbero tutti. Resta qui, e chi la incontra corregge l'aliquota
       nel passo delle ipotesi. */
    gs_con_altra_copertura: { etichetta: 'Gestione separata con altra copertura',
      computo: 0.24, dovuta: 0.24, aCarico: 0.24, minimale: 18808, massimale: 122295,
      tfr: 'no', datoriale: 'no', canale: false, esposta: false, certezza: 'ufficiale',
      fonte: 'Art. 1 c. 79 secondo periodo L. 247/2007: aliquota unica 24% per pensionati e già assicurati altrove, senza addizionali' },
  },

  // art. 13 c. 1 e c. 1.1 TUIR
  detrazioneDipendente: {
    fissa: 1955, finoA: 15000,
    prima: { a: 28000, base: 1910, quota: 1190, arco: 13000 },
    seconda: { a: 50000, base: 1910, arco: 22000 },
    extra: { importo: 65, da: 25000, a: 35000 },
  },
  // art. 13 c. 5 e c. 5-ter TUIR
  detrazioneAutonomo: {
    fissa: 1265, finoA: 5500,
    prima: { a: 28000, base: 500, quota: 765, arco: 22500 },
    seconda: { a: 50000, base: 500, arco: 22000 },
    extra: { importo: 50, da: 11000, a: 17000 },
  },
  /* Non e' una detrazione: e' una somma che si riceve, e solo se l'imposta
     lorda supera la detrazione da lavoro DIMINUITA DI 75 EURO. I 75 euro
     neutralizzano l'aumento della detrazione da 1.880 a 1.955: senza di essi
     una fascia di lavoratori lo perderebbe. Strutturale dal 2025 (L. 207/2024
     art. 1 c. 3). D.L. 3/2020 art. 1, conv. L. 21/2020. */
  trattamentoIntegrativo: {
    importo: 1200, finoA: 15000, scontoCapienza: 75,
    // Seconda fascia: spetta la differenza fra le detrazioni e l'imposta lorda.
    secondaFascia: { da: 15000, a: 28000, massimo: 1200 },
  },
  /* L. 207/2024 art. 1 c. 6: ulteriore detrazione per i redditi medi, a
     regime. Piatta fino a 32.000, poi decresce fino ad azzerarsi a 40.000. */
  ulterioreDetrazione: { importo: 1000, da: 20000, pieno: 32000, a: 40000, arco: 8000 },
  /* L. 207/2024 art. 1 c. 4: somma che NON concorre al reddito, per i
     dipendenti fino a 20.000 di reddito complessivo. Non e' una detrazione e
     non abbassa l'imposta: e' denaro che entra. */
  sommaNonImponibile: {
    finoA: 20000,
    scaglioni: [{ fino: 8500, quota: 0.071 }, { fino: 15000, quota: 0.053 }, { fino: Infinity, quota: 0.048 }],
  },
  /* L. 199/2025 art. 1 c. 4 → art. 16-ter c. 5-bis TUIR: sopra i 200.000 euro
     di reddito complessivo le detrazioni sono ridotte di 440 euro. */
  taglioAltiRedditi: { oltre: 200000, importo: 440 },
};

/* Il TRONCAMENTO alle prime quattro cifre decimali del rapporto e' obbligatorio
   (art. 13 c. 6 TUIR). Senza, i risultati divergono di qualche euro da quelli
   del CAF — e la differenza la trova il cliente, non noi. */
function tronca4(x) {
  return x > 0 ? Math.trunc(x * 10000) / 10000 : 0;
}

/* Aliquota marginale IRPEF per scaglione. Resta, ma solo come INFORMAZIONE:
   dice in che scaglione sta la persona, non quanto vale la sua deduzione. */
function aliquotaMarginale(imponibile, f) {
  var sc = ((f || FISCO).scaglioni) || FISCO.scaglioni;
  var r = Number(imponibile) || 0;
  for (var i = 0; i < sc.length; i++) if (r <= sc[i].fino) return sc[i].aliquota;
  return sc[sc.length - 1].aliquota;
}

/* Quanto si versa di contributi obbligatori, che dall'imponibile fiscale
   escono. Per il dipendente c'e' anche l'1% sulla quota oltre la prima fascia.
   Sopra il MASSIMALE non si versa piu' niente (per chi e' nel contributivo,
   art. 2 c. 18 L. 335/1995): senza quel tetto, sui redditi alti i contributi
   risultano piu' alti del vero e il risparmio fiscale ne esce gonfiato. */
/* La gestione, comunque venga indicata. Si accetta ancora il vecchio booleano
   «autonomo» perche' mezzo modulo lo passa cosi': true diventa artigiano,
   false dipendente privato. Chi passa il nome della gestione ha il conto
   giusto per la sua. */
function gestioneDi(g, f) {
  f = f || FISCO;
  var el = f.gestioni || {};
  if (typeof g === 'string' && el[g]) return el[g];
  if (g === true) return el.artigiani;
  return el.dipendenti_privati;
}

function contributiObbligatori(reddito, gestione, f) {
  f = f || FISCO;
  var g = gestioneDi(gestione, f);
  var r = Math.max(0, Number(reddito) || 0);
  /* IL MINIMALE. Per artigiani, commercianti e gestione separata i contributi
     si versano comunque su un reddito minimo: chi guadagna 10.000 euro paga
     come se ne avesse 18.808. Ignorarlo faceva uscire contributi troppo bassi
     proprio sui redditi bassi, cioe' dove l'imponibile conta di piu'.
     Non vale per i dipendenti: li' il minimale e' giornaliero e lo gestisce la
     busta paga. (circolare INPS n. 14/2026 par. 2 e n. 8/2026 par. 6) */
  if (r <= 0) return 0;
  var base = g.minimale ? Math.max(r, g.minimale) : r;
  if (g.massimale) base = Math.min(base, g.massimale);
  /* SOLO la quota a carico del lavoratore: e' quella che abbassa il suo
     imponibile. Per il dipendente il resto lo versa il datore e dal lordo in
     busta e' gia' fuori; per il collaboratore due terzi non formano mai il
     suo reddito. */
  var tot = base * g.aCarico;
  /* L'1% oltre la prima fascia: non e' solo dei dipendenti. INPS lo calcola
     anche per artigiani e commercianti, e lo tratta come contributo IVS
     (art. 3-ter D.L. 384/1992). */
  if (g.primaFascia) tot += Math.max(0, base - g.primaFascia) * (g.oltrePrimaFascia || 0);
  /* Il contributo maternita' e' un importo fisso, non un'aliquota: 7,44 euro
     l'anno per artigiani e commercianti. Piccolo, ma e' dovuto anche da chi
     sta al minimale, e in un conto che si firma i sette euro ci vanno. */
  if (g.fissoAnnuo && r > 0) tot += g.fissoAnnuo;
  return tot;
}

/* La forbice fra lordo e imponibile: per un professionista e' larghissima —
   26 punti contro i 9 di un dipendente — e va mostrata, perche' spiega da sola
   perche' due persone con lo stesso lordo pagano imposte molto diverse. */
function forbiceContributiva(reddito, gestione, f) {
  var g = gestioneDi(gestione, f);
  var c = contributiObbligatori(reddito, gestione, f);
  var r = Math.max(0, Number(reddito) || 0);
  return {
    gestione: g.etichetta, lordo: r, contributi: c, imponibile: Math.max(0, r - c),
    quota: r > 0 ? c / r : 0,
    computo: g.computo, dovuta: g.dovuta, aCarico: g.aCarico,
    tfr: g.tfr, datoriale: g.datoriale,
    certezza: g.certezza || null, fonte: g.fonte || null,
    alMinimale: !!(g.minimale && r < g.minimale),
    alMassimale: !!(g.massimale && r > g.massimale),
  };
}

// Il reddito su cui si applicano gli scaglioni: lordo meno i contributi.
function imponibileFiscale(reddito, gestione, f) {
  return Math.max(0, (Number(reddito) || 0) - contributiObbligatori(reddito, gestione, f));
}

// L'imposta lorda, scaglione per scaglione. Progressiva: ogni fetta la sua.
function irpefLorda(imponibile, f) {
  var sc = (f || FISCO).scaglioni;
  var r = Math.max(0, Number(imponibile) || 0);
  var imposta = 0, sotto = 0;
  for (var i = 0; i < sc.length && r > sotto; i++) {
    var tetto = Math.min(r, sc[i].fino);
    imposta += (tetto - sotto) * sc[i].aliquota;
    sotto = sc[i].fino;
  }
  return imposta;
}

/* La detrazione da lavoro, commisurata al REDDITO COMPLESSIVO — non
   all'imponibile al netto degli oneri deducibili. E' la distinzione che rende
   il conto diverso dall'aliquota marginale nella fascia in cui decresce. */
/* Le detrazioni da lavoro sono due sole: dipendente e autonomo. La gestione
   dice quale delle due — un collaboratore in gestione separata prende quella
   da lavoro dipendente, un professionista con partita IVA quella da lavoro
   autonomo. */
function eDaLavoroAutonomo(gestione, f) {
  if (typeof gestione === 'boolean') return gestione;
  var g = gestioneDi(gestione, f);
  return !/^Dipendente|^Collaboratore/.test(g.etichetta || '');
}
function detrazioneLavoro(redditoComplessivo, gestione, f) {
  f = f || FISCO;
  var d = eDaLavoroAutonomo(gestione, f) ? f.detrazioneAutonomo : f.detrazioneDipendente;
  var r = Math.max(0, Number(redditoComplessivo) || 0);
  var v;
  if (r <= d.finoA) v = d.fissa;
  else if (r <= d.prima.a) v = d.prima.base + d.prima.quota * tronca4((d.prima.a - r) / d.prima.arco);
  else if (r <= d.seconda.a) v = d.seconda.base * tronca4((d.seconda.a - r) / d.seconda.arco);
  else v = 0;
  // art. 13 c. 1.1 (dipendente, 65 €) e c. 5-ter (autonomo, 50 €)
  if (d.extra && r > d.extra.da && r <= d.extra.a) v += d.extra.importo;
  return Math.max(0, v);
}

/* L'ulteriore detrazione per i redditi medi (L. 207/2024 art. 1 c. 6): piatta
   fino a 32.000, poi decresce fino ad azzerarsi a 40.000. Solo dipendenti. */
function ulterioreDetrazione(redditoComplessivo, gestione, f) {
  f = f || FISCO;
  var u = f.ulterioreDetrazione;
  if (!u || eDaLavoroAutonomo(gestione, f)) return 0;
  var r = Math.max(0, Number(redditoComplessivo) || 0);
  if (r <= u.da) return 0;
  if (r <= u.pieno) return u.importo;
  if (r <= u.a) return u.importo * tronca4((u.a - r) / u.arco);
  return 0;
}

/* La somma che non concorre al reddito (L. 207/2024 art. 1 c. 4). Non abbassa
   l'imposta: e' denaro che entra, e per questo si tratta come il trattamento
   integrativo. Si calcola sul reddito di lavoro dipendente — qui coincide col
   reddito complessivo, perche' il modulo ne conosce uno solo. */
function sommaNonImponibile(redditoComplessivo, gestione, f) {
  f = f || FISCO;
  var s = f.sommaNonImponibile;
  if (!s || eDaLavoroAutonomo(gestione, f)) return 0;
  var r = Math.max(0, Number(redditoComplessivo) || 0);
  if (r > s.finoA) return 0;
  for (var i = 0; i < s.scaglioni.length; i++) if (r <= s.scaglioni[i].fino) return r * s.scaglioni[i].quota;
  return 0;
}

/* L'imposta netta, e tutto quello che serve per spiegarla. `oneriDeducibili`
   abbassa l'imponibile ma NON il reddito complessivo: la detrazione da lavoro
   si commisura al secondo. */
function irpefNetta(reddito, oneriDeducibili, autonomo, f) {
  f = f || FISCO;
  var contributi = contributiObbligatori(reddito, autonomo, f);
  var oneri = Math.max(0, Number(oneriDeducibili) || 0);
  /* IL CANALE NON CAMBIA IL BENEFICIO FISCALE. Un primo giro faceva scendere
     il reddito complessivo nel canale «tramite datore», e la detrazione da
     lavoro — che a quel reddito e' commisurata — saliva: a 24.000 euro il
     beneficio risultava del 32,2% invece del 23%. Decisione di Francesco del
     04/09/2026: il beneficio fiscale e' lo stesso nei due canali, e la
     differenza fra i canali si rappresenta per quello che e' — QUANDO si
     incassa il beneficio e a cosa da' accesso l'adesione — non con
     un'aliquota diversa. Vedi differenzeCanale() qui sotto.
     I contributi previdenziali si calcolano comunque sulla retribuzione
     piena in entrambi i canali: qui non entrano. */
  var complessivo = Math.max(0, (Number(reddito) || 0) - contributi);
  var imponibile = Math.max(0, complessivo - oneri);
  var lorda = irpefLorda(imponibile, f);
  var daLavoro = detrazioneLavoro(complessivo, autonomo, f);
  var ulteriore = ulterioreDetrazione(complessivo, autonomo, f);
  // Sopra i 200.000 le detrazioni sono ridotte di 440 € (art. 16-ter c. 5-bis).
  var taglio = (f.taglioAltiRedditi && complessivo > f.taglioAltiRedditi.oltre) ? f.taglioAltiRedditi.importo : 0;
  var detrazione = Math.max(0, daLavoro + ulteriore - taglio);
  var netta = Math.max(0, lorda - detrazione);

  /* IL TRATTAMENTO INTEGRATIVO, in due fasce.
     · fino a 15.000: spetta intero se l'imposta lorda supera la detrazione da
       lavoro DIMINUITA DI 75 €;
     · da 15.000 a 28.000: spetta la differenza fra le detrazioni e l'imposta
       lorda, non oltre l'importo pieno.
     Dedurre puo' spostare la persona da una parte all'altra: il conto per
     differenza se ne accorge da solo, ed e' il motivo per cui si fa cosi'.
     NOTA: le detrazioni per carichi di famiglia (art. 12) non sono nel modulo,
     quindi nella seconda fascia il trattamento integrativo puo' risultare piu'
     basso del vero. */
  var ti = 0;
  var t = f.trattamentoIntegrativo;
  if (t) {
    if (complessivo <= t.finoA) {
      if (lorda > Math.max(0, daLavoro - (t.scontoCapienza || 0))) ti = t.importo;
    } else if (t.secondaFascia && complessivo <= t.secondaFascia.a) {
      if (detrazione > lorda) ti = Math.min(t.secondaFascia.massimo, detrazione - lorda);
    }
  }
  var bonus = sommaNonImponibile(complessivo, autonomo, f);

  return {
    contributi: contributi, redditoComplessivo: complessivo, imponibile: imponibile,
    lorda: lorda, detrazioneDaLavoro: daLavoro, ulterioreDetrazione: ulteriore,
    taglioAltiRedditi: taglio, detrazione: detrazione,
    trattamentoIntegrativo: ti, sommaNonImponibile: bonus,
    netta: netta, dovutoNetto: netta - ti - bonus,
    azzerata: netta === 0,
  };
}

/* I DUE CANALI DI VERSAMENTO: cosa cambia davvero.
   Il beneficio fiscale e' lo stesso — stessa deduzione, stessa aliquota. A
   cambiare sono due cose, e sono quelle che vanno dette al cliente:

   · QUANDO SI INCASSA. Versando tramite il datore la deduzione opera in busta
     paga mese per mese: il netto sale subito. Versando direttamente, il
     beneficio si recupera con la dichiarazione dell'anno DOPO — fino ad allora
     il versamento pesa per intero sul bilancio familiare.
   · A COSA DA' ACCESSO. L'adesione tramite il datore apre il contributo
     datoriale (che il lavoratore perde se aderisce per conto suo) e il
     conferimento del TFR al fondo.

   Non e' una formula: e' un elenco di fatti che accompagna il numero. */
function differenzeCanale(canale) {
  var datore = canale === 'datore' || canale === true || canale === 1 || canale === '1';
  return {
    canale: datore ? 'datore' : 'diretto',
    etichetta: datore ? 'tramite il datore di lavoro' : 'versamento diretto',
    /* Si dice ANCHE quando i due canali si equivalgono: il consulente deve
       sapere che qui non c'e' niente da guadagnare, per non prometterlo. */
    beneficioFiscale: 'Il beneficio fiscale è lo stesso nei due canali: cambia quando lo si incassa, non quanto vale.',
    punti: datore
      ? ['La deduzione opera direttamente in busta paga, mese per mese: il netto sale subito, senza aspettare la dichiarazione.',
         'L\'adesione tramite il datore apre l\'accesso al contributo del datore di lavoro, che chi aderisce per conto proprio non riceve.',
         'Permette di conferire al fondo anche il TFR.']
      : ['Il beneficio fiscale si recupera con la dichiarazione dell\'anno successivo: fino ad allora il versamento pesa per intero.',
         'Restano fuori il contributo del datore di lavoro e il conferimento del TFR, che passano dall\'adesione tramite il datore.'],
  };
}

/* QUANTO VALE DAVVERO LA DEDUZIONE: la differenza fra le due imposte. */
function risparmioDaDeduzione(reddito, dedotto, autonomo, f) {
  var senza = irpefNetta(reddito, 0, autonomo, f);
  var con = irpefNetta(reddito, dedotto, autonomo, f);
  var risparmio = senza.dovutoNetto - con.dovutoNetto;
  var d = Math.max(0, Number(dedotto) || 0);
  return {
    risparmio: risparmio,
    /* IL GRADINO DEL TRATTAMENTO INTEGRATIVO. Dedurre puo' far scendere
       l'imposta lorda sotto la soglia di capienza e far perdere l'intero
       importo: il risparmio diventa NEGATIVO, cioe' versare costerebbe piu'
       del versamento. Un numero cosi' non si mostra come «risparmio»: si dice
       cosa sta succedendo. */
    perdeIlTrattamentoIntegrativo: senza.trattamentoIntegrativo > con.trattamentoIntegrativo,
    /* L'ALIQUOTA DA MOSTRARE AL CLIENTE: quanto rende ogni euro dedotto. Non
       coincide con quella di scaglione, ed e' proprio il punto. */
    aliquotaEffettiva: d > 0 ? risparmio / d : 0,
    senza: senza, con: con,
    /* Se senza versamento l'imposta e' gia' zero, la deduzione non vale
       niente: va detto, non nascosto dietro un numero che non esiste. */
    impostaAzzerata: senza.netta === 0,
  };
}

/* I numeri su cui non si mette la mano sul fuoco. La schermata li deve
   mostrare, e il report non va consegnato finche' restano qui dentro. */
function numeriDaConfermare(ip) {
  var out = [];
  for (var k in ip) {
    if (Object.prototype.hasOwnProperty.call(ip, k) && IPOTESI[k] && IPOTESI[k].daConfermare) {
      out.push({ chiave: k, etichetta: ip[k].etichetta, valore: ip[k].v, fonte: ip[k].fonte });
    }
  }
  return out;
}

/* Le ipotesi in vigore per un calcolo: le predefinite, piu' le correzioni di
   chi consulta. Si accettano sia `{rendFondo: 0.04}` sia `{rendFondo: {v: 0.04}}`,
   perche' dall'interfaccia arriva un numero e da un report salvato un oggetto. */
function ipotesiAttive(correzioni) {
  var out = {};
  for (var k in IPOTESI) {
    if (!Object.prototype.hasOwnProperty.call(IPOTESI, k)) continue;
    var base = IPOTESI[k];
    out[k] = { v: base.v, etichetta: base.etichetta, unita: base.unita,
               fonte: base.fonte, modificabile: base.modificabile, corretta: false };
  }
  if (correzioni) {
    for (var c in correzioni) {
      if (!Object.prototype.hasOwnProperty.call(correzioni, c) || !out[c]) continue;
      var val = correzioni[c] && typeof correzioni[c] === 'object' ? correzioni[c].v : correzioni[c];
      if (val == null || val === '' || isNaN(Number(val))) continue;
      /* Cio' che viene dalla legge non si corregge: accettarlo in silenzio
         produrrebbe un report che sembra valido e non lo e'. */
      if (!out[c].modificabile) continue;
      out[c].v = Number(val);
      out[c].corretta = true;
    }
  }
  /* Le derivate si ricalcolano ALLA FINE: se il consulente ha spostato
     l'inflazione, tutto quello che ne discende deve seguirla. */
  return derivaTassi(out);
}
var val = function (ip, k) { return ip[k].v; };

/* ── I TASSI DERIVATI ──────────────────────────────────────────────────────
   Un tasso nominale non e' un numero da scegliere: e' inflazione piu' una
   componente reale. Tenerli separati e' l'unico modo perche' un foglio non si
   contraddica — con la crescita del reddito al 2% nominale e l'inflazione al
   2%, lo stipendio reale e' FERMO, e finora il modulo lo presentava come una
   carriera che cresce.

   Si ricalcolano DOPO le correzioni del consulente: se lui cambia
   l'inflazione, tutto quello che ne discende lo segue. Se le derivate fossero
   correggibili a mano, si potrebbe salvare un foglio in cui l'inflazione dice
   una cosa e la rivalutazione del TFR un'altra. */
function componiNominale(inflazione, reale) {
  return (1 + inflazione) * (1 + reale) - 1;
}
function scorporaReale(nominale, inflazione) {
  return (1 + nominale) / (1 + inflazione) - 1;
}
function derivaTassi(out) {
  var i = out.inflazione.v;
  out.crescitaReddito.v = componiNominale(i, out.crescitaRealeReddito.v);
  out.capitalizzazioneMontante.v = componiNominale(i, out.crescitaRealePIL.v);
  out.rivalTfr.v = out.rivalTfrFissa.v + out.rivalTfrQuotaInflazione.v * i;
  out.rendFondoReale.v = scorporaReale(out.rendFondo.v, i);
  return out;
}

/* ── EURO DI OGGI ──────────────────────────────────────────────────────────
   Un importo che arriva fra trent'anni non si legge: «2.836 al mese» su uno
   stipendio di 1.846 fa concludere al cliente che la pensione gli basta e
   avanza, e la conversazione muore li'. Peggio ancora, il versamento e' in
   euro di oggi e la rendita in euro del 2060: «verso 50 e ottengo 170» mette a
   confronto due monete diverse, e gonfia il beneficio di circa due volte.
   Si riporta tutto a oggi, e lo si dichiara in testa al foglio. */
function deflaziona(nominale, anni, inflazione) {
  var n = Number(nominale) || 0;
  var a = Math.max(0, Number(anni) || 0);
  var i = Number(inflazione) || 0;
  if (i <= -1) return n;              // un'inflazione a -100% non esiste
  return n / Math.pow(1 + i, a);
}

/* ── IL COEFFICIENTE CHE DECADE ────────────────────────────────────────────
   I coefficienti di trasformazione sono agganciati alla speranza di vita e
   scendono. I due valori che si possono confrontare davvero, letti sui decreti,
   sono a PARITA' DI ETA': a 67 anni, 5,723% dal 2023 e 5,608% dal 2025 — meno
   2% in un biennio. (Il 6,136% che gira spesso e' l'eta' 65 della tabella
   originaria della L. 335/1995, non l'eta' 67: fino al 2012 i coefficienti
   erano tabulati solo fino a 65 anni, e confrontarlo con il 5,608% di oggi
   vuol dire confrontare due cose diverse.)
   Usare il coefficiente di oggi per chi esce nel 2060 sovrastima la pensione, e
   ogni punto di sovrastima e' un punto di divario che sparisce dal foglio.

   Si decade il RAPPORTO, non il valore: la curva e' fissata su un'eta' di
   riferimento (67 anni) e il fattore che ne esce si applica a qualunque eta'.
   Applicare l'obiettivo assoluto a chi esce a 62 anni darebbe un coefficiente
   piu' alto di quello di oggi, che e' il contrario di quello che succede.

   ATTENZIONE: vale solo per la pensione PUBBLICA. La rendita del fondo si
   converte con un coefficiente contrattuale suo, che non c'entra niente con
   questo — e oggi il modulo usa lo stesso per entrambe. Sta in F-11. */
/* La speranza di vita all'anno chiesto, presa dalla serie. Fra due anni
   pubblicati si interpola in modo lineare — e' un'approssimazione della SERIE,
   non del coefficiente, ed e' quella che fa chiunque lavori con dati
   quinquennali. Oltre l'ultimo anno pubblicato NON si estrapola: si tiene
   l'ultimo valore, perche' una vita attesa inventata al 2075 e' esattamente il
   tipo di numero che non deve finire su un preventivo. */
/* La serie arriva per SESSO, perche' ne' Eurostat ne' Istat pubblicano un
   totale nelle proiezioni. Ma il coefficiente di trasformazione e' UNISEX per
   legge: guidarlo con la vita attesa di un solo sesso sarebbe storto. Si pesa
   con la popolazione proiettata alla stessa eta', anno per anno e non con un
   peso fisso — la composizione fra uomini e donne a 67 anni cambia nel tempo,
   e nel 2060 si inverte.
   Un anno senza peso viene SALTATO, non pesato a occhio. */
function pesaPerSesso(serie, pesi) {
  var fuori = {};
  for (var a in serie) {
    if (!Object.prototype.hasOwnProperty.call(serie, a)) continue;
    var v = serie[a];
    if (v == null) continue;
    if (typeof v === 'number') { fuori[a] = v; continue; }
    var p = pesi && pesi[a];
    if (!p || !isFinite(Number(p.m)) || !isFinite(Number(p.f))) continue;
    if (!isFinite(Number(v.m)) || !isFinite(Number(v.f))) continue;
    fuori[a] = Number(p.m) * Number(v.m) + Number(p.f) * Number(v.f);
  }
  return fuori;
}

function speranzaAllAnno(serie, anno) {
  if (!serie || typeof serie !== 'object') return null;
  var anni = Object.keys(serie).map(Number).filter(function (x) {
    return isFinite(x) && isFinite(Number(serie[String(x)]));
  }).sort(function (x, y) { return x - y; });
  if (!anni.length) return null;
  var y = Number(anno);
  if (!isFinite(y)) return null;
  var primo = anni[0], ultimo = anni[anni.length - 1];
  if (y <= primo) return { valore: Number(serie[String(primo)]), come: 'primo anno della serie (' + primo + ')' };
  if (y >= ultimo) return { valore: Number(serie[String(ultimo)]), come: 'ultimo anno pubblicato (' + ultimo + '), tenuto fermo' };
  for (var i = 0; i < anni.length - 1; i++) {
    if (y >= anni[i] && y <= anni[i + 1]) {
      var a0 = anni[i], a1 = anni[i + 1];
      var v0 = Number(serie[String(a0)]), v1 = Number(serie[String(a1)]);
      if (y === a0 || a1 === a0) return { valore: v0, come: 'anno pubblicato' };
      if (y === a1) return { valore: v1, come: 'anno pubblicato' };
      return { valore: v0 + (v1 - v0) * (y - a0) / (a1 - a0), come: 'interpolato fra ' + a0 + ' e ' + a1 };
    }
  }
  return null;
}

function coefficienteProiettato(coeffOggi, annoUscita, annoOggi, curva, tabellaOggi) {
  var c = Number(coeffOggi) || 0;
  if (!curva || typeof curva !== 'object') return { usato: c, fattore: 1, applicata: false };
  var da = Number(annoOggi), a = Number(annoUscita);
  if (!isFinite(da) || !isFinite(a) || a <= da) return { usato: c, fattore: 1, applicata: false };

  /* IL METODO BUONO: dalla speranza di vita, non da una curva scelta a mano.
     Il coefficiente converte un capitale in una rendita vitalizia, quindi
     scende in proporzione a quanto si allunga la vita attesa all'eta' di
     uscita:

         coefficiente(anno) = coefficiente(2025) x e67(2025) / e67(anno)

     Cosi' il numero nasce da una serie ufficiale Istat e non da un'ipotesi
     nostra. Finche' la serie non c'e' in tabella si continua con la curva
     dichiarata dall'agenzia, il ripiego qui sotto: spegnere il decadimento in
     attesa della serie vorrebbe dire tornare, in silenzio, a una pensione piu'
     alta del vero. (04/09/2026) */
  if (curva.metodo === 'speranza_di_vita') {
    var serie = curva.pesi ? pesaPerSesso(curva.speranzaDiVita, curva.pesi) : curva.speranzaDiVita;
    var base = speranzaAllAnno(serie, curva.annoBase || da);
    var poi = speranzaAllAnno(serie, a);
    if (base && poi && base.valore > 0 && poi.valore > 0) {
      var fatt = base.valore / poi.valore;
      return {
        usato: c * fatt, fattore: fatt, applicata: true, metodo: 'speranza_di_vita',
        oggi: c, anno: a, annoBase: curva.annoBase || da,
        speranzaBase: base.valore, speranzaUscita: poi.valore, come: poi.come,
        etaSerie: curva.eta || null, ponderata: !!curva.pesi,
        /* Va scritto sul foglio: i coefficienti di legge incorporano anche un
           tasso di sconto e la reversibilita', quindi la proporzionalita' alla
           sola speranza di vita e' un'APPROSSIMAZIONE dichiarata, non il
           metodo con cui li calcola il decreto. (Francesco, 04/09/2026) */
        avvertenza: 'metodo proporzionale, approssimazione della tabella di legge',
        fonteSerie: curva.fonteSerie || null, fontePesi: curva.fontePesi || null,
      };
    }
    /* La serie c'e' ma non si puo' usare: non si ripiega in silenzio. */
    return { usato: c, fattore: 1, applicata: false, metodo: 'speranza_di_vita',
             motivo: 'la serie di speranza di vita non è utilizzabile per questo anno' };
  }

  // Da qui in giu' e' la curva lineare, che i suoi due estremi li vuole.
  if (!curva.obiettivo || !curva.anno) return { usato: c, fattore: 1, applicata: false };

  /* Il fattore di arrivo si legge sull'eta' di riferimento: se li' il
     coefficiente passa da 5,608% a 5,0%, il fattore e' 0,8916. */
  var rif = (tabellaOggi && curva.etaRiferimento && tabellaOggi[curva.etaRiferimento]) || null;
  if (!rif) return { usato: c, fattore: 1, applicata: false, motivo: 'manca il coefficiente dell\'età di riferimento' };
  var fattoreArrivo = curva.obiettivo / rif;

  var quota = Math.min(1, (a - da) / (Number(curva.anno) - da));
  if (!isFinite(quota) || quota < 0) return { usato: c, fattore: 1, applicata: false };
  var fattore = 1 + (fattoreArrivo - 1) * quota;
  return {
    usato: c * fattore, fattore: fattore, applicata: true, metodo: 'lineare',
    oggi: c, anno: a, obiettivo: curva.obiettivo, annoObiettivo: curva.anno,
    etaRiferimento: curva.etaRiferimento,
  };
}

/* «67a3m» sono 67 anni e 3 mesi, cioe' 67,25. E' cosi' che li pubblica la
   Ragioneria, ed e' cosi' che vanno letti: Number('67a3m') e' NaN, e un NaN nel
   confronto con l'eta' scelta lo rende sempre falso — l'avviso non sarebbe mai
   scattato, e nessuno se ne sarebbe accorto perche' il silenzio e' anche la
   risposta giusta quando il requisito non si conosce. */
function anniEMesi(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var m = /^\s*(\d+)\s*a\s*(?:(\d+)\s*m)?\s*$/i.exec(String(v));
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
  var n = Number(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}

function etaScritta(anni) {
  if (anni == null) return '';
  var interi = Math.floor(anni + 1e-9);
  var mesi = Math.round((anni - interi) * 12);
  if (mesi === 12) { interi += 1; mesi = 0; }
  return interi + ' anni' + (mesi ? ' e ' + mesi + (mesi === 1 ? ' mese' : ' mesi') : '');
}

/* Il requisito di eta' proiettato all'anno di uscita. Se non lo si conosce si
   dice che non lo si conosce: inventare un requisito e avvisare su quello
   sarebbe peggio del silenzio. */
function requisitoProiettato(anno, tabella) {
  if (!tabella || typeof tabella !== 'object') return null;
  var v = tabella[String(anno)];
  return (v === undefined || v === null) ? null : v;
}

/* La quota di TFR maturata in un anno. */
function tfrQuotaAnnua(retribuzioneAnnua, ip) {
  ip = ip || ipotesiAttive();
  return (Number(retribuzioneAnnua) || 0) / val(ip, 'coeffTfr');
}

/* ── C · LATO AZIENDA ──────────────────────────────────────────────────────
   Quanto vale, per l'azienda, destinare il TFR alla previdenza complementare.
   Quattro misure compensative che si sommano anno dopo anno:
     mis1  deduzione dal reddito d'impresa sulla quota di TFR versata
     mis2  esonero dal contributo al Fondo di Garanzia INPS
     mis3  riduzione degli oneri impropri
     mis4  esonero dall'imposta sostitutiva sulla rivalutazione del TFR
           gia' accantonato (dal secondo anno in poi: il primo anno non c'e'
           ancora nulla di accantonato da rivalutare)

   `annoInizio` arriva da fuori: vedi la nota 2 in testa al file. */
function pianoAzienda(dati, correzioni) {
  var ip = ipotesiAttive(correzioni);
  var dipendenti = Number(dati && dati.dipendenti) || 0;
  var stipendioMensile = Number(dati && dati.stipendioMensile) || 0;
  var anni = Number(dati && dati.anni) || 20;
  var annoInizio = Number(dati && dati.annoInizio);

  var problemi = [];
  if (dipendenti <= 0) problemi.push('Serve il numero di dipendenti.');
  if (stipendioMensile <= 0) problemi.push('Serve lo stipendio medio mensile.');
  if (!annoInizio) problemi.push('Serve l\'anno di partenza (va passato, non dedotto dall\'orologio).');
  if (anni <= 0) problemi.push('Serve un orizzonte di almeno un anno.');
  /* «Dati insufficienti» e' uno stato suo, diverso da un risultato a zero: un
     conto vuoto e un conto che fa zero non sono la stessa cosa. */
  if (problemi.length) {
    return { ok: false, motivo: 'dati_insufficienti', problemi: problemi,
             versioneRegole: VERSIONE_REGOLE, ipotesi: ip };
  }

  var piccola = dipendenti < val(ip, 'sogliaPiccola');
  var percDed = piccola ? val(ip, 'dedAziendaPiccola') : val(ip, 'dedAzienda');

  var righe = [];
  var monteCurr = dipendenti * stipendioMensile * 12;
  var monteIniziale = monteCurr;
  var tfrAccantonato = 0, rispTotale = 0, tfrTotale = 0;

  for (var i = 0; i < anni; i++) {
    var monte = monteCurr;
    var tfr = monte / val(ip, 'coeffTfr');
    tfrAccantonato += tfr;
    tfrTotale += tfr;
    var mis1 = tfr * percDed;
    var mis2 = monte * val(ip, 'fondoGaranzia');
    var mis3 = monte * val(ip, 'oneriImpropri');
    var mis4 = i > 0 ? (tfrAccantonato - tfr) * val(ip, 'rivalTfr') * val(ip, 'aliqImpostaRival') : 0;
    var rispAnno = mis1 + mis2 + mis3 + mis4;
    rispTotale += rispAnno;
    righe.push({ anno: annoInizio + i, monteRetributivo: monte, quotaTfr: tfr,
                 deduzione: mis1, fondoGaranzia: mis2, oneriImpropri: mis3,
                 esoneroRivalutazione: mis4, risparmioAnno: rispAnno, risparmioCumulato: rispTotale });
    monteCurr *= (1 + val(ip, 'inflazione'));
  }

  return {
    ok: true,
    versioneRegole: VERSIONE_REGOLE,
    ipotesi: ip,                       // lo snapshot: il report resta rileggibile
    azienda: { dipendenti: dipendenti, stipendioMensile: stipendioMensile,
               piccola: piccola, percentualeDeduzione: percDed, anni: anni, annoInizio: annoInizio },
    righe: righe,
    totali: {
      risparmio: rispTotale,
      tfrDestinato: tfrTotale,
      /* Le due percentuali servono a rispondere a due domande diverse: quanto
         pesa il risparmio sul TFR che ho spostato, e quanto sul costo del
         personale. Confonderle fa dire numeri sbagliati a voce. */
      risparmioSuTfr: tfrTotale > 0 ? (rispTotale / tfrTotale) * 100 : 0,
      risparmioSuMonte: (monteIniziale * anni) > 0 ? (rispTotale / (monteIniziale * anni)) * 100 : 0,
    },
    /* I motivi: un numero senza il perche' non e' consulenza. */
    motivi: [
      (piccola ? 'Sotto i ' + val(ip, 'sogliaPiccola') + ' dipendenti' : 'Da ' + val(ip, 'sogliaPiccola') + ' dipendenti in su') +
        ': la deduzione applicata è il ' + (percDed * 100).toFixed(0) + '%.',
      'Il monte retributivo cresce del ' + (val(ip, 'inflazione') * 100).toFixed(1).replace('.', ',') +
        '% l\'anno per l\'inflazione ipotizzata.',
      'L\'esonero dall\'imposta sulla rivalutazione parte dal secondo anno: nel primo non c\'è ancora TFR accantonato da rivalutare.',
    ],
  };
}

/* ── I coefficienti di trasformazione ──────────────────────────────────────
   Convertono il montante contributivo in rendita annua: e' il numero che
   trasforma «quanto ho accumulato» in «quanto prendo all'anno». Li pubblica
   l'INPS e cambiano ogni due anni.

   NEL LAB NON C'ERANO: la rendita era `capitale / 20 / 12`, cioe' spalmata su
   vent'anni. E' una divisione, non un calcolo previdenziale, e sottostima o
   sovrastima a seconda dell'eta'.

   ── I VALORI SBAGLIATI CHE C'ERANO QUI (corretti il 03/09/2026) ──────────
   Fino a oggi questa tabella conteneva i coefficienti del biennio PRECEDENTE,
   piu' alti dell'1,8% su tutte le eta', con la bandiera `daVerificare` accesa e
   mai tolta. Chiunque avesse stampato un report avrebbe consegnato una pensione
   gonfiata di quasi due punti: su un montante di 300.000 euro a 67 anni fanno
   306 euro all'anno che non esistono. Ora ci sono quelli del decreto.

   ── DOVE STA LA COPIA BUONA ──────────────────────────────────────────────
   Nella tabella «Parametri previdenziali» del pannello, con la fonte accanto e
   la data in cui va ricontrollata. Quella che sta qui e' la copia di riserva,
   letta dal decreto il 03/09/2026: serve al motore quando gira nelle prove, o
   quando la schermata non riesce a leggere i parametri. La schermata inietta
   sempre quella vera (`d.coefficienti`), cosi' a novembre, quando esce il
   decreto nuovo, si aggiorna la tabella e nessuno tocca il codice. */
var COEFFICIENTI = {
  biennio: '2025-2026',
  daVerificare: false,
  fonte: 'Decreto Ministero del Lavoro 20/11/2024, coefficienti di trasformazione 2025-2026',
  nota: 'Copia di riserva letta dal decreto il 03/09/2026. La copia buona sta nella ' +
        'schermata Parametri previdenziali del pannello.',
  perEta: {
    57: 0.04204, 58: 0.04308, 59: 0.04419, 60: 0.04536, 61: 0.04661,
    62: 0.04795, 63: 0.04936, 64: 0.05088, 65: 0.05250, 66: 0.05423,
    67: 0.05608, 68: 0.05808, 69: 0.06024, 70: 0.06258, 71: 0.06510,
  },
};

/* ── LA PORTA DEI NUMERI DI LEGGE ──────────────────────────────────────────
   `ipotesiAttive` rifiuta apposta le correzioni ai valori `modificabile:false`:
   quella porta serve a impedire che un consulente cambi a mano un numero di
   legge dentro un preventivo, e deve restare chiusa.

   Questa e' un'altra porta, per un altro mestiere: la tabella dei Parametri
   previdenziali, dove i numeri di legge stanno con la loro fonte e la loro
   data. Non e' qualcuno che ritocca un numero, e' l'archivio ufficiale che
   dice qual e'. Per questo e' una funzione separata e non un caso particolare
   dell'altra: due intenzioni diverse, due porte diverse.

   Torna l'elenco di cosa ha applicato: chi la chiama lo puo' mostrare, e chi
   legge il report puo' sapere che quel 15% arriva dall'archivio e non dal file. */
function numeriDiLegge(par) {
  var applicati = [], ignorati = [];
  if (!par || typeof par !== 'object') return { applicati: applicati, ignorati: ['nessun parametro ricevuto'] };

  var metti = function (chiave, valore, fonte) {
    if (valore === null || valore === undefined || !isFinite(Number(valore))) { ignorati.push(chiave); return; }
    if (!IPOTESI[chiave]) { ignorati.push(chiave); return; }
    IPOTESI[chiave].v = Number(valore);
    if (fonte) IPOTESI[chiave].fonte = fonte;
    /* Un numero che arriva dall'archivio con la sua fonte non e' piu' «da
       confermare»: la bandiera esisteva proprio in attesa di questo. */
    IPOTESI[chiave].daConfermare = false;
    applicati.push(chiave);
  };

  var f = function (k) { var s = par.__fonti && par.__fonti[k]; return s ? ('Parametri previdenziali · ' + s) : 'Parametri previdenziali'; };

  if (par.tetto_deducibilita != null) metti('dedMax', par.tetto_deducibilita, f('tetto_deducibilita'));
  if (par.imposta_sostitutiva_tfr != null) metti('aliqImpostaRival', par.imposta_sostitutiva_tfr, f('imposta_sostitutiva_tfr'));
  /* L'inflazione e le componenti reali: sono ipotesi, non numeri di legge, ma
     stanno nella stessa tabella perche' e' li' che si tiene la fonte e la data
     in cui vanno ricontrollate. Passano da questa porta e non dalle correzioni
     del consulente, che restano una cosa sua. */
  if (par.inflazione_attesa != null) metti('inflazione', par.inflazione_attesa, f('inflazione_attesa'));
  if (par.crescita_reale_reddito != null) metti('crescitaRealeReddito', par.crescita_reale_reddito, f('crescita_reale_reddito'));
  if (par.crescita_reale_pil != null) metti('crescitaRealePIL', par.crescita_reale_pil, f('crescita_reale_pil'));
  var tp = par.tassazione_prestazione;
  if (tp && typeof tp === 'object') {
    metti('tassFinaleFondoBase', tp.aliquotaBase, f('tassazione_prestazione'));
    metti('tassFinaleFondoSconto', tp.riduzionePerAnno, f('tassazione_prestazione'));
    metti('tassFinaleFondoMinima', tp.aliquotaMinima, f('tassazione_prestazione'));
  }
  var tr = par.tassazione_rendimenti;
  if (tr && typeof tr === 'object') metti('tassaRendimentiFondo', tr.generale, f('tassazione_rendimenti'));
  var ac = par.aliquote_computo;
  if (ac && typeof ac === 'object') {
    metti('aliqContributivaDipendente', ac.dipendenti_privati, f('aliquote_computo'));
    /* Per l'autonomo si usa quella degli artigiani: e' la piu' bassa fra quelle
       degli autonomi, e questo motore ne ha una sola casella. Chi vuole il
       conto esatto di un professionista in gestione separata la corregge a
       mano nel passo delle ipotesi: quella casella e' modificabile. */
    metti('aliqContributivaAutonomo', ac.artigiani, f('aliquote_computo'));
  }
  /* Le derivate vanno rifatte: se l'archivio ha spostato l'inflazione, la
     crescita del reddito e la rivalutazione del TFR devono seguirla subito,
     non al prossimo calcolo. */
  derivaTassi(IPOTESI);
  return { applicati: applicati, ignorati: ignorati };
}
/* Fuori dalla tabella non si inventa: si dice che non si sa. Un coefficiente
   estrapolato a occhio darebbe una pensione plausibile e sbagliata. */
function coefficientePerEta(eta, tabella) {
  var t = (tabella && tabella.perEta) || COEFFICIENTI.perEta;
  var e = Math.round(Number(eta));
  return Object.prototype.hasOwnProperty.call(t, e) ? t[e] : null;
}

/* ── A · PROSPETTIVA PENSIONISTICA (persona fisica) ────────────────────────
   Quanto prendera' di pensione pubblica, che percentuale del suo stipendio
   e' (il tasso di sostituzione), e quanto manca per arrivare al tenore di
   vita che vuole.

   Il modello e' quello contributivo, in forma esplicita:
     montante = somma dei contributi annui, rivalutati fino alla pensione
     pensione = montante x coefficiente di trasformazione dell'eta' d'uscita

   Non e' il calcolo dell'INPS: e' una STIMA ORIENTATIVA su ipotesi dichiarate,
   ed e' per questo che ogni ipotesi esce insieme al risultato. */
function prospettivaPensionistica(dati, correzioni) {
  var ip = ipotesiAttive(correzioni);
  var d = dati || {};
  var annoRiferimento = Number(d.annoRiferimento);
  var eta = Number(d.eta);
  var etaPensione = Number(d.etaPensionamento) || 67;
  var reddito = Number(d.redditoAnnuo) || 0;
  var anniGia = Number(d.anniContributiGia);
  var montanteGia = Number(d.montanteGia) || 0;
  var autonomo = !!d.autonomo;

  var problemi = [];
  if (!annoRiferimento) problemi.push('Serve l\'anno di riferimento (va passato, non dedotto dall\'orologio).');
  if (!eta || eta <= 0) problemi.push('Serve l\'età della persona.');
  if (reddito <= 0) problemi.push('Serve il reddito annuo lordo.');
  if (isNaN(anniGia)) problemi.push('Servono gli anni di contributi già versati.');
  if (eta && etaPensione && eta >= etaPensione) problemi.push('L\'età di pensionamento deve essere successiva a quella attuale.');
  if (problemi.length) {
    return { ok: false, motivo: 'dati_insufficienti', problemi: problemi,
             versioneRegole: VERSIONE_REGOLE, ipotesi: ip, coefficienti: COEFFICIENTI };
  }

  /* La tabella si puo' sostituire dall'esterno: quando l'INPS pubblica il
     biennio nuovo, si aggiorna da li' senza toccare il codice. Chi la
     sostituisce si porta dietro anche il suo `daVerificare`: una tabella
     nuova non e' verificata solo perche' e' nuova. */
  var tabella = (d.coefficienti && d.coefficienti.perEta) ? d.coefficienti : COEFFICIENTI;
  var coeffOggi = coefficientePerEta(etaPensione, tabella);
  if (coeffOggi == null) {
    /* Diverso da «dati insufficienti»: i dati ci sono, e' la tabella che non
       copre quell'eta'. Dirlo con precisione evita che qualcuno cerchi
       l'errore nei dati del cliente. */
    return { ok: false, motivo: 'eta_fuori_tabella',
             problemi: ['Non ho il coefficiente di trasformazione per l\'età ' + etaPensione +
                        '. La tabella copre da 57 a 71 anni.'],
             versioneRegole: VERSIONE_REGOLE, ipotesi: ip, coefficienti: COEFFICIENTI };
  }

  var anniMancanti = Math.round(etaPensione - eta);
  var annoUscita = annoRiferimento + anniMancanti;
  /* IL DECADIMENTO. Il coefficiente di oggi vale per chi esce oggi: per chi
     esce fra trent'anni sara' piu' basso, e usare quello di adesso sovrastima
     la pensione. La curva arriva da fuori (tabella dei Parametri) e, se non
     c'e', non si inventa niente: si tiene quello di oggi e si dice. */
  var decad = coefficienteProiettato(coeffOggi, annoUscita, annoRiferimento,
    d.decadimentoCoefficiente, tabella.perEta);
  var coeff = decad.usato;
  var gest = gestioneDi(d.gestione !== undefined && d.gestione !== '' ? d.gestione : autonomo);
  var chiaveAliq = (gest.aCarico > 0.15) ? 'aliqContributivaAutonomo' : 'aliqContributivaDipendente';
  var aliquota = ip[chiaveAliq].corretta ? ip[chiaveAliq].v : gest.computo;
  var capitalizzazione = val(ip, 'capitalizzazioneMontante');
  var crescita = val(ip, 'crescitaReddito');

  /* Il montante gia' maturato: se non lo si conosce si stima dagli anni di
     contributi al reddito di oggi. E' un'approssimazione, e viene detta. */
  var montanteStimatoDaAnni = false;
  var montante = montanteGia;
  if (!montante && anniGia > 0) {
    montante = reddito * aliquota * anniGia;
    montanteStimatoDaAnni = true;
  }
  /* Quello gia' accumulato continua a rivalutarsi fino alla pensione. */
  montante *= Math.pow(1 + capitalizzazione, anniMancanti);

  var redditoAnno = reddito, redditoFinale = reddito;
  for (var i = 0; i < anniMancanti; i++) {
    var contributo = redditoAnno * aliquota;
    /* Ogni versamento si rivaluta per gli anni che gli restano. */
    montante += contributo * Math.pow(1 + capitalizzazione, anniMancanti - i - 1);
    redditoFinale = redditoAnno;
    redditoAnno *= (1 + crescita);
  }

  var pensioneAnnua = montante * coeff;
  /* Il tasso di sostituzione si misura sull'ULTIMO reddito, non su quello di
     oggi: e' la domanda vera («di quanto cala il mio tenore di vita?»). */
  var tasso = redditoFinale > 0 ? (pensioneAnnua / redditoFinale) * 100 : 0;
  var gapAnnuo = Math.max(0, redditoFinale - pensioneAnnua);

  return {
    ok: true,
    versioneRegole: VERSIONE_REGOLE,
    ipotesi: ip,
    /* La FONTE viaggia con lo snapshot: il report deve poter dire da quale
       decreto esce il coefficiente, non solo che periodo copre. Un documento
       riaperto fra due anni senza la fonte non e' ricostruibile. */
    coefficienti: { biennio: tabella.biennio, daVerificare: tabella.daVerificare,
                    fonte: tabella.fonte || null, nota: tabella.nota, usato: coeff, eta: etaPensione,
                    oggi: coeffOggi, decadimento: decad },
    annoUscita: annoUscita,
    /* GLI STESSI NUMERI IN EURO DI OGGI. Non sostituiscono i nominali: li
       accompagnano, e sono quelli che si mostrano. «2.836 al mese» nel 2060
       su uno stipendio di 1.846 fa concludere al cliente che la pensione gli
       basta e avanza, e la conversazione muore lì.

       LA CONVENZIONE, e vale per tutte le voci: si riporta indietro di
       `anniMancanti`, cioe' fino alla DATA DI PENSIONAMENTO. L'ultimo
       stipendio cade in realta' un anno prima, e a rigore andrebbe riportato
       indietro di un anno in meno — ma allora sul foglio il divario non
       sarebbe piu' la differenza fra lo stipendio e la pensione, e un foglio
       in cui i conti non tornano fra loro e' indifendibile davanti a un
       cliente. Si sceglie la coerenza interna, e lo scarto e' un anno di
       inflazione sulla sola riga dello stipendio. */
    reale: {
      inflazione: val(ip, 'inflazione'),
      anni: anniMancanti,
      pensioneAnnua: deflaziona(pensioneAnnua, anniMancanti, val(ip, 'inflazione')),
      pensioneMensile: deflaziona(pensioneAnnua / 13, anniMancanti, val(ip, 'inflazione')),
      redditoAllaPensione: deflaziona(redditoFinale, anniMancanti, val(ip, 'inflazione')),
      montante: deflaziona(montante, anniMancanti, val(ip, 'inflazione')),
      gapAnnuo: deflaziona(gapAnnuo, anniMancanti, val(ip, 'inflazione')),
      gapMensile: deflaziona(gapAnnuo / 13, anniMancanti, val(ip, 'inflazione')),
    },
    persona: { eta: eta, etaPensionamento: etaPensione, anniMancanti: anniMancanti,
               redditoOggi: reddito, redditoAllaPensione: redditoFinale, autonomo: autonomo,
               gestione: d.gestione !== undefined && d.gestione !== '' ? d.gestione : (autonomo ? 'artigiani' : 'dipendenti_privati'),
               /* La forbice fra lordo e imponibile: per un professionista e'
                  larghissima, e spiega da sola perche' due persone con lo
                  stesso lordo pagano imposte molto diverse. */
               contributi: forbiceContributiva(reddito, d.gestione !== undefined && d.gestione !== '' ? d.gestione : autonomo),
               canale: d.canale },
    montante: montante,
    pensioneAnnua: pensioneAnnua,
    pensioneMensile: pensioneAnnua / 13,      // tredici mensilita'
    tassoSostituzione: tasso,
    gapAnnuo: gapAnnuo,
    gapMensile: gapAnnuo / 13,
    /* Gli avvisi della tabella viaggiano col risultato e finiscono sul report:
       «scaduto», «da ricontrollare», «valore derivato» sono cose che chi firma
       il foglio deve leggere, non cose da scoprire dopo. */
    /* IL REQUISITO DI ETA' non e' quello di oggi: e' indicizzato alla speranza
       di vita e nel 2060 non sara' 67. Non si cambia l'eta' che ha scritto
       l'operatore — quella e' una scelta — ma se e' sotto il requisito
       proiettato lo si dice. Se il requisito per quell'anno non lo si conosce,
       si tace: inventarlo e avvisare su un numero inventato sarebbe peggio. */
    requisito: (function () {
      var r = requisitoProiettato(annoUscita, d.requisitiProiettati);
      if (r == null) return { noto: false, anno: annoUscita };
      var anni = anniEMesi(r);
      if (anni == null) return { noto: false, anno: annoUscita, illeggibile: r };
      return { noto: true, anno: annoUscita, richiesto: r, anni: anni, sotto: etaPensione < anni };
    })(),
    avvisi: (tabella.daVerificare
      ? ['I coefficienti di trasformazione in uso (' + tabella.biennio + ')' +
         ' non sono ancora stati verificati contro la fonte ufficiale: non consegnare questo calcolo a un cliente prima di averlo fatto.']
      : []).concat(tabella.avvisi || []).concat((function () {
        var r = requisitoProiettato(annoUscita, d.requisitiProiettati);
        var anni = anniEMesi(r);
        if (anni == null || etaPensione >= anni) return [];
        return ['Nel ' + annoUscita + ' il requisito di vecchiaia proiettato è di ' + etaScritta(anni) +
                ': l\'uscita a ' + etaPensione + ' anni potrebbe non essere possibile, e con essa il coefficiente usato per questo calcolo.'];
      })()).concat((function () {
        var c = forbiceContributiva(reddito, d.gestione !== undefined && d.gestione !== '' ? d.gestione : autonomo);
        if (c.certezza !== 'secondaria') return [];
        return ['Le aliquote del regime «' + c.gestione + '» non sono state riscontrate su un documento ufficiale INPS: ' +
                'vanno confermate prima di consegnare questo foglio.'];
      })()),
    motivi: [
      'Pensione stimata col metodo contributivo: montante accumulato per il coefficiente di trasformazione a ' +
        etaPensione + ' anni (' + (coeff * 100).toFixed(3).replace('.', ',') + '%).',
      'Aliquota contributiva applicata: ' + (aliquota * 100).toFixed(0) + '% (' + (autonomo ? 'lavoratore autonomo' : 'lavoratore dipendente') + ').',
      montanteStimatoDaAnni
        ? 'Il montante già maturato è STIMATO dagli anni di contributi al reddito attuale: se hai l\'estratto conto INPS, inseriscilo per un conto più vicino al vero.'
        : 'Montante già maturato preso dal dato inserito.',
      'Il reddito cresce del ' + (crescita * 100).toFixed(1).replace('.', ',') + '% l\'anno e il montante si rivaluta del ' +
        (capitalizzazione * 100).toFixed(1).replace('.', ',') + '%: sono ipotesi, si cambiano.',
      'Il tasso di sostituzione è calcolato sull\'ultimo reddito prima della pensione, non su quello di oggi.',
    ],
  };
}

/* ── B · TFR IN AZIENDA CONTRO TFR NEL FONDO ───────────────────────────────
   La domanda del lavoratore: «il mio TFR conviene lasciarlo in azienda o
   portarlo nel fondo?». Tre cose lo decidono, e vanno mostrate separate
   perche' tirano in direzioni diverse:

     1. COME CRESCE   in azienda: 1,5% fisso + 75% dell'inflazione, e su quella
                      rivalutazione si paga l'imposta sostitutiva ogni anno
                      nel fondo: il rendimento della gestione, tassato al 20%
     2. QUANTO SI PAGA ALLA FINE
                      in azienda: tassazione separata, aliquota media IRPEF
                      nel fondo: 15%, che scende di 0,30% per ogni anno oltre
                      il quindicesimo, fino a un minimo del 9%
     3. COSA TRATTENGONO
                      in azienda: 0,50% della quota va al Fondo di Garanzia

   SUI DUE SCENARI (dimissioni volontarie / licenziamento). Sul piano FISCALE
   non cambia niente: la prestazione si tassa allo stesso modo in entrambi i
   casi. La differenza vera e' un'altra — cosa puoi riprenderti e quando — e
   quella dipende dal regolamento del fondo, non da una formula. Questo modulo
   NON la calcola e lo dice: inventarla sarebbe la cosa peggiore che possa fare
   un modulo di consulenza. Il confronto esce con l'avvertenza da mostrare. */
function confrontoTfr(dati, correzioni) {
  var ip = ipotesiAttive(correzioni);
  var d = dati || {};
  var reddito = Number(d.redditoAnnuo) || 0;
  var anni = Number(d.anni) || 0;
  var annoInizio = Number(d.annoInizio);
  var anniAdesione = Number(d.anniAdesione);
  if (isNaN(anniAdesione)) anniAdesione = anni;   // di norma si aderisce ora

  var problemi = [];
  if (reddito <= 0) problemi.push('Serve il reddito annuo lordo.');
  if (anni <= 0) problemi.push('Serve per quanti anni si accantona.');
  if (!annoInizio) problemi.push('Serve l\'anno di partenza (va passato, non dedotto dall\'orologio).');
  if (problemi.length) {
    return { ok: false, motivo: 'dati_insufficienti', problemi: problemi,
             versioneRegole: VERSIONE_REGOLE, ipotesi: ip, daConfermare: numeriDaConfermare(ip) };
  }

  var quota = reddito / val(ip, 'coeffTfr');
  var rivalAzienda = val(ip, 'rivalTfr');
  var impostaRival = val(ip, 'aliqImpostaRival');
  var rendFondo = val(ip, 'rendFondo');
  var tassaRend = val(ip, 'tassaRendimentiFondo');
  var trattenuta = val(ip, 'contributoFondoGaranziaTfr');

  var montanteAzienda = 0, montanteFondo = 0;
  var impostePagateAzienda = 0, impostePagateFondo = 0;
  var versato = 0;
  var righe = [];
  for (var i = 0; i < anni; i++) {
    /* In azienda la rivalutazione matura sul GIA' accantonato, e l'imposta si
       paga ogni anno: non e' rinviata alla fine. */
    var rivalLorda = montanteAzienda * rivalAzienda;
    var impostaAnno = rivalLorda * impostaRival;
    impostePagateAzienda += impostaAnno;
    montanteAzienda += rivalLorda - impostaAnno + quota * (1 - trattenuta);

    var rendLordo = montanteFondo * rendFondo;
    var tassaAnno = rendLordo * tassaRend;
    impostePagateFondo += tassaAnno;
    montanteFondo += rendLordo - tassaAnno + quota;

    versato += quota;
    righe.push({ anno: annoInizio + i, quotaVersata: quota,
                 azienda: montanteAzienda, fondo: montanteFondo });
  }

  /* Alla fine: in azienda tassazione separata sul versato (la rivalutazione e'
     gia' stata tassata anno per anno); nel fondo l'aliquota agevolata sul
     montante al netto di quanto gia' tassato sui rendimenti. */
  var aliqAzienda = val(ip, 'aliqTfrInAzienda');
  var impostaFinaleAzienda = versato * (1 - trattenuta) * aliqAzienda;
  var nettoAzienda = montanteAzienda - impostaFinaleAzienda;

  var sconto = Math.max(0, anniAdesione - 15) * val(ip, 'tassFinaleFondoSconto');
  var aliqFondo = Math.max(val(ip, 'tassFinaleFondoMinima'), val(ip, 'tassFinaleFondoBase') - sconto);
  var impostaFinaleFondo = versato * aliqFondo;
  var nettoFondo = montanteFondo - impostaFinaleFondo;

  return {
    ok: true,
    versioneRegole: VERSIONE_REGOLE,
    ipotesi: ip,
    daConfermare: numeriDaConfermare(ip),
    righe: righe,
    versato: versato,
    azienda: { montanteLordo: montanteAzienda, impostaAnnuale: impostePagateAzienda,
               aliquotaFinale: aliqAzienda, impostaFinale: impostaFinaleAzienda, netto: nettoAzienda },
    fondo: { montanteLordo: montanteFondo, impostaAnnuale: impostePagateFondo,
             anniAdesione: anniAdesione, aliquotaFinale: aliqFondo,
             impostaFinale: impostaFinaleFondo, netto: nettoFondo },
    differenza: nettoFondo - nettoAzienda,
    conviene: nettoFondo > nettoAzienda ? 'fondo' : (nettoFondo < nettoAzienda ? 'azienda' : 'pari'),
    /* La parte che questo modulo NON sa, detta a voce alta invece che taciuta. */
    scenari: {
      calcolato: false,
      nota: 'Sul piano FISCALE dimissioni volontarie e licenziamento sono uguali: la prestazione ' +
            'si tassa allo stesso modo. La differenza sta in cosa si può riscattare e quando, e ' +
            'dipende dal regolamento del fondo: va chiesta al fondo, non calcolata qui.',
    },
    motivi: [
      'Aliquota finale nel fondo: ' + (aliqFondo * 100).toFixed(2).replace('.', ',') + '% dopo ' + anniAdesione +
        ' anni di adesione' + (sconto > 0 ? ' (15% meno lo sconto per gli anni oltre il quindicesimo)' : ' (nessuno sconto: servono più di 15 anni)') + '.',
      'Aliquota sul TFR in azienda: ' + (aliqAzienda * 100).toFixed(0) + '%, tassazione separata. È un\'ipotesi sulla media IRPEF: si corregge.',
      'Sul TFR lasciato in azienda si trattiene lo 0,50% per il Fondo di Garanzia; sulla quota versata al fondo no.',
      'In azienda l\'imposta sulla rivalutazione si paga OGNI ANNO (' + (impostaRival * 100).toFixed(0) +
        '%), nel fondo si paga sui rendimenti (' + (tassaRend * 100).toFixed(0) + '%): sono due prelievi diversi, non lo stesso.',
    ],
  };
}

/* ── LA SOLUZIONE INTEGRATIVA E IL SUO VOTO ────────────────────────────────
   Il rating misura una cosa sola: QUANTO DEL DIVARIO viene coperto dalla
   soluzione scelta. Non e' un giudizio sul prodotto, e' una misura sul
   bisogno — e per questo ogni voto esce con i suoi motivi. Un numero senza il
   perche' non e' consulenza, e' un'etichetta.

   La regola che conta, e che va rispettata anche quando fa comodo il
   contrario: SE LA POSIZIONE E' GIA' ADEGUATA NON SI PROPONE NIENTE. Nessuna
   alternativa, nessun rilancio. Fare upselling su chi sta gia' bene e' il modo
   piu' rapido di trasformare una consulenza in una vendita. */
function simulaIntegrativa(prospettiva, versamentoMensile, correzioni) {
  var ip = ipotesiAttive(correzioni);
  if (!prospettiva || !prospettiva.ok) return null;
  var mensile = Number(versamentoMensile) || 0;
  var annuo = mensile * 12;
  var anni = prospettiva.persona.anniMancanti;
  var rend = val(ip, 'rendFondo');

  var capitale = 0;
  for (var i = 0; i < anni; i++) capitale = (capitale + annuo) * (1 + rend);

  /* La rendita si ricava con un coefficiente, non con una divisione: e'
     l'errore che c'era nel Lab.
     MA NON QUELLO DECADUTO. Il decadimento riguarda i coefficienti di legge
     della pensione pubblica, che scendono con la speranza di vita per decreto;
     la rendita del fondo si converte con un coefficiente CONTRATTUALE, che
     dipende dal fondo e dalla base demografica scelta e non ha niente a che
     vedere con quello. Applicargli la curva pubblica sarebbe far discendere un
     numero di un contratto privato da un decreto che non lo riguarda.
     Provvisorio: qui si usa il coefficiente di oggi. Il coefficiente proprio
     del fondo e' F-11. (04/09/2026) */
  var coeff = prospettiva.coefficienti.oggi != null
    ? prospettiva.coefficienti.oggi : prospettiva.coefficienti.usato;
  var renditaAnnua = capitale * coeff;

  var tetto = val(ip, 'dedMax');
  var dedotto = Math.min(annuo, tetto);
  var quale = prospettiva.persona.gestione || !!prospettiva.persona.autonomo;
  var reddito = prospettiva.persona.redditoOggi;

  /* IL RISPARMIO FISCALE, PER DIFFERENZA. Prima era «dedotto × aliquota
     marginale», che sbaglia sui redditi bassi (dove le detrazioni azzerano
     l'imposta e la deduzione non vale niente), nella fascia in cui la
     detrazione decresce, e quando il versamento fa scendere il reddito sotto
     una soglia di scaglione. Vedi il blocco «LE REGOLE FISCALI». */
  /* `tramiteDatore` non e' ancora una domanda dello step 2: finche' non c'e',
     vale il caso prudente (versamento diretto), quello che promette meno. */
  var fisco = risparmioDaDeduzione(reddito, dedotto, quale, FISCO);
  var canale = differenzeCanale(prospettiva.persona.canale);

  /* SUL REDDITO DI OGGI, e detto: il versamento si deduce per tutti gli anni
     che mancano, e in quegli anni il reddito cambia. Fare la media vorrebbe
     dire ipotizzare scaglioni e detrazioni del 2060, che nessuno puo'
     difendere. Il messaggio al cliente e' «oggi ti costa 38 invece di 50», ed
     e' vero oggi. (scelta di Francesco, 03/09/2026) */
  return {
    versamentoMensile: mensile, versamentoAnnuo: annuo, anni: anni,
    capitale: capitale, renditaAnnua: renditaAnnua, renditaMensile: renditaAnnua / 13,
    dedotto: dedotto, oltreIlTetto: Math.max(0, annuo - tetto),
    /* Versamento e risparmio fiscale sono GIA' euro di oggi: si versa adesso e
       si risparmia adesso. A dover tornare indietro sono capitale e rendita,
       che arrivano fra trent'anni — ed era proprio il confronto storto:
       «verso 50 e ottengo 170» metteva insieme due monete diverse. */
    reale: {
      inflazione: prospettiva.reale ? prospettiva.reale.inflazione : 0,
      capitale: prospettiva.reale ? deflaziona(capitale, anni, prospettiva.reale.inflazione) : capitale,
      renditaAnnua: prospettiva.reale ? deflaziona(renditaAnnua, anni, prospettiva.reale.inflazione) : renditaAnnua,
      renditaMensile: prospettiva.reale ? deflaziona(renditaAnnua / 13, anni, prospettiva.reale.inflazione) : renditaAnnua / 13,
    },
    // Resta, ma come informazione: dice in che scaglione sta, non quanto vale.
    aliquotaMarginale: aliquotaMarginale(fisco.senza.imponibile, FISCO),
    risparmioFiscaleAnnuo: fisco.risparmio,
    // Quanto rende OGNI EURO dedotto: e' questa che si mostra al cliente.
    aliquotaEffettivaBeneficio: fisco.aliquotaEffettiva,
    impostaAzzerata: fisco.impostaAzzerata,
    perdeIlTrattamentoIntegrativo: fisco.perdeIlTrattamentoIntegrativo,
    canale: canale,
    fisco: fisco,
    costoEffettivoAnnuo: annuo - fisco.risparmio,
    costoEffettivoMensile: (annuo - fisco.risparmio) / 12,
  };
}

function valutaSoluzione(prospettiva, versamentoMensile, correzioni) {
  var ip = ipotesiAttive(correzioni);
  if (!prospettiva || !prospettiva.ok) {
    /* «Non so» non e' verde. Verde vuol dire «ho guardato e va bene». */
    return { ok: false, stato: 'dati_insufficienti',
             motivo: (prospettiva && prospettiva.motivo) || 'dati_insufficienti',
             problemi: (prospettiva && prospettiva.problemi) || ['Manca la prospettiva pensionistica.'],
             versioneRegole: VERSIONE_REGOLE, ipotesi: ip };
  }

  var gap = prospettiva.gapAnnuo;
  var sim = simulaIntegrativa(prospettiva, versamentoMensile, correzioni);
  var copertura = gap > 0 ? Math.min(1, sim.renditaAnnua / gap) : 1;
  var sogliaOk = val(ip, 'sogliaAdeguato'), sogliaMezza = val(ip, 'sogliaParziale');

  var stato = copertura >= sogliaOk ? 'adeguato' : (copertura >= sogliaMezza ? 'parziale' : 'insufficiente');
  var tassoNuovo = prospettiva.persona.redditoAllaPensione > 0
    ? ((prospettiva.pensioneAnnua + sim.renditaAnnua) / prospettiva.persona.redditoAllaPensione) * 100 : 0;

  var motivi = [
    gap > 0
      ? 'Il divario da coprire è di ' + Math.round(gap) + ' € l\'anno: è la differenza fra l\'ultimo reddito e la pensione stimata.'
      : 'Non c\'è divario da coprire: la pensione stimata copre già l\'ultimo reddito.',
    'Con ' + sim.versamentoMensile + ' € al mese per ' + sim.anni + ' anni la rendita aggiuntiva stimata è di ' +
      Math.round(sim.renditaMensile) + ' € al mese, cioè il ' + Math.round(copertura * 100) + '% del divario.',
    'Il tasso di sostituzione passa dal ' + prospettiva.tassoSostituzione.toFixed(1).replace('.', ',') +
      '% al ' + tassoNuovo.toFixed(1).replace('.', ',') + '%.',
    /* SE L'IMPOSTA E' GIA' ZERO LO SI DICE, invece di mostrare un risparmio
       che non esiste: su un reddito basso le detrazioni da lavoro azzerano
       l'IRPEF, e dedurre non fa risparmiare niente. E' una cosa che il cliente
       deve sapere PRIMA di firmare, non dopo. */
    sim.perdeIlTrattamentoIntegrativo
      ? 'Attenzione: con questo reddito dedurre il versamento fa perdere il trattamento integrativo, che vale più del risparmio d\'imposta. Fiscalmente il versamento non conviene: va valutato per altre ragioni, o con un importo diverso.'
      : sim.impostaAzzerata
      ? 'Nessun risparmio fiscale: con questo reddito le detrazioni da lavoro azzerano già l\'IRPEF, quindi la deduzione del versamento non produce alcun beneficio. Il fondo pensione conviene per altre ragioni, non per questa.'
      : 'Risparmio fiscale: ' + Math.round(sim.risparmioFiscaleAnnuo) + ' € l\'anno deducendo ' + Math.round(sim.dedotto) +
        ' €, cioè il ' + (sim.aliquotaEffettivaBeneficio * 100).toFixed(1).replace('.', ',') + '% di quanto versi' +
        ' (aliquota di scaglione: ' + Math.round(sim.aliquotaMarginale * 100) + '%). Il costo effettivo scende a ' +
        Math.round(sim.costoEffettivoMensile) + ' € al mese invece di ' + sim.versamentoMensile + ' €.' +
        (sim.oltreIlTetto > 0 ? ' Attenzione: ' + Math.round(sim.oltreIlTetto) + ' € l\'anno restano fuori dal tetto di deducibilità.' : ''),
    /* Il beneficio e' quello di OGGI: va scritto, non sottinteso. */
    'Il beneficio fiscale è calcolato sul reddito attuale e può variare negli anni, con il reddito e con le regole fiscali.',
    'Canale: ' + sim.canale.etichetta + '. ' + sim.canale.punti[0],
  ];

  /* Le alternative si propongono SOLO se la posizione non e' adeguata. */
  var alternative = [];
  var sovracopertura = null;
  if (stato !== 'adeguato' && gap > 0) {
    var perCoprire = function (quota) {
      /* Quanto serve al mese per coprire `quota` del divario. La rendita e'
         lineare nel versamento, quindi si scala quella gia' calcolata. */
      if (!sim.renditaAnnua) return null;
      var necessario = (gap * quota) / (sim.renditaAnnua / (sim.versamentoMensile || 1));
      return Math.ceil(necessario / 10) * 10;   // arrotondato a dieci euro
    };
    var proposte = [perCoprire(sogliaOk), perCoprire(1)];
    for (var j = 0; j < proposte.length; j++) {
      var m = proposte[j];
      if (!m || m <= sim.versamentoMensile) continue;
      var s2 = simulaIntegrativa(prospettiva, m, correzioni);
      var c2 = Math.min(1, s2.renditaAnnua / gap);
      alternative.push({ versamentoMensile: m, coperturaDivario: c2,
                         renditaMensile: s2.renditaMensile, risparmioFiscaleAnnuo: s2.risparmioFiscaleAnnuo,
                         perche: 'Copre il ' + Math.round(c2 * 100) + '% del divario.' });
    }
  } else if (stato === 'adeguato') {
    motivi.push('La posizione è adeguata: non vengono proposte alternative. Chi sta già bene non ha bisogno che gli si venda di più.');
    /* SOVRACOPERTURA. Il modulo diceva già che a chi sta bene non si vende di
       più, ma non applicava il principio: con un versamento che copre il 238%
       del divario scriveva «adeguata» e taceva. Sotto IDD la sovracopertura è
       esattamente ciò che una revisione di adeguatezza contesta — e prima
       ancora è denaro del cliente fermo in un prodotto che non gli serve.
       Il minimo si ricava dalla stessa proporzionalità delle alternative:
       la rendita è lineare nel versamento. (04/09/2026) */
    if (gap > 0 && sim.renditaAnnua > gap && sim.versamentoMensile > 0) {
      var minimo = Math.ceil((gap / (sim.renditaAnnua / sim.versamentoMensile)) / 10) * 10;
      if (minimo < sim.versamentoMensile) {
        var quota = sim.renditaAnnua / gap;
        motivi.push('Attenzione: con ' + sim.versamentoMensile + ' € al mese la rendita coprirebbe il ' +
          Math.round(quota * 100) + '% del divario, cioè più del necessario. Ne bastano ' + minimo +
          ' € al mese per coprirlo tutto: i ' + (sim.versamentoMensile - minimo) +
          ' € di differenza sono denaro che al cliente non serve mettere qui.');
        sovracopertura = { quota: quota, minimoMensile: minimo, eccedenzaMensile: sim.versamentoMensile - minimo };
      }
    }
  }

  return {
    ok: true, stato: stato,
    versioneRegole: VERSIONE_REGOLE,
    ipotesi: ip,
    daConfermare: numeriDaConfermare(ip),
    avvisi: prospettiva.avvisi || [],
    soluzione: sim,
    coperturaDivario: copertura,
    divarioAnnuo: gap,
    tassoPrima: prospettiva.tassoSostituzione,
    tassoDopo: tassoNuovo,
    alternative: alternative,
    sovracopertura: sovracopertura,
    motivi: motivi,
  };
}

/* ── IL REPORT ─────────────────────────────────────────────────────────────
   Restituisce HTML, non lo stampa: cosi' il documento si puo' costruire e
   controllare senza un browser, ed e' quello che fanno le prove. Chi lo apre
   ci pensa fuori (window.print, salvataggio, allegato a un'email).

   Due scelte che vengono dal documento di specifica, non dal gusto:

   · LE IPOTESI STANNO ACCANTO AI NUMERI, non in una riga in fondo. Un rendimento
     del 3,5% cambia il risultato piu' di qualunque altra cosa: chi legge deve
     vederlo mentre guarda la cifra, non dopo averla creduta.

   · LA DATA SI PASSA DA FUORI. Anche qui: un documento che si data da solo, se
     riaperto fra un anno, si presenta come nuovo. Questo va firmato.  */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
var euro = function (n) { return '€ ' + Math.round(Number(n) || 0).toLocaleString('it-IT'); };
var perc = function (n, d) { return (Number(n) || 0).toFixed(d == null ? 1 : d).replace('.', ',') + '%'; };

function reportPrevidenza(d) {
  /* GLI IMPORTI DEL FOGLIO SONO IN EURO DI OGGI. Il nominale non sparisce:
     sta nella riga tecnica in fondo, che serve a ricostruire il conto fra due
     anni. Ma quello che il cliente legge dev'essere confrontabile con lo
     stipendio che riceve adesso. */
  var RE = null;
  d = d || {};
  var pr = d.prospettiva, vl = d.valutazione;
  RE = (pr && pr.reale) || { pensioneMensile: pr && pr.pensioneMensile, gapMensile: pr && pr.gapMensile,
    gapAnnuo: pr && pr.gapAnnuo, redditoAllaPensione: pr && pr.persona && pr.persona.redditoAllaPensione };
  RE = (pr && pr.reale) || { pensioneMensile: pr && pr.pensioneMensile, gapMensile: pr && pr.gapMensile,
    gapAnnuo: pr && pr.gapAnnuo, redditoAllaPensione: pr && pr.persona && pr.persona.redditoAllaPensione };
  var cliente = d.cliente || {}, cons = d.consulente || {};
  var mancanti = [];
  if (!pr || !pr.ok) mancanti.push('la prospettiva pensionistica');
  if (!vl || !vl.ok) mancanti.push('la valutazione della soluzione');
  if (!d.dataRiferimento) mancanti.push('la data del documento (va passata, non presa dall\'orologio)');
  if (!cons.nome) mancanti.push('il consulente che segue la trattativa');
  if (mancanti.length) {
    /* Meglio nessun documento che un documento senza firma o senza data. */
    return { ok: false, motivo: 'dati_insufficienti', problemi: mancanti, html: null };
  }

  var ip = vl.ipotesi;
  var rigaIpotesi = function (k) {
    if (!ip[k]) return '';
    var v = ip[k].unita === '%' ? perc(ip[k].v * 100, 2) : (ip[k].unita === '€' ? euro(ip[k].v) : ip[k].v);
    return '<tr><td>' + esc(ip[k].etichetta) + '</td><td class="n">' + esc(v) + '</td>' +
           '<td class="f">' + esc(ip[k].fonte) + (ip[k].corretta ? ' <b>(corretta a mano)</b>' : '') + '</td></tr>';
  };
  var etichettaStato = { adeguato: 'Adeguata', parziale: 'Parziale', insufficiente: 'Insufficiente' }[vl.stato] || vl.stato;
  var coloreStato = { adeguato: '#02984e', parziale: '#c25a00', insufficiente: '#c0392b' }[vl.stato] || '#5b6478';

  var alternative = vl.alternative.length
    ? '<div class="sec">Se vuoi coprire di più</div><table class="t"><tr><th>Versamento</th><th class="n">Copre</th>' +
      '<th class="n">Rendita in più</th><th class="n">Risparmio fiscale</th></tr>' +
      vl.alternative.map(function (a) {
        return '<tr><td>' + euro(a.versamentoMensile) + ' al mese</td><td class="n">' + perc(a.coperturaDivario * 100, 0) +
               ' del divario</td><td class="n">' + euro(a.renditaMensile) + '/mese</td><td class="n">' +
               euro(a.risparmioFiscaleAnnuo) + '/anno</td></tr>';
      }).join('') + '</table>'
    : '<div class="ok">La posizione risulta <b>adeguata</b>: non vengono proposte alternative.</div>';

  var avvisi = (vl.avvisi || []).concat((vl.daConfermare || []).length
    ? ['Alcuni parametri di calcolo sono in attesa di conferma: ' +
       vl.daConfermare.map(function (x) { return x.etichetta; }).join(', ') + '.'] : []);

  var html =
'<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Analisi previdenziale — ' + esc(cliente.nome || '') + '</title>' +
'<style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1c2440;margin:0;padding:34px;font-size:13px;line-height:1.5}' +
'.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #02984e;padding-bottom:14px;margin-bottom:18px}' +
'.hd img{height:38px}.hd .t{font-size:11px;color:#5b6478;text-transform:uppercase;letter-spacing:1px}h1{font-size:21px;margin:2px 0 0}' +
'.meta{text-align:right;font-size:12px;color:#5b6478}' +
'.sec{font-size:11px;font-weight:700;color:#02984e;text-transform:uppercase;letter-spacing:.5px;margin:20px 0 6px}' +
'.row{display:flex;justify-content:space-between;border-bottom:1px dashed #e2e7f0;padding:5px 0}' +
'.big{font-size:26px;font-weight:700;color:#02984e}' +
'table.t{width:100%;border-collapse:collapse;margin:6px 0}table.t th{text-align:left;font-size:11px;color:#5b6478;' +
'text-transform:uppercase;border-bottom:1px solid #e2e7f0;padding:5px 6px}table.t td{padding:5px 6px;border-bottom:1px solid #f1f4f9}' +
'table.t .n{text-align:right;font-variant-numeric:tabular-nums}table.t .f{font-size:11px;color:#5b6478}' +
'.box{background:#eaf7f0;border:1px solid #b9e3cd;border-radius:10px;padding:11px 13px;margin:14px 0}' +
'.warn{background:#fff4e6;border:1px solid #ffd8a8;color:#8a4b00;border-radius:10px;padding:11px 13px;margin:14px 0;font-size:12px}' +
'.ok{background:#eaf7f0;border:1px solid #b9e3cd;border-radius:10px;padding:11px 13px;margin:14px 0}' +
'.stato{display:inline-block;border-radius:20px;padding:4px 14px;font-weight:700;color:#fff;font-size:12px}' +
'.firma{margin-top:30px;border-top:1px solid #1c2440;padding-top:8px;font-size:12px}' +
'.note{font-size:11px;color:#5b6478;border-top:1px solid #e2e7f0;margin-top:20px;padding-top:10px}</style></head><body>' +

'<div class="hd"><div>' + (d.logo ? '<img src="' + esc(d.logo) + '" alt="With Us">' : '') +
'<div class="t">Withus Assicurazioni</div><h1>Analisi previdenziale</h1></div>' +
'<div class="meta">' + esc(cliente.nome || '') + '<br>' + esc(d.dataRiferimento) + '</div></div>' +

'<div class="nota-euro">Tutti gli importi di questo documento sono in <b>EURO DI OGGI</b>, cioè a parità di potere d\'acquisto: sono confrontabili con lo stipendio che il cliente riceve adesso.</div>' +
'<div class="sec">La situazione oggi</div>' +
'<div class="row"><span>Età</span><b>' + esc(pr.persona.eta) + ' anni</b></div>' +
'<div class="row"><span>Pensione prevista a</span><b>' + esc(pr.persona.etaPensionamento) + ' anni</b></div>' +
'<div class="row"><span>Reddito annuo lordo</span><b>' + euro(pr.persona.redditoOggi) + '</b></div>' +
(pr.persona.contributi
  ? '<div class="row"><span>Regime contributivo</span><b>' + esc(pr.persona.contributi.gestione) + '</b></div>' +
    '<div class="row"><span>Imponibile IRPEF (lordo meno contributi a suo carico)</span><b>' +
    euro(pr.persona.contributi.imponibile) + '</b></div>' +
    '<div class="m">Si toglie il ' + perc(pr.persona.contributi.aCarico * 100, 2) + ' a carico del lavoratore' +
    (pr.persona.contributi.dovuta > pr.persona.contributi.aCarico
      ? ' (aliquota dovuta ' + perc(pr.persona.contributi.dovuta * 100, 2) + ': il resto lo versa il datore o il committente)' : '') +
    '. Il montante si costruisce con l\'aliquota di computo del ' + perc(pr.persona.contributi.computo * 100, 0) + '.' +
    (pr.persona.contributi.tfr && pr.persona.contributi.tfr !== 'si' && pr.persona.contributi.tfr !== 'no'
      ? ' TFR e contributo del datore: ' + esc(pr.persona.contributi.tfr) + '.' : '') +
    (pr.persona.contributi.alMinimale
      ? ' I contributi sono calcolati sul minimale di legge, più alto del reddito dichiarato.' : '') +
    (pr.persona.contributi.alMassimale
      ? ' Il reddito supera il massimale contributivo: oltre quella soglia non si versa e non si matura montante.' : '') + '</div>'
  : '') +
'<div class="row"><span>Reddito stimato all\'ultimo anno di lavoro</span><b>' + euro(RE.redditoAllaPensione) + '</b></div>' +

'<div class="sec">Cosa succede alla pensione</div>' +
'<div class="row"><span>Pensione pubblica stimata</span><b>' + euro(RE.pensioneMensile) + ' al mese</b></div>' +
'<div class="row"><span>Quanto copre dell\'ultimo stipendio (tasso di sostituzione)</span><b>' + perc(pr.tassoSostituzione) + '</b></div>' +
'<div class="row"><span>Quanto manca ogni mese</span><b style="color:#c0392b">' + euro(RE.gapMensile) + '</b></div>' +
'<div class="box">Il divario da colmare è di <b>' + euro(RE.gapAnnuo) + ' all\'anno</b>. ' +
'È la differenza fra l\'ultimo stipendio e la pensione stimata, ed è la cifra su cui si misura tutto il resto di questo documento.</div>' +

'<div class="sec">La soluzione proposta</div>' +
'<div class="row"><span>Versamento</span><b>' + euro(vl.soluzione.versamentoMensile) + ' al mese per ' + esc(vl.soluzione.anni) + ' anni</b></div>' +
'<div class="row"><span>Costo complessivo nel periodo</span><b>' + euro(vl.soluzione.versamentoAnnuo * vl.soluzione.anni) + '</b></div>' +
'<div class="row"><span>Capitale stimato alla pensione</span><b>' + euro((vl.soluzione.reale || vl.soluzione).capitale) + '</b></div>' +
'<div class="row"><span>Rendita aggiuntiva stimata</span><b>' + euro((vl.soluzione.reale || vl.soluzione).renditaMensile) + ' al mese</b></div>' +
(vl.soluzione.risparmioFiscaleAnnuo > 0
  ? '<div class="row"><span>Risparmio fiscale</span><b style="color:#02984e">' + euro(vl.soluzione.risparmioFiscaleAnnuo) + ' all\'anno</b></div>' +
    '<div class="row"><span>Costo effettivo del versamento</span><b>' + euro(vl.soluzione.costoEffettivoMensile) + ' al mese</b></div>' +
    (vl.soluzione.canale
      ? '<div class="row"><span>Canale di versamento</span><b>' + esc(vl.soluzione.canale.etichetta) + '</b></div>' +
        '<div class="m">' + esc(vl.soluzione.canale.beneficioFiscale) + ' ' +
        vl.soluzione.canale.punti.map(esc).join(' ') + '</div>'
      : '') +
    '<div class="m">Il risparmio è ' + perc((vl.soluzione.aliquotaEffettivaBeneficio || 0) * 100, 1) +
    ' di quanto versi. È calcolato sul reddito attuale, come differenza fra l\'IRPEF dovuta senza il versamento e quella dovuta con il versamento, e può variare negli anni con il reddito e con le regole fiscali. Non tiene conto delle addizionali regionale e comunale: il beneficio effettivo è leggermente superiore.</div>'
  : vl.soluzione.perdeIlTrattamentoIntegrativo
  ? '<div class="warn">Con questo reddito dedurre il versamento fa perdere il trattamento integrativo, che vale più del risparmio d\'imposta: <b>fiscalmente il versamento non conviene</b>. Va valutato per altre ragioni, o con un importo diverso.</div>'
  : '<div class="warn">Con questo reddito le detrazioni da lavoro azzerano già l\'IRPEF: la deduzione del versamento <b>non produce alcun risparmio fiscale</b>. Il fondo pensione può convenire per altre ragioni, non per questa.</div>') +
(vl.soluzione.oltreIlTetto > 0
  ? '<div class="warn">Di quanto versi, <b>' + euro(vl.soluzione.oltreIlTetto) + ' all\'anno</b> superano il tetto di deducibilità ' +
    'e non danno risparmio fiscale.</div>' : '') +

(vl.sovracopertura
  ? '<div class="warn">Con ' + euro(vl.soluzione.versamentoMensile) + ' al mese la rendita coprirebbe il <b>' +
    perc(vl.sovracopertura.quota * 100, 0) + '</b> del divario, cioè più del necessario. ' +
    'Ne bastano <b>' + euro(vl.sovracopertura.minimoMensile) + ' al mese</b> per coprirlo tutto: ' +
    euro(vl.sovracopertura.eccedenzaMensile) + ' al mese sono denaro che non serve mettere qui.</div>'
  : '') +
'<div class="sec">Il giudizio</div>' +
'<p><span class="stato" style="background:' + coloreStato + '">' + esc(etichettaStato) + '</span> ' +
'<span class="big" style="margin-left:10px">' + perc(vl.coperturaDivario * 100, 0) + '</span> del divario coperto</p>' +
'<div class="row"><span>Tasso di sostituzione senza la soluzione</span><b>' + perc(vl.tassoPrima) + '</b></div>' +
'<div class="row"><span>Tasso di sostituzione con la soluzione</span><b>' + perc(vl.tassoDopo) + '</b></div>' +
'<ul>' + vl.motivi.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' +

alternative +

'<div class="sec">Le garanzie della soluzione</div>' +
(d.garanzie && d.garanzie.length
  ? '<ul>' + d.garanzie.map(function (g) { return '<li><b>' + esc(g.nome) + '</b>' + (g.dettaglio ? ' — ' + esc(g.dettaglio) : '') + '</li>'; }).join('') + '</ul>'
  : '<p style="color:#5b6478">Le garanzie del prodotto scelto vanno allegate: questo documento non le riporta.</p>') +

'<div class="sec">Con quali ipotesi sono stati fatti questi conti</div>' +
'<p style="margin:0 0 6px;color:#5b6478">Non sono dettagli: cambiando questi numeri cambiano tutti i risultati qui sopra.</p>' +
'<table class="t"><tr><th>Ipotesi</th><th class="n">Valore</th><th>Da dove viene</th></tr>' +
['rendFondo', 'capitalizzazioneMontante', 'crescitaReddito', 'inflazione',
 'aliqContributivaDipendente', 'dedMax', 'sogliaAdeguato'].map(rigaIpotesi).join('') +
'<tr><td>Coefficiente di trasformazione a ' + esc(pr.persona.etaPensionamento) + ' anni</td>' +
'<td class="n">' + perc(pr.coefficienti.usato * 100, 3) + '</td>' +
'<td class="f">Coefficienti di trasformazione, ' + esc(pr.coefficienti.biennio) + (pr.coefficienti.fonte ? '. ' + esc(pr.coefficienti.fonte) : '') + '</td></tr></table>' +

(avvisi.length ? '<div class="warn"><b>Da verificare prima della consegna:</b><ul style="margin:6px 0 0">' +
  avvisi.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>' : '') +

'<div class="firma"><b>' + esc(cons.nome) + '</b>' + (cons.ruolo ? ' — ' + esc(cons.ruolo) : '') +
(cons.rui ? '<br>Iscrizione RUI ' + esc(cons.rui) : '') +
((cons.email || cons.telefono) ? '<br>' + esc([cons.email, cons.telefono].filter(Boolean).join(' · ')) : '') +
'</div>' +

'<div class="note">Documento a fini illustrativi. I valori sono <b>stime orientative</b> costruite sulle ipotesi ' +
'riportate qui sopra, non impegni contrattuali: rendimenti e coefficienti possono cambiare, e con loro i risultati. ' +
'Non sostituisce la consulenza di un CAF, di un patronato o di un commercialista, ne\' la documentazione ' +
'precontrattuale del prodotto.</div>' +

/* LA RIGA TECNICA. Serve a due cose: ricostruire il conto fra due anni, e
   distinguere i fogli. Un documento consegnato prima del 04/09/2026 porta una
   versione diversa e numeri molto diversi — stessi dati, altre regole — e senza
   il numero di versione non ci sarebbe modo di saperlo guardandolo. */
'<div class="note" style="font-size:10px;opacity:.75">Riferimenti tecnici · Importi in euro di oggi, deflazionati al ' +
perc((pr.reale ? pr.reale.inflazione : 0) * 100, 2) + ' annuo su ' + esc(pr.persona.anniMancanti) + ' anni. ' +
'In euro correnti all\'anno di uscita (' + esc(pr.annoUscita || '—') + '): pensione ' + euro(pr.pensioneMensile) +
' al mese, divario ' + euro(pr.gapMensile) + ' al mese' +
(vl.soluzione ? ', rendita ' + euro(vl.soluzione.renditaMensile) + ' al mese' : '') + '. ' +
'Coefficiente di trasformazione ' + perc(pr.coefficienti.usato * 100, 3) +
(function () {
  var dc = pr.coefficienti.decadimento;
  if (!dc || !dc.applicata) return '';
  if (dc.metodo === 'speranza_di_vita') {
    return ' (da ' + perc(pr.coefficienti.oggi * 100, 3) + ' del ' + esc(dc.annoBase) +
      ': coefficiente proiettato su speranza di vita ' + esc(dc.fonteSerie || 'Eurostat EUROPOP2025') +
      (dc.ponderata ? ', ponderata su popolazione Istat' : '') +
      '; ' + esc(dc.avvertenza || 'metodo proporzionale, approssimazione della tabella di legge') +
      '. Vita attesa a ' + esc(dc.etaSerie || 67) + ' anni: ' +
      Number(dc.speranzaBase).toFixed(2).replace('.', ',') + ' nel ' + esc(dc.annoBase) + ', ' +
      Number(dc.speranzaUscita).toFixed(2).replace('.', ',') + ' nel ' + esc(dc.anno) + ' — ' + esc(dc.come) + ')';
  }
  return ' (da ' + perc(pr.coefficienti.oggi * 100, 3) + ' di oggi, curva dichiarata fino al ' + esc(dc.annoObiettivo) + ')';
})() + '. ' +
(pr.requisito && pr.requisito.noto === false
  ? 'Verifica del requisito di età non attiva: tabella dei requisiti proiettati non ancora popolata. '
  : '') +
'Regole di calcolo versione ' + esc(vl.versioneRegole) + '.</div>' +

'</body></html>';

  return { ok: true, html: html, versioneRegole: vl.versioneRegole,
           /* Lo snapshot viaggia col documento: un report riaperto fra un anno
              deve poter dire con che numeri e' nato. */
           snapshot: { ipotesi: ip, coefficienti: pr.coefficienti, dataRiferimento: d.dataRiferimento } };
}

/* ── Esposizione ai due mondi ──────────────────────────────────────────── */
var API = {
  VERSIONE_REGOLE: VERSIONE_REGOLE,
  IPOTESI: IPOTESI,
  ipotesiAttive: ipotesiAttive,
  tfrQuotaAnnua: tfrQuotaAnnua,
  pianoAzienda: pianoAzienda,
  COEFFICIENTI: COEFFICIENTI,
  coefficientePerEta: coefficientePerEta,
  prospettivaPensionistica: prospettivaPensionistica,
  confrontoTfr: confrontoTfr,
  deflaziona: deflaziona,
  coefficienteProiettato: coefficienteProiettato,
  speranzaAllAnno: speranzaAllAnno,
  pesaPerSesso: pesaPerSesso,
  requisitoProiettato: requisitoProiettato,
  anniEMesi: anniEMesi,
  etaScritta: etaScritta,
  componiNominale: componiNominale,
  scorporaReale: scorporaReale,
  aliquotaMarginale: aliquotaMarginale,
  FISCO: FISCO,
  contributiObbligatori: contributiObbligatori,
  gestioneDi: gestioneDi,
  forbiceContributiva: forbiceContributiva,
  imponibileFiscale: imponibileFiscale,
  irpefLorda: irpefLorda,
  detrazioneLavoro: detrazioneLavoro,
  eDaLavoroAutonomo: eDaLavoroAutonomo,
  ulterioreDetrazione: ulterioreDetrazione,
  sommaNonImponibile: sommaNonImponibile,
  tronca4: tronca4,
  irpefNetta: irpefNetta,
  differenzeCanale: differenzeCanale,
  risparmioDaDeduzione: risparmioDaDeduzione,
  simulaIntegrativa: simulaIntegrativa,
  valutaSoluzione: valutaSoluzione,
  reportPrevidenza: reportPrevidenza,
  numeriDaConfermare: numeriDaConfermare,
  numeriDiLegge: numeriDiLegge,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Previdenza = API;
})();
