/* ═══════════════════════════════════════════════════════════════════════════
   IRPEF — il conto delle imposte, staccato dal motore che lo usava.

   ── PERCHÉ QUESTO FILE ESISTE (12/09/2026) ────────────────────────────────
   Il flusso previdenziale è stato rifatto da zero. Il motore vecchio
   (tariffe/motore/previdenza.js) se n'è andato con lui: proiezioni del
   montante anno per anno, coefficienti di trasformazione proiettati, sconto
   dell'inflazione — tutta roba giusta per un'analisi a tavolino e sbagliata
   per una conversazione in piedi.

   QUESTO PEZZO NO. Il conto dell'IRPEF non era «vecchio flusso»: era un
   calcolatore fiscale a sé, con 46 prove sopra, e sa una cosa che nessuna
   percentuale a occhio saprebbe —

     DEDURRE PUÒ FAR PERDERE IL TRATTAMENTO INTEGRATIVO. Il versamento
     abbassa l'imponibile, l'imposta lorda scende sotto la soglia di
     capienza, e i 1.200 euro non spettano più. Il «risparmio» diventa
     NEGATIVO: versare costa più del versamento. Chi mostra al cliente
     «aliquota × importo dedotto» quel caso non lo vede, e in quel caso sta
     vendendo un danno chiamandolo vantaggio.

   Riscriverlo per uniformità sarebbe stato il vero rischio di questo lavoro.
   Quindi NON è stato riscritto: è stato SPOSTATO, riga per riga, senza
   cambiare un'operazione. Le prove che lo tengono fermo sono le stesse di
   prima (server/verifica/irpef.test.mjs), ripuntate qui.
   È una scelta dichiarata, non una svista: si riusa, e lo si dice.

   ── COSA È STATO AGGIUNTO ─────────────────────────────────────────────────
   In fondo, in un blocco separato e marcato, tre cose che il flusso nuovo
   chiede e che qui non c'erano:

     · la detrazione per i redditi da PENSIONE (art. 13 c. 3 TUIR), che serve
       per dire quanto sarà netto in mano l'assegno pubblico;
     · `irpefSuPensione`, che la applica — un pensionato non versa contributi
       e non prende né trattamento integrativo né ulteriore detrazione;
     · `lordoDaNetto`, l'inversione per bisezione: il cliente sa il netto,
       l'IRPEF si calcola sul lordo.

   Il blocco aggiunto NON tocca una riga di quello spostato. Chi confronta
   questo file con la cronologia di previdenza.js deve trovare le funzioni
   fiscali identiche: è la ragione per cui il lavoro si può firmare.

   Come gli altri motori di questa cartella, il file lo caricano DUE mondi: la
   pagina nel browser (<script src>) e Node (require) per le prove. Niente
   import/export, niente compilazione: in fondo si espone a chi lo carica.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 1 — SPOSTATA DA previdenza.js SENZA CAMBIARE UN'OPERAZIONE
   Da qui fino al segno «PARTE 2» non si modifica niente: se un numero va
   corretto, si corregge e si corregge la prova che lo teneva fermo.
   ═══════════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 2 — AGGIUNTE DEL 12/09/2026, per il flusso pensione nuovo.
   Sotto questa riga c'è codice nuovo, e sopra non se n'è toccata una. Ogni
   cosa qui sotto è composta con le funzioni di sopra: nessuna riscrive un
   pezzo di conto che lì c'era già.
   ═══════════════════════════════════════════════════════════════════════════ */

/* La versione delle REGOLE FISCALI. Resta 2026-09-09 — la data dell'ultima
   volta in cui un numero di questo conto è cambiato — e NON si tocca per il
   trasloco: spostare un file non cambia un'imposta. Se cambiasse qui, il
   materiale di formazione in server/verifica/casi/ risulterebbe da rigenerare
   senza che nessuna aliquota si sia mossa, e la prossima volta che risulta da
   rigenerare davvero nessuno ci farebbe più caso. */
var VERSIONE_REGOLE = '2026-09-09';

/* ── LA DETRAZIONE PER I REDDITI DA PENSIONE ──────────────────────────────
   Art. 13 c. 3 TUIR. Serve per una domanda sola, ma è la domanda del cliente:
   «quanto mi resta in mano?». L'assegno pubblico è un reddito e si tassa; se
   si confronta un reddito NETTO da lavoro con una pensione LORDA, il divario
   esce più largo del vero. Comodo per vendere, indifendibile.

   PERCHÉ NON BASTAVA QUELLA DA LAVORO DIPENDENTE. Somiglia, ma non coincide:
   stessa forma, scaglioni diversi, e soprattutto al pensionato NON spettano
   né il trattamento integrativo né l'ulteriore detrazione né la somma non
   imponibile, che sono tutti istituti legati al reddito di LAVORO. Usare la
   tabella del dipendente avrebbe dato un netto più alto del vero.

   MARCATA DA RISCONTRARE, e resta marcata finché qualcuno non la legge su
   Normattiva. È la stessa regola che vale per la circolare INPS in cima al
   file: un numero che non abbiamo letto sull'originale viaggia con l'avviso
   attaccato, fino al foglio del cliente. */
