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


  /* ═══════════════════════════════════════════════════════════════════════
     DALL'ANAGRAFICA AL CALCOLO — le due cose che il CRM già sa

     Il flusso a quattro campi ne chiede in realtà tre e mezzo, se il cliente è
     già in anagrafica: la data di nascita c'è, la professione c'è. Quello che
     manca davvero è UNA cosa sola — a che età ha cominciato a lavorare — e
     quella si chiede.
     ═══════════════════════════════════════════════════════════════════════ */

  /* ── L'ETÀ ────────────────────────────────────────────────────────────────
     `oggi` si passa da fuori, non si legge dall'orologio: è la stessa regola
     del resto del modulo. Un'analisi rifatta domani sugli stessi dati deve
     dare lo stesso numero, e una prova che dipende dalla data di esecuzione
     è una prova che un giorno cade da sola. */
  function etaDa(dataNascita, oggi) {
    if (!dataNascita) return null;
    var n = new Date(dataNascita);
    var o = oggi ? new Date(oggi) : null;
    if (!o || isNaN(o.getTime())) return null;
    if (isNaN(n.getTime())) return null;
    var eta = o.getFullYear() - n.getFullYear();
    /* Il compleanno non ancora passato vale un anno in meno: su una soglia
       come i 67 anni un arrotondamento all'anno solare sposta l'intero
       risultato. */
    var m = o.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && o.getDate() < n.getDate())) eta--;
    if (eta < 0 || eta > 120) return null;
    return eta;
  }

  /* ── LA PROFESSIONE SCRITTA A MANO ────────────────────────────────────────
     In anagrafica «Professione» è un campo libero: ci sta scritto «Impiegato»,
     «idraulico», «Avvocato», «commerciante», e anche «ditta individuale
     settore edile». Va ricondotto a una delle tre gestioni, perché fra
     dipendente e autonomo ballano venti punti di tasso di sostituzione.

     QUANDO NON SI CAPISCE, NON SI INDOVINA. Un tipo di lavoro sbagliato non
     produce un errore: produce una pensione credibile e sbagliata. Si
     restituisce `certo: false` e la schermata chiede di confermare — che è
     un secondo di lavoro per l'agente e l'unico modo di non sbagliare in
     silenzio. */
  var PAROLE = {
    professionista: ['avvocat', 'notaio', 'commercialist', 'architett', 'ingegner', 'geometra',
      'medico', 'medic', 'odontoiatr', 'dentist', 'veterinar', 'farmacist', 'psicolog',
      'consulente del lavoro', 'ragionier', 'attuari', 'agronom', 'chimic', 'biolog',
      'infermier libero', 'libero professionist', 'professionist', 'studio associato'],
    autonomo: ['artigian', 'commerciant', 'negoziant', 'imprenditor', 'titolare', 'socio',
      'partita iva', 'p.iva', 'autonom', 'idraulic', 'elettricist', 'muratore', 'edil',
      'parrucchier', 'estetist', 'agricoltor', 'coltivator', 'ristorator', 'barista',
      'tassist', 'ambulante', 'ditta individuale', 'agente di commercio', 'agente',
      'rappresentante', 'coadiuvante', 'freelance'],
    dipendente: ['impiegat', 'operai', 'oper', 'quadro', 'dirigent', 'insegnant', 'docente',
      'professore', 'maestr', 'infermier', 'oss ', 'militare', 'carabinier', 'polizi',
      'vigile', 'pompier', 'ferrovier', 'postin', 'bancari', 'assunt', 'dipendent',
      'statale', 'pubblico impiego', 'cassier', 'magazzinier', 'autist', 'camerier',
      'commess', 'apprendist', 'tecnic', 'segretari'],
  };

  function lavoroDaProfessione(testo) {
    var t = String(testo == null ? '' : testo).toLowerCase().trim();
    if (!t) return { lavoro: null, certo: false, motivo: 'in anagrafica la professione non è compilata' };
    /* L'ordine conta: «medico dipendente» è un dipendente, non un
       professionista, e «agente di commercio» è un autonomo anche se contiene
       «commercio». Si guarda prima il segnale più specifico. */
    if (/\bdipendent|\bassunt|\ba tempo (in)?determinato|\bcontratto (a|di) /.test(t)) {
      return { lavoro: 'dipendente', certo: true, motivo: 'la professione dice esplicitamente «dipendente»' };
    }
    var trovati = [];
    ['professionista', 'autonomo', 'dipendente'].forEach(function (k) {
      if (PAROLE[k].some(function (p) { return t.indexOf(p) >= 0; })) trovati.push(k);
    });
    if (trovati.length === 1) {
      return { lavoro: trovati[0], certo: true, motivo: 'dedotto dalla professione in anagrafica: «' + testo + '»' };
    }
    if (trovati.length > 1) {
      /* Due segnali in contrasto («medico di famiglia convenzionato»,
         «tecnico con partita iva») sono esattamente il caso in cui indovinare
         costa caro. Si propone il primo e si dice che va confermato. */
      return { lavoro: trovati[0], certo: false,
        motivo: '«' + testo + '» può essere ' + trovati.join(' o ') + ': conferma tu' };
    }
    return { lavoro: null, certo: false, motivo: '«' + testo + '» non basta a capire il tipo di lavoro' };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     IL FOGLIO PER IL CLIENTE

     Quello che esce dalla stampante è l'unica parte di questo modulo che
     sopravvive alla conversazione: resta in mano al cliente, e fra un anno
     torna indietro. Per questo tre cose non sono facoltative:

       · IL DISCLAIMER. Senza, una proiezione diventa una promessa, e una
         promessa su trent'anni non la può fare nessuno.
       · LO SCENARIO PRUDENZIALE MARCATO. Un numero peggiorativo presentato
         come stima è un numero falso, e sul foglio dura più che a voce.
       · IL BLOCCO SUL RISCATTO. È l'obiezione numero uno, e se la si lascia
         fuori il cliente ci pensa lo stesso — solo senza risposta.
     ═══════════════════════════════════════════════════════════════════════ */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var euro = function (n) { return '€ ' + Math.round(num(n)).toLocaleString('it-IT'); };
  /* Il tetto di deducibilità si scrive per intero, centesimi compresi: è un
     numero di legge, e arrotondarlo a 5.165 lo fa sembrare una nostra stima.

     Il punto delle migliaia si mette a mano invece di chiederlo a
     `toLocaleString`: per l'italiano il CLDR non raggruppa i numeri di quattro
     cifre, e ne uscirebbe «5164,57» — che nella norma, sulla COVIP e in ogni
     circolare è scritto «5.164,57». */
  var euroCent = function (n) {
    var v = num(n), segno = v < 0 ? '-' : '';
    v = Math.abs(v);
    var intero = Math.floor(v), cent = Math.round((v - intero) * 100);
    if (cent === 100) { intero += 1; cent = 0; }
    return '€ ' + segno + String(intero).replace(/\B(?=(\d{3})+(?!\d))/g, '.') +
      ',' + (cent < 10 ? '0' : '') + cent;
  };
  var perc = function (n, d) { return (num(n) * 100).toFixed(d == null ? 0 : d).replace('.', ',') + '%'; };

  /* « il 82% » non lo scrive nessuno: si dice «l'82%». L'articolo si elide
     davanti ai numeri che si leggono con una vocale iniziale — uno, otto,
     undici, ottanta e i suoi. Su un messaggio che parte a un cliente vero
     questa è la differenza fra scritto da una persona e scritto da un
     programma. */
  var ilPerc = function (n) {
    var i = Math.round(num(n) * 100);
    var elide = i === 1 || i === 8 || i === 11 || (i >= 80 && i <= 89);
    return (elide ? 'l\'' : 'il ') + perc(n);
  };

  /* ── COME SI CHIAMA UNA PROPOSTA CHE NON AZZERA ─────────────────────────
     «con 20 € sei ancora lontano, con 50 € ti avvicini, con 100 € azzeri»: è
     il discorso che si fa a voce, e deve essere lo stesso a schermo e sul
     foglio. Stava scritto in due posti, e i due posti si erano già scostati —
     la stessa proposta al 40% era «sei ancora lontano» sullo schermo e «ti
     avvicina» sul foglio. Il cliente li vede tutti e due.

     Le soglie sono quello che sono: al 16% dire «ti avvicini» è una cortesia
     che poi non regge quando si guarda la colonna accanto. */
  function frasePer(p) {
    if (!p) return '';
    if (p.azzera) return 'azzera il divario';
    var c = num(p.coperturaGap);
    if (c >= 0.6) return 'ci sei quasi';
    if (c >= 0.25) return 'ti avvicini';
    return 'sei ancora lontano';
  }

  /* Il blocco del riscatto, in HTML. Serve due volte nel foglio — nella
     colonna del fondo e, per chi non ha TFR, da solo — e in due posti nella
     schermata: sta scritto UNA volta. */
  function bloccoRiscatto() {
    return '<ul class="ri">' + TFR.quandoLiRiprendo.fondo.map(function (r) {
      return '<li>' + esc(r) + '</li>';
    }).join('') + '</ul>';
  }

  function reportFlash(d) {
    d = d || {};
    var r = d.esito, cliente = d.cliente || {}, cons = d.consulente || {};
    var mancanti = [];
    if (!r || !r.redditoNettoMensile) mancanti.push('il calcolo (reddito netto mensile mancante)');
    if (!d.dataRiferimento) mancanti.push('la data del documento (va passata, non presa dall\'orologio)');
    if (!cons.nome) mancanti.push('il consulente che firma');
    /* Meglio nessun foglio che un foglio senza data o senza firma: è la
       stessa regola del report esteso, e vale a maggior ragione qui, dove il
       documento è più breve e sembra meno impegnativo di quello che è. */
    if (mancanti.length) return { ok: false, problemi: mancanti, html: null };

    var prop = (r.proposte || []).filter(function (p) { return p.versamentoMensile > 0; });

    var righeTfr = TFR.righe.map(function (x) {
      return '<tr><td class="v">' + esc(x.voce) + '</td><td>' + esc(x.azienda) + '</td><td>' + esc(x.fondo) + '</td></tr>';
    }).join('');

    var html =
'<!doctype html><html lang="it"><head><meta charset="utf-8"><title>La tua pensione — ' + esc(cliente.nome || '') + '</title>' +
'<style>*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;' +
'color:#1b2733;margin:0;padding:34px;font-size:13px;line-height:1.55}' +
'.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #02984e;padding-bottom:14px;margin-bottom:16px}' +
'.hd img{height:38px}.hd .t{font-size:11px;color:#5b6b7c;text-transform:uppercase;letter-spacing:1px}' +
'h1{font-size:21px;margin:2px 0 0;letter-spacing:-.02em}.meta{text-align:right;font-size:12px;color:#5b6b7c}' +
'.sec{font-size:11px;font-weight:700;color:#02984e;text-transform:uppercase;letter-spacing:.5px;margin:20px 0 6px}' +
'.row{display:flex;justify-content:space-between;gap:16px;border-bottom:1px dashed #dfe5e9;padding:5px 0}' +
'.gap{background:#fdecea;border:1px solid #f5c2bd;border-radius:10px;padding:13px 15px;margin:14px 0}' +
'.gap b{font-size:24px;color:#c0392b;display:block;line-height:1.2}' +
'.box{background:#eaf7f0;border:1px solid #b9e3cd;border-radius:10px;padding:11px 13px;margin:14px 0}' +
'.warn{background:#fff4e6;border:1px solid #ffd8a8;color:#8a4b00;border-radius:10px;padding:11px 13px;margin:14px 0;font-size:12px}' +
'table.t{width:100%;border-collapse:collapse;margin:6px 0}' +
'table.t th{text-align:left;font-size:11px;color:#5b6b7c;text-transform:uppercase;border-bottom:1px solid #dfe5e9;padding:6px}' +
'table.t td{padding:6px;border-bottom:1px solid #eef2f4;vertical-align:top}' +
'table.t .n{text-align:right;font-variant-numeric:tabular-nums}table.t td.v{font-weight:700;width:22%}' +
'.m{font-size:11.5px;color:#5b6b7c;margin:4px 0 0}' +
'.ri{margin:6px 0 0;padding-left:17px}.ri li{margin:3px 0}' +
'.firma{margin-top:28px;border-top:1px solid #1b2733;padding-top:8px;font-size:12px}' +
'.note{font-size:10.5px;color:#5b6b7c;border-top:1px solid #dfe5e9;margin-top:20px;padding-top:10px;line-height:1.6}' +
'.pie{text-align:center;color:#93a0ac;font-size:11px;line-height:1.7;border-top:1px solid #dfe5e9;margin-top:16px;padding-top:12px}' +
'@media print{body{padding:18px}.warn,.gap,.box{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>' +

'<div class="hd"><div>' + (d.logo ? '<img src="' + esc(d.logo) + '" alt="With Us">' : '') +
'<div class="t">With Us Assicurazioni</div><h1>La tua pensione, in due minuti</h1></div>' +
'<div class="meta">' + esc(cliente.nome || '') + '<br>' + esc(d.dataRiferimento) + '</div></div>' +

/* LA MARCATURA DELLO SCENARIO PEGGIORATIVO STA IN CIMA, non in fondo: chi
   legge un foglio non arriva sempre all'ultima riga, e questa è la riga che
   cambia il significato di tutte le altre. */
(r.prudenziale
  ? '<div class="warn"><b>Stima prudenziale.</b> Non sapendo a che età hai cominciato a lavorare, ' +
    'il calcolo assume un inizio tardivo (' + esc(r.etaInizioUsata) + ' anni): meno anni di contributi, ' +
    'pensione più bassa e divario più ampio di quelli probabili. Con l\'anno reale di inizio lavoro il conto ' +
    'si rifà in un minuto, e quasi sempre migliora.</div>'
  : '') +

'<div class="sec">La tua situazione</div>' +
'<div class="row"><span>Tipo di lavoro</span><b>' + esc(r.etichettaLavoro) + '</b></div>' +
'<div class="row"><span>Reddito netto di oggi</span><b>' + euro(r.redditoNettoMensile) + ' al mese</b></div>' +
'<div class="row"><span>Pensione di vecchiaia prevista a</span><b>' + esc(r.etaPensione) + ' anni</b></div>' +
'<div class="row"><span>Anni alla pensione</span><b>' + esc(r.anniAllaPensione) + '</b></div>' +
'<div class="row"><span>Anni di contributi al pensionamento</span><b>' + esc(r.anniContribuzione) +
  (r.prudenziale ? ' <span style="color:#8a4b00">(stima prudenziale)</span>' : '') + '</b></div>' +
'<div class="m">L\'età della pensione di vecchiaia è oggi 67 anni. Si adegua alla speranza di vita: chi è ' +
'lontano dal traguardo probabilmente ci arriverà più tardi, e questo foglio non lo proietta.</div>' +

'<div class="sec">Cosa ti aspetta</div>' +
'<div class="row"><span>Pensione pubblica stimata</span><b>' + euro(r.pensionePubblicaMensile) + ' al mese</b></div>' +
'<div class="row"><span>Quanto copre del tuo reddito di oggi</span><b>' + perc(r.tassoSostituzione) + '</b></div>' +
(r.versamentoMensile > 0
  ? '<div class="row"><span>Rendita del fondo, versando ' + euro(r.versamentoMensile) + ' al mese</span><b>' +
    euro(r.fondo.renditaMensile) + ' al mese</b></div>' +
    '<div class="row"><span>Capitale accumulato alla pensione</span><b>' + euro(r.fondo.montante) +
    ', di cui ' + euro(r.fondo.versatoTotale) + ' versati da te</b></div>'
  : '') +

'<div class="gap"><span>Quanto ti mancherebbe ogni mese' + (r.versamentoMensile > 0 ? ', anche col versamento di sopra' : '') + '</span>' +
'<b>' + euro(r.gapMensile) + '</b>' +
'<span>È la differenza fra quello che porti a casa oggi e quello che porteresti a casa da pensionato: ' +
perc(r.gapPercentuale) + ' del tuo reddito attuale.</span></div>' +

(prop.length
  ? '<div class="sec">Con quanto al mese lo copri</div>' +
    '<table class="t"><tr><th>Versamento</th><th class="n">Rendita in più</th><th class="n">Copre del divario</th><th>&nbsp;</th></tr>' +
    prop.map(function (p) {
      return '<tr><td>' + euro(p.versamentoMensile) + ' al mese</td>' +
        '<td class="n">' + euro(p.renditaMensile) + '</td>' +
        '<td class="n">' + perc(p.coperturaGap) + '</td>' +
        '<td>' + (p.azzera ? '<b style="color:#02984e">' + esc(frasePer(p)) + '</b>' : esc(frasePer(p))) +
        (p.oltreIlTettoDeducibile ? '<div class="m">oltre ' + euro(TETTO_DEDUZIONE / 12) +
          ' al mese (' + euroCent(TETTO_DEDUZIONE) + ' l\'anno) non si deduce più: ' +
          'la parte in eccesso non porta risparmio fiscale</div>' : '') +
        '</td></tr>';
    }).join('') + '</table>'
  : '') +

(r.fiscale
  ? '<div class="sec">Quanto ti torna indietro dalle tasse</div>' +
    '<div class="row"><span>Versato in un anno, dedotto</span><b>' + euro(r.fiscale.dedotto) + '</b></div>' +
    '<div class="row"><span>Risparmio fiscale stimato</span><b style="color:' +
      (r.fiscale.risparmioAnnuo > 0 ? '#02984e' : '#c0392b') + '">' + euro(r.fiscale.risparmioAnnuo) + ' all\'anno</b></div>' +
    /* IL TETTO SI SCRIVE SEMPRE, non solo quando lo si supera. È il confine
       del beneficio: chi legge «risparmio fiscale» senza sapere fin dove
       arriva, o crede che non finisca mai, o sospetta che ci sia una trappola
       non detta. Una prova tiene ferma questa riga. */
    '<div class="m">Il tetto di deducibilità è ' + euroCent(TETTO_DEDUZIONE) + ' all\'anno ' +
    '(art. 8 D.Lgs. 252/2005), cioè ' + euro(TETTO_DEDUZIONE / 12) + ' al mese: ' +
    (r.fiscale.oltreIlTetto
      ? '<b>il tuo versamento lo supera</b>, e la parte in eccesso non si deduce.'
      : 'il tuo versamento resta sotto, quindi si deduce per intero.') + '</div>' +
    (r.fiscale.perdeIlTrattamentoIntegrativo
      ? '<div class="warn"><b>Attenzione.</b> Con questo versamento l\'imposta scende sotto la soglia di capienza e ' +
        'si perde il trattamento integrativo: il risparmio fiscale si riduce, e su questi importi può azzerarsi. ' +
        'Prima di versare, verificare con il commercialista.</div>' : '') +
    '<div class="m">Calcolato sul reddito di oggi, come differenza fra l\'IRPEF dovuta senza il versamento e quella ' +
    'dovuta con il versamento. Non tiene conto delle addizionali regionale e comunale: il beneficio effettivo è ' +
    'leggermente superiore. Cambia negli anni con il reddito e con le regole fiscali.</div>'
  : '') +

/* ── IL CONFRONTO TFR ────────────────────────────────────────────────────
   Pro e contro, non una raccomandazione: la scelta è del lavoratore e
   dipende da cose che non stanno su questo foglio. */
(r.mostraTfr
  ? '<div class="sec">Il TFR: in azienda o nel fondo</div>' +
    '<table class="t"><tr><th>&nbsp;</th><th>TFR in azienda</th><th>TFR nel fondo</th></tr>' + righeTfr +
    '<tr><td class="v">' + esc(TFR.quandoLiRiprendo.titolo) + '</td>' +
    '<td>' + esc(TFR.quandoLiRiprendo.azienda) + '</td>' +
    '<td>' + bloccoRiscatto() + '</td></tr></table>' +
    '<div class="m">Questo confronto mette in fila pro e contro: <b>non è una raccomandazione</b>. ' +
    'La scelta dipende anche dal contratto applicato, dal contributo del datore di lavoro e dai tuoi progetti.</div>' +
    '<div class="warn">' + esc(TFR.quandoLiRiprendo.daVerificare) + '</div>'
  /* Chi non ha TFR non ha la tabella, ma la domanda «quando li riprendo» se
     la fa lo stesso: il blocco resta, da solo. */
  : '<div class="sec">' + esc(TFR.quandoLiRiprendo.titolo) + '</div>' +
    '<div class="box">' + bloccoRiscatto() + '</div>' +
    '<div class="warn">' + esc(TFR.quandoLiRiprendo.daVerificare) + '</div>') +

((r.daConfermare || []).length
  ? '<div class="warn"><b>Parametri in attesa di conferma:</b> ' +
    esc(r.daConfermare.join('; ')) + '.</div>'
  : '') +

'<div class="firma"><b>' + esc(cons.nome) + '</b>' + (cons.ruolo ? ' — ' + esc(cons.ruolo) : '') +
(cons.rui ? '<br>Iscrizione RUI ' + esc(cons.rui) : '') +
(cons.email ? '<br>' + esc(cons.email) : '') + (cons.telefono ? ' · ' + esc(cons.telefono) : '') + '</div>' +

'<div class="note"><b>Avvertenza.</b> ' + esc(disclaimer(r.prudenziale)) +
' La rendita del fondo è calcolata con la tariffa di riferimento del preventivatore online HDI ' +
'(Azione di Previdenza — fondo pensione aperto; Previdenza HDI — piano individuale pensionistico, albo COVIP n. 5007). ' +
'Prima della sottoscrizione leggere la Nota informativa e il Regolamento del prodotto.</div>' +
'<div class="pie">With Us Assicurazioni · ' + esc(d.dataRiferimento) + '</div>' +
'</body></html>';

    return { ok: true, problemi: [], html: html };
  }

  /* ── IL MESSAGGIO DA MANDARE ──────────────────────────────────────────────
     Precompilato, non automatico: si apre già scritto e chi lo manda può
     cambiarlo. Niente cifre che non siano già sul foglio, e nessuna promessa
     — il messaggio serve ad aprire la conversazione, non a chiuderla.

     WhatsApp non accetta allegati da un link: il PDF si stampa e si allega a
     mano, e il testo lo dice invece di far finta che parta da solo. */
  function messaggioWhatsapp(r, cliente) {
    if (!r) return '';
    var nome = ((cliente && cliente.nome) || '').trim().split(/\s+/)[0] || '';
    var righe = [];
    righe.push((nome ? 'Ciao ' + nome + ', ' : 'Ciao, ') + 'ho fatto due conti sulla tua pensione.');
    righe.push('');
    righe.push('Con la pensione pubblica prenderesti circa ' + euro(r.pensionePubblicaMensile) +
      ' al mese, cioè ' + ilPerc(r.tassoSostituzione) + ' di quello che porti a casa adesso.');
    if (r.gapMensile > 0) {
      righe.push('Ti mancherebbero circa ' + euro(r.gapMensile) + ' al mese.');
      var azzera = (r.proposte || []).filter(function (p) { return p.azzera && !p.fuoriPortata; })[0];
      var parziale = (r.proposte || []).filter(function (p) { return p.versamentoMensile > 0; })[0];
      if (azzera) righe.push('Con ' + euro(azzera.versamentoMensile) + ' al mese in un fondo pensione lo copri per intero.');
      else if (parziale) righe.push('Con ' + euro(parziale.versamentoMensile) + ' al mese in un fondo pensione ne copri ' +
        ilPerc(parziale.coperturaGap) + ': si parte da lì e si alza quando puoi.');
    }
    if (r.fiscale && r.fiscale.risparmioAnnuo > 0) {
      righe.push('E quello che versi si deduce: circa ' + euro(r.fiscale.risparmioAnnuo) + ' all\'anno di tasse in meno.');
    }
    righe.push('');
    if (r.prudenziale) {
      righe.push('Nota: non sapendo a che età hai cominciato a lavorare ho fatto la stima più prudente. ' +
        'Dimmi l\'anno e il conto migliora.');
      righe.push('');
    }
    righe.push('Ti allego il foglio con tutti i numeri. Sono stime a scopo illustrativo, non una promessa di rendimento: ' +
      'quando vuoi ne parliamo con calma.');
    return righe.join('\n');
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
    etaDa: etaDa,
    lavoroDaProfessione: lavoroDaProfessione,
    bloccoRiscatto: bloccoRiscatto,
    frasePer: frasePer,
    reportFlash: reportFlash,
    messaggioWhatsapp: messaggioWhatsapp,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.PrevidenzaFlash = API;
})();
