/* ═══════════════════════════════════════════════════════════════════════════
   PREVIDENZA FLASH — quattro campi, due minuti  (11/09/2026)

   Questo NON è un motore attuariale, ed è voluto. Il motore completo esiste
   (previdenza.js) e resta: simula il montante contributivo anno per anno,
   proietta i coefficienti di trasformazione, sconta l'inflazione. È giusto
   per un'analisi seduti a tavolino, ed è sbagliato per una conversazione in
   piedi davanti a un cliente — perché chiede quindici numeri che il cliente
   non ha in tasca, e produce un risultato che non si riesce a spiegare.

   Qui si parte da quattro cose che una persona sa dire a memoria, e si
   risponde a una domanda sola: QUANTO TI MANCA, E CON QUANTO AL MESE LO
   COPRI.

   ── COSA SI È TENUTO DEL MOTORE VECCHIO, E PERCHÉ ──────────────────────────
   Il risparmio fiscale NON si ricalcola qui. previdenza.js ha 46 prove sopra
   l'IRPEF, e sa una cosa che una formula semplificata non saprebbe: dedurre
   può far scendere l'imposta lorda sotto la soglia di capienza e far perdere
   l'intero trattamento integrativo — il «risparmio» diventa negativo, cioè
   versare costa più del versamento. Riscrivere quella parte per uniformità
   sarebbe il vero rischio di questo lavoro. Si chiama.

   ── LA COSA CHE DECIDE TUTTO ───────────────────────────────────────────────
   Il tasso di sostituzione è UN SOLO NUMERO da cui dipende l'intera vendita.
   Sta in una tabella qui sotto, per fascia, e si cambia lì. I valori di
   partenza sono ordini di grandezza del regime contributivo: VANNO CONFERMATI
   prima di mostrarli a un cliente, e finché non lo sono il risultato porta
   `daConfermare` e il report lo scrive.

   ── NETTO SU NETTO, NON LORDO SU LORDO ─────────────────────────────────────
   L'input è il reddito NETTO mensile, perché è quello che una persona sa.
   I tassi di sostituzione pubblicati (Ragioneria Generale dello Stato) sono
   invece LORDI. Applicare un coefficiente lordo a un reddito netto è l'errore
   silenzioso più facile da fare qui: il netto da pensione è più alto del
   lordo corrispondente — sulla pensione non si pagano contributi — quindi si
   sottostimerebbe l'assegno e si gonfierebbe il gap. Comodo per vendere,
   indifendibile. La tabella qui sotto è NETTO SU NETTO, e il nome lo dice.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── IL TETTO DI DEDUCIBILITÀ ─────────────────────────────────────────────
     Art. 8 D.Lgs. 252/2005. È un numero di legge, non un'ipotesi. */
  var TETTO_DEDUZIONE = 5164.57;

  /* ── L'ETÀ DELLA PENSIONE DI VECCHIAIA ────────────────────────────────────
     67 anni oggi. Si adegua alla speranza di vita, quindi chi ha trent'anni
     ci arriverà più tardi: qui NON si proietta, perché proiettare vorrebbe
     dire rimettere dentro la complicazione che questo modulo toglie. Si usa
     67 e lo si dichiara. */
  var ETA_PENSIONE = 67;

  /* ── SE NON SI SA QUANDO HA COMINCIATO A LAVORARE ─────────────────────────
     Si assume un inizio TARDIVO: meno anni di contributi, pensione più bassa,
     gap più largo. È lo scenario peggiore, e va marcato ovunque — schermata e
     PDF — perché un numero prudenziale spacciato per stima è un numero falso.
     30 anni: un percorso con studi lunghi e primi anni discontinui. */
  var ETA_INIZIO_PRUDENZIALE = 30;

  /* ── LA TABELLA CHE DECIDE TUTTO ──────────────────────────────────────────
     Tasso di sostituzione NETTO (pensione netta / ultimo reddito netto), per
     anni di contribuzione al pensionamento.

     Il salto fra dipendente e autonomo non è un'opinione: l'aliquota
     contributiva è 33% contro 24%, e a parità di carriera l'autonomo accumula
     circa tre quarti del montante. Il libero professionista con cassa privata
     è il caso più variabile di tutti — ogni cassa ha le sue regole — e qui si
     tiene volutamente basso, segnalando che è la stima meno affidabile.

     VALORI DA CONFERMARE. Sono ordini di grandezza, non numeri di legge. */
  var COEFFICIENTI = {
    dipendente:   [{ anni: 40, tasso: 0.82 }, { anni: 35, tasso: 0.72 }, { anni: 30, tasso: 0.62 }, { anni: 25, tasso: 0.52 }, { anni: 0, tasso: 0.42 }],
    autonomo:     [{ anni: 40, tasso: 0.60 }, { anni: 35, tasso: 0.53 }, { anni: 30, tasso: 0.45 }, { anni: 25, tasso: 0.38 }, { anni: 0, tasso: 0.30 }],
    professionista: [{ anni: 40, tasso: 0.58 }, { anni: 35, tasso: 0.50 }, { anni: 30, tasso: 0.42 }, { anni: 25, tasso: 0.35 }, { anni: 0, tasso: 0.28 }],
  };

  var LAVORI = {
    dipendente:     { etichetta: 'Lavoratore dipendente', tfr: true,  autonomo: false },
    autonomo:       { etichetta: 'Lavoratore autonomo',   tfr: false, autonomo: true  },
    professionista: { etichetta: 'Libero professionista', tfr: false, autonomo: true  },
  };

  /* ── LA TARIFFA DEL FONDO ─────────────────────────────────────────────────
     Riferimento: preventivatore online HDI.
       · Azione di Previdenza — fondo aperto
       · Previdenza HDI — PIP, albo COVIP n. 5007
     I numeri qui sotto NON vengono da HDI: sono segnaposto, e il risultato
     porta `daConfermare` finché restano. Si sostituiscono con quelli letti sul
     preventivatore e sulla Nota informativa, e da quel momento il report si
     può consegnare. */
  var FONDO = {
    rendimentoLordo: { v: 0.045, etichetta: 'Rendimento lordo della gestione', daConfermare: true },
    costi:           { v: 0.015, etichetta: 'Costi del fondo (ISC a 35 anni)', daConfermare: true },
    imposta:         { v: 0.20,  etichetta: 'Imposta sui rendimenti', daConfermare: false },
    coeffRendita:    { v: 0.044, etichetta: 'Coefficiente di conversione in rendita', daConfermare: true },
  };

  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
  var pos = function (v) { return Math.max(0, num(v)); };

  /* ── QUANTI ANNI DI CONTRIBUTI AVRÀ ──────────────────────────────────────
     Non «quanti ne ha», ma quanti ne avrà al pensionamento: è quello che
     determina l'assegno. */
  function anniContribuzione(dati) {
    var eta = pos(dati && dati.eta);
    var inizio = (dati && dati.etaInizioLavoro != null && dati.etaInizioLavoro !== '')
      ? pos(dati.etaInizioLavoro) : null;
    var prudenziale = inizio === null;
    if (prudenziale) inizio = ETA_INIZIO_PRUDENZIALE;
    /* Chi ha cominciato dopo l'età che dichiara oggi non è un caso da
       arrotondare: è un dato sbagliato, e si tratta come sconosciuto. */
    if (inizio > eta) { inizio = ETA_INIZIO_PRUDENZIALE; prudenziale = true; }
    var anni = Math.max(0, ETA_PENSIONE - inizio);
    return { anni: anni, prudenziale: prudenziale, etaInizioUsata: inizio, anniAllaPensione: Math.max(0, ETA_PENSIONE - eta) };
  }

  /* ── IL TASSO DI SOSTITUZIONE ────────────────────────────────────────────
     A scaglioni, non interpolato: la tabella deve restare leggibile da una
     persona che la vuole correggere, e mezzo punto di interpolazione non
     aggiunge precisione a una stima di questo tipo. */
  function tassoSostituzione(lavoro, anni) {
    var tab = COEFFICIENTI[lavoro] || COEFFICIENTI.dipendente;
    for (var i = 0; i < tab.length; i++) if (num(anni) >= tab[i].anni) return tab[i].tasso;
    return tab[tab.length - 1].tasso;
  }

  /* ── DAL NETTO AL LORDO ──────────────────────────────────────────────────
     Serve per il risparmio fiscale: l'IRPEF si calcola sul lordo, e il
     cliente sa il netto. Si inverte la funzione vera del motore completo per
     bisezione, invece di usare una percentuale a occhio: così il risparmio
     fiscale mostrato è quello che il cliente vedrà davvero in dichiarazione,
     scaglioni e detrazioni compresi.

     `motore` arriva da fuori (è window.Previdenza): senza, si dice che non si
     sa, invece di inventare un lordo. */
  function lordoDaNetto(nettoAnnuo, lavoro, motore) {
    var netto = pos(nettoAnnuo);
    if (!netto) return null;
    if (!motore || typeof motore.irpefNetta !== 'function') return null;
    var autonomo = !!(LAVORI[lavoro] && LAVORI[lavoro].autonomo);
    var nettoDi = function (lordo) {
      var r = motore.irpefNetta(lordo, 0, autonomo) || {};
      /* DUE VOCI, NON UNA. `dovutoNetto` è SOLO l'IRPEF (al netto di
         trattamento integrativo e bonus); i contributi previdenziali il motore
         li restituisce a parte, in `contributi`. Sottrarre solo la prima dà
         «lordo meno tasse», che per un dipendente è circa il 9% sopra il netto
         vero — e il lordo ricavato per bisezione uscirebbe basso della stessa
         misura, insieme al risparmio fiscale calcolato su quel lordo.
         Non l'aveva visto nessuna prova: invertire la stessa funzione torna
         sempre al punto di partenza, anche quando la funzione è sbagliata. */
      return lordo - num(r.contributi) - num(r.dovutoNetto);
    };
    var basso = netto, alto = netto * 3;
    for (var i = 0; i < 60; i++) {
      var mezzo = (basso + alto) / 2;
      if (nettoDi(mezzo) < netto) basso = mezzo; else alto = mezzo;
    }
    return (basso + alto) / 2;
  }

  /* ── LA RENDITA DEL FONDO ────────────────────────────────────────────────
     Montante = versamenti capitalizzati al netto di costi e imposta sui
     rendimenti; rendita = montante × coefficiente di conversione.

     Il versamento si capitalizza per gli anni che RESTANO alla pensione, non
     per la carriera: chi comincia a cinquant'anni versa per diciassette anni,
     non per quaranta. È l'errore che fa uscire rendite doppie. */
  function renditaFondo(versamentoMensile, anniAllaPensione, par) {
    var v = pos(versamentoMensile), n = pos(anniAllaPensione);
    var p = par || FONDO;
    var rendNetto = (num(p.rendimentoLordo.v) - num(p.costi.v)) * (1 - num(p.imposta.v));
    var montante = 0;
    for (var a = 0; a < n; a++) {
      montante = (montante + v * 12) * (1 + rendNetto);
    }
    var renditaAnnua = montante * num(p.coeffRendita.v);
    return {
      montante: montante,
      renditaMensile: renditaAnnua / 12,
      rendimentoNetto: rendNetto,
      versatoTotale: v * 12 * n,
    };
  }

  /* ── LA TASSAZIONE DELLA PRESTAZIONE ─────────────────────────────────────
     Art. 11 D.Lgs. 252/2005: 15%, che scende dello 0,30% per ogni anno di
     partecipazione oltre il quindicesimo, con un minimo del 9%. */
  function aliquotaPrestazione(anniPartecipazione) {
    var oltre = Math.max(0, num(anniPartecipazione) - 15);
    return Math.max(0.09, 0.15 - 0.003 * oltre);
  }

  /* ── LE PROPOSTE ─────────────────────────────────────────────────────────
     Tre importi, e il terzo è quello che AZZERA il gap — calcolato, non
     scelto da un elenco: dire «con 100 € azzeri» quando non azzera è la
     promessa che poi non si mantiene. Se l'importo che azzererebbe è fuori
     portata, si dice quello, invece di nasconderlo. */
  function proposte(gapMensile, anniAllaPensione, par, redditoNettoMensile) {
    redditoNettoMensile = pos(redditoNettoMensile);
    /* Le tre cifre d'esempio: sono quelle che una persona riconosce come
       «un caffè al giorno», «una cena», «una rata piccola». Non si sceglie il
       numero che fa piu' effetto — si mostrano sempre le stesse tre e si dice
       la verita' su cosa coprono. */
    var base = [20, 50, 100];
    var out = base.map(function (v) {
      var r = renditaFondo(v, anniAllaPensione, par);
      return {
        versamentoMensile: v,
        renditaMensile: r.renditaMensile,
        coperturaGap: gapMensile > 0 ? Math.min(1, r.renditaMensile / gapMensile) : 1,
        azzera: r.renditaMensile >= gapMensile,
      };
    });
    /* Quanto serve per azzerare: la rendita è lineare nel versamento, quindi
       basta una proporzione sul primo scaglione. */
    var unitaria = renditaFondo(1, anniAllaPensione, par).renditaMensile;
    var perAzzerare = unitaria > 0 ? gapMensile / unitaria : null;
    if (perAzzerare != null && gapMensile > 0) {
      var arrotondato = Math.ceil(perAzzerare / 10) * 10;
      if (!out.some(function (p) { return p.versamentoMensile === arrotondato; })) {
        var r2 = renditaFondo(arrotondato, anniAllaPensione, par);
        out.push({
          versamentoMensile: arrotondato,
          renditaMensile: r2.renditaMensile,
          coperturaGap: 1,
          azzera: true,
          eQuelloCheAzzera: true,
          /* OLTRE IL TETTO NON SI DEDUCE PIU'. 5.164,57 l'anno fanno 430 al
             mese: da li' in su ogni euro versato non porta piu' risparmio
             fiscale. Mostrare «servono 710 al mese» senza dirlo fa sembrare il
             fondo tre volte meno conveniente di quello che e'. */
          oltreIlTettoDeducibile: arrotondato > TETTO_DEDUZIONE / 12,
          /* E quando l'importo che azzera e' fuori scala rispetto a quello che
             la persona porta a casa, dirlo e basta non serve a niente: e' un
             muro, non una proposta. Si segnala, e la schermata cambia
             discorso — coprire una parte invece di azzerare. */
          fuoriPortata: redditoNettoMensile > 0 && arrotondato > redditoNettoMensile * 0.20,
        });
      }
    }
    return out.sort(function (a, b) { return a.versamentoMensile - b.versamentoMensile; });
  }

  /* ── IL CALCOLO, TUTTO INTERO ────────────────────────────────────────────
     Quattro campi dentro, una risposta fuori. */
  function calcola(dati, motore) {
    var lavoro = (dati && dati.lavoro) || 'dipendente';
    if (!LAVORI[lavoro]) lavoro = 'dipendente';
    var nettoMensile = pos(dati && dati.redditoNettoMensile);
    var versamento = pos(dati && dati.versamentoMensile);
    var carriera = anniContribuzione(dati);

    var tasso = tassoSostituzione(lavoro, carriera.anni);
    var pensioneMensile = nettoMensile * tasso;
    var fondo = renditaFondo(versamento, carriera.anniAllaPensione, FONDO);
    var totale = pensioneMensile + fondo.renditaMensile;
    var gap = Math.max(0, nettoMensile - totale);

    /* Il risparmio fiscale passa dal motore completo: vedi la nota in cima.
       Senza motore non si inventa un numero — si dice che non c'è. */
    var lordoAnnuo = lordoDaNetto(nettoMensile * 12, lavoro, motore);
    var versatoAnnuo = Math.min(versamento * 12, TETTO_DEDUZIONE);
    var fiscale = null;
    if (lordoAnnuo != null && motore && typeof motore.risparmioDaDeduzione === 'function') {
      var r = motore.risparmioDaDeduzione(lordoAnnuo, versatoAnnuo, !!LAVORI[lavoro].autonomo);
      fiscale = {
        dedotto: versatoAnnuo,
        oltreIlTetto: versamento * 12 > TETTO_DEDUZIONE,
        tetto: TETTO_DEDUZIONE,
        risparmioAnnuo: r.risparmio,
        aliquotaEffettiva: r.aliquotaEffettiva,
        perdeIlTrattamentoIntegrativo: r.perdeIlTrattamentoIntegrativo,
        impostaAzzerata: r.impostaAzzerata,
        lordoStimato: lordoAnnuo,
      };
    }

    var daConfermare = Object.keys(FONDO)
      .filter(function (k) { return FONDO[k].daConfermare; })
      .map(function (k) { return FONDO[k].etichetta; });
    daConfermare.push('Tasso di sostituzione (tabella per fascia)');

    return {
      lavoro: lavoro,
      etichettaLavoro: LAVORI[lavoro].etichetta,
      redditoNettoMensile: nettoMensile,
      anniContribuzione: carriera.anni,
      anniAllaPensione: carriera.anniAllaPensione,
      etaPensione: ETA_PENSIONE,
      /* Se l'età di inizio lavoro non c'era, TUTTO il risultato è prudenziale
         e va detto ovunque compaia — schermata e PDF. */
      prudenziale: carriera.prudenziale,
      etaInizioUsata: carriera.etaInizioUsata,
      tassoSostituzione: tasso,
      pensionePubblicaMensile: pensioneMensile,
      versamentoMensile: versamento,
      fondo: fondo,
      aliquotaPrestazione: aliquotaPrestazione(carriera.anniAllaPensione),
      totaleMensile: totale,
      gapMensile: gap,
      gapPercentuale: nettoMensile > 0 ? gap / nettoMensile : 0,
      proposte: proposte(gap, carriera.anniAllaPensione, FONDO, nettoMensile),
      fiscale: fiscale,
      mostraTfr: !!LAVORI[lavoro].tfr,
      daConfermare: daConfermare,
    };
  }

  /* ── IL CONFRONTO TFR ────────────────────────────────────────────────────
     Pro e contro, NON una raccomandazione: la scelta sul TFR è del lavoratore
     e dipende da cose che non stanno in questo foglio. Solo per i dipendenti,
     perché solo loro hanno un TFR. */
  var TFR = {
    righe: [
      { voce: 'Tassazione',
        azienda: 'Tassazione separata, con l\'aliquota media IRPEF degli ultimi anni: tipicamente oltre il 20%.',
        fondo:   'Il 15%, che scende dello 0,30% per ogni anno di partecipazione oltre il quindicesimo, fino a un minimo del 9%.' },
      { voce: 'Rivalutazione',
        azienda: '1,5% fisso all\'anno più il 75% dell\'inflazione. È certa, ma non dipende dai mercati.',
        fondo:   'Il rendimento della linea scelta. Non è garantito, salvo appunto le linee garantite.' },
      { voce: 'Contributo del datore di lavoro',
        azienda: 'Nessuno.',
        fondo:   'Previsto in molti contratti, ma solo se il TFR va nel fondo. È denaro che altrimenti non si prende.' },
      { voce: 'Anticipazioni',
        azienda: 'Molto limitate: servono otto anni di anzianità e i casi sono stretti.',
        fondo:   'Fino al 75% per spese sanitarie gravi, in qualsiasi momento. Fino al 75% per la prima casa e fino al 30% per altre esigenze, dopo otto anni di partecipazione.' },
    ],
    /* L'OBIEZIONE NUMERO UNO. Va mostrata su tutte e due le colonne e nel
       report: se la si lascia fuori, il cliente ci pensa lo stesso — solo
       senza risposta. */
    quandoLiRiprendo: {
      titolo: 'Quando posso riprendere i miei soldi',
      azienda: 'Il TFR lasciato in azienda si riscuote alla fine del rapporto di lavoro. Prima, solo nei casi di anticipazione previsti dalla legge, e dopo otto anni di servizio.',
      fondo: [
        'Se perdi il lavoro: il 50% dopo 12 mesi di inoccupazione, il 100% dopo 48 mesi.',
        'Se ti dimetti: il riscatto totale è possibile, ma dopo il periodo di attesa previsto.',
        'Spese sanitarie gravi: fino al 75%, in qualsiasi momento, senza attendere.',
        'Prima casa: fino al 75% dopo otto anni di partecipazione.',
        'Altre esigenze, senza doverle motivare: fino al 30% dopo otto anni.',
      ],
      /* La disciplina è quella del D.Lgs. 252/2005 e vale uguale per fondi
         negoziali, aperti e PIP. Quello che cambia da compagnia a compagnia
         sono i TEMPI materiali di liquidazione, e quelli non si scrivono
         finché non li conferma HDI. */
      daVerificare: 'Tempi e condizioni reali di liquidazione in caso di licenziamento rispetto alle dimissioni: da confermare con HDI prima di dirlo a un cliente.',
    },
  };

  /* ── IL DISCLAIMER ───────────────────────────────────────────────────────
     Obbligatorio sul PDF. Non è una formalità: senza, una proiezione diventa
     una promessa, e una promessa su trent'anni non la può fare nessuno. */
  function disclaimer(prudenziale) {
    return 'Proiezione a scopo illustrativo, basata su ipotesi e parametri attuali. ' +
      'Non è una promessa di rendimento né una previsione dell\'assegno INPS effettivo: ' +
      'i valori cambiano al variare dei parametri, delle norme e dei rendimenti reali.' +
      (prudenziale
        ? ' L\'età di inizio dell\'attività lavorativa non è stata indicata: il calcolo usa uno scenario prudenziale ' +
          '(inizio tardivo), che restituisce una pensione più bassa e un divario più ampio di quelli probabili.'
        : '');
  }

  var API = {
    TETTO_DEDUZIONE: TETTO_DEDUZIONE,
    ETA_PENSIONE: ETA_PENSIONE,
    ETA_INIZIO_PRUDENZIALE: ETA_INIZIO_PRUDENZIALE,
    COEFFICIENTI: COEFFICIENTI,
    LAVORI: LAVORI,
    FONDO: FONDO,
    TFR: TFR,
    anniContribuzione: anniContribuzione,
    tassoSostituzione: tassoSostituzione,
    lordoDaNetto: lordoDaNetto,
    renditaFondo: renditaFondo,
    aliquotaPrestazione: aliquotaPrestazione,
    proposte: proposte,
    calcola: calcola,
    disclaimer: disclaimer,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.PrevidenzaFlash = API;
})();