var DETRAZIONE_PENSIONE = {
  daRiscontrare: true,
  fonte: 'TUIR art. 13 c. 3 (importi allineati dal D.Lgs. 216/2023, resi strutturali dalla L. 207/2024). NON letto sul testo originale: da riscontrare su Normattiva.',
  fissa: 1955, finoA: 8500,
  prima: { a: 28000, base: 700, quota: 1255, arco: 19500 },
  seconda: { a: 50000, base: 700, arco: 22000 },
};

function detrazionePensione(redditoComplessivo, d) {
  d = d || DETRAZIONE_PENSIONE;
  var r = Math.max(0, Number(redditoComplessivo) || 0);
  var v;
  if (r <= d.finoA) v = d.fissa;
  /* Lo stesso troncamento alla quarta cifra dell'art. 13 c. 6: vale per tutte
     le detrazioni commisurate al reddito, non solo per quelle da lavoro. */
  else if (r <= d.prima.a) v = d.prima.base + d.prima.quota * tronca4((d.prima.a - r) / d.prima.arco);
  else if (r <= d.seconda.a) v = d.seconda.base * tronca4((d.seconda.a - r) / d.seconda.arco);
  else v = 0;
  return Math.max(0, v);
}

/* ── L'IMPOSTA SULL'ASSEGNO PUBBLICO ──────────────────────────────────────
   Tre differenze rispetto a un reddito da lavoro, e sono tutte e tre in
   diminuzione di quello che si potrebbe essere tentati di applicare:

     1. NIENTE CONTRIBUTI. Sulla pensione non si versa: il reddito complessivo
        coincide col lordo. (Ed è il motivo per cui il tasso di sostituzione
        NETTO su NETTO è più alto di quello lordo su lordo: stesso lordo,
        meno prelievo.)
     2. NIENTE TRATTAMENTO INTEGRATIVO. D.L. 3/2020 art. 1: spetta sui redditi
        di lavoro dipendente e assimilati. Una pensione non è né l'uno né
        l'altro.
     3. NIENTE ULTERIORE DETRAZIONE NÉ SOMMA NON IMPONIBILE. L. 207/2024
        art. 1 cc. 4 e 6: entrambe sui redditi di lavoro dipendente.

   Le addizionali regionali e comunali NON sono qui. Dipendono dal comune di
   residenza, valgono uno o due punti, e metterne una media sarebbe inventare:
   il risultato lo dichiara, e chi legge sa che il netto vero è un filo più
   basso di questo. */
function irpefSuPensione(lordoAnnuo, f, d) {
  f = f || FISCO;
  var lordo = Math.max(0, Number(lordoAnnuo) || 0);
  var lorda = irpefLorda(lordo, f);
  var detr = detrazionePensione(lordo, d);
  var netta = Math.max(0, lorda - detr);
  return {
    lordo: lordo,
    redditoComplessivo: lordo,
    imponibile: lordo,
    lorda: lorda,
    detrazione: detr,
    netta: netta,
    netto: lordo - netta,
    /* Chi consuma questo risultato deve poter dire da dove viene il numero e
       cosa non c'è dentro. Sta attaccato al risultato, non in una nota a
       margine che si perde. */
    senzaAddizionali: true,
    daRiscontrare: DETRAZIONE_PENSIONE.daRiscontrare ? [DETRAZIONE_PENSIONE.fonte] : [],
  };
}

/* ── IL NETTO CHE ESCE DA UN LORDO DA LAVORO ──────────────────────────────
   Due voci, non una. `dovutoNetto` è SOLO l'IRPEF (già al netto di
   trattamento integrativo e somma non imponibile); i contributi a carico del
   lavoratore il motore li restituisce a parte. Sottrarre solo la prima dà
   «lordo meno tasse», che per un dipendente sta circa nove punti sopra il
   netto vero. */
function nettoDaLordo(lordoAnnuo, gestione, f) {
  var lordo = Math.max(0, Number(lordoAnnuo) || 0);
  var r = irpefNetta(lordo, 0, gestione, f);
  return lordo - r.contributi - r.dovutoNetto;
}

/* ── DAL NETTO AL LORDO ───────────────────────────────────────────────────
   Il cliente sa quanto gli arriva sul conto; l'IRPEF si calcola sul lordo.
   Si inverte per bisezione la funzione VERA qui sopra, invece di gonfiare il
   netto di una percentuale a occhio: così il risparmio fiscale che il cliente
   vedrà in dichiarazione è quello che gli abbiamo mostrato, scaglioni,
   detrazioni e trattamento integrativo compresi.

   ATTENZIONE A UNA TRAPPOLA, che è quella che ha fregato il tentativo
   precedente: invertire una funzione torna sempre al punto di partenza,
   ANCHE QUANDO LA FUNZIONE È SBAGLIATA. Una prova che fa lordo → netto →
   lordo è verde comunque e non dimostra niente. Quello che va provato è il
   netto in sé, contro un caso calcolato a mano. Vedi irpef.test.mjs.

   ── DUE COSE CHE SEMBRANO OVVIE E SONO FALSE ──────────────────────────────
   Trovate dalle prove il 12/09/2026, e costate due bandiere rosse.

   1. «IL LORDO È SEMPRE MAGGIORE DEL NETTO.» No. Per un dipendente sotto i
      ~12.700 euro il netto è PIÙ ALTO del lordo: il trattamento integrativo
      (1.200 €) e la somma non imponibile della L. 207/2024 non sono sconti
      d'imposta, sono denaro che ENTRA, e superano contributi e IRPEF messi
      insieme. Partire la bisezione da `basso = netto` escludeva la soluzione
      vera: si cercava sopra, e la risposta stava sotto. Su un cliente da
      1.000 euro al mese il lordo usciva sbagliato, e con lui il risparmio
      fiscale calcolato su quel lordo. Adesso si parte da zero.

   2. «IL NETTO CRESCE SEMPRE COL LORDO.» No, e non è un dettaglio: ci sono
      tre gradini in cui il netto SCENDE mentre il lordo sale (intorno a
      9.300, 16.500 e 38.500 per un dipendente privato). Sono i salti del
      trattamento integrativo e delle detrazioni. Conseguenza pratica:
      esistono netti che NESSUN lordo produce. La bisezione si ferma al bordo
      del gradino, che è la risposta migliore disponibile, ma chi la usa deve
      sapere che lì l'inversione non è esatta — per questo c'è
      `inversioneNetto`, che restituisce anche lo scarto. Chiamare
      `lordoDaNetto` e stampare il numero senza guardare lo scarto vuol dire
      mostrare un lordo che non esiste. */
function inversioneNetto(nettoAnnuo, gestione, f) {
  var netto = Math.max(0, Number(nettoAnnuo) || 0);
  if (!netto) return { lordo: 0, netto: 0, scarto: 0, esatto: true };
  /* Estremo basso ZERO: vedi la nota 1. Estremo alto tre volte il netto più
     un margine fisso — nessuna gestione italiana trattiene due terzi del
     lordo, e il margine copre i redditi piccoli dove il rapporto è strano. */
  var basso = 0, alto = netto * 3 + 5000;
  /* Sessanta dimezzamenti portano l'intervallo sotto il miliardesimo di euro:
     è finito molto prima di diventare un problema di precisione. */
  for (var i = 0; i < 60; i++) {
    var mezzo = (basso + alto) / 2;
    if (nettoDaLordo(mezzo, gestione, f) < netto) basso = mezzo; else alto = mezzo;
  }
  var lordo = (basso + alto) / 2;
  var ottenuto = nettoDaLordo(lordo, gestione, f);
  var scarto = ottenuto - netto;
  return {
    lordo: lordo,
    netto: ottenuto,
    scarto: scarto,
    /* Un euro di tolleranza: sotto, l'inversione ha trovato il lordo vero;
       sopra, si è fermata sul bordo di un gradino e il netto chiesto non è
       raggiungibile da nessun lordo. */
    esatto: Math.abs(scarto) <= 1,
  };
}

function lordoDaNetto(nettoAnnuo, gestione, f) {
  return inversioneNetto(nettoAnnuo, gestione, f).lordo;
}

/* Tutto quello che in questo file è ancora in attesa di essere letto su un
   documento ufficiale. Chi produce un foglio per un cliente lo chiama e
   stampa quello che torna: è l'unico modo perché l'avviso arrivi davvero
   fino in fondo invece di fermarsi in un commento. */
function numeriFiscaliDaRiscontrare(f) {
  f = f || FISCO;
  var out = [];
  if (f.daVerificare && f.daRiscontrare) {
    for (var i = 0; i < f.daRiscontrare.length; i++) out.push(f.daRiscontrare[i]);
  }
  if (DETRAZIONE_PENSIONE.daRiscontrare) out.push('detrazione per redditi da pensione: ' + DETRAZIONE_PENSIONE.fonte);
  return out;
}

var API = {
  VERSIONE_REGOLE: VERSIONE_REGOLE,
  FISCO: FISCO,
  DETRAZIONE_PENSIONE: DETRAZIONE_PENSIONE,
  tronca4: tronca4,
  aliquotaMarginale: aliquotaMarginale,
  gestioneDi: gestioneDi,
  contributiObbligatori: contributiObbligatori,
  forbiceContributiva: forbiceContributiva,
  imponibileFiscale: imponibileFiscale,
  irpefLorda: irpefLorda,
  eDaLavoroAutonomo: eDaLavoroAutonomo,
  detrazioneLavoro: detrazioneLavoro,
  ulterioreDetrazione: ulterioreDetrazione,
  sommaNonImponibile: sommaNonImponibile,
  irpefNetta: irpefNetta,
  differenzeCanale: differenzeCanale,
  risparmioDaDeduzione: risparmioDaDeduzione,
  // Parte 2
  detrazionePensione: detrazionePensione,
  irpefSuPensione: irpefSuPensione,
  nettoDaLordo: nettoDaLordo,
  lordoDaNetto: lordoDaNetto,
  inversioneNetto: inversioneNetto,
  numeriFiscaliDaRiscontrare: numeriFiscaliDaRiscontrare,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Irpef = API;
})();
