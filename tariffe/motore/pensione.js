/* ═══════════════════════════════════════════════════════════════════════════
   PENSIONE — quattro campi, due minuti, una domanda sola.  (12/09/2026)

   ── COS'È E COSA NON È ────────────────────────────────────────────────────
   Non è un motore attuariale, ed è voluto. Risponde a una domanda:

       QUANTO TI MANCA, E CON QUANTO AL MESE LO COPRI.

   Quello che c'era prima simulava il montante contributivo anno per anno,
   proiettava i coefficienti di trasformazione, scontava l'inflazione. Era
   giusto per un'analisi a tavolino e sbagliato per una conversazione in piedi
   davanti a un cliente: chiedeva quindici numeri che nessuno ha in tasca e
   produceva un risultato che non si riesce a spiegare in due minuti.

   Qui si parte da quattro cose che una persona sa dire a memoria.

   ── LA COSA CHE RENDE QUESTO CONTO DIVERSO DA UN FOGLIO EXCEL ─────────────
   Un calcolo previdenziale sbagliato NON si vede. Non va in errore, non
   lascia una pagina bianca: stampa un numero credibile. Una persona guarda
   quel numero e decide quanto mettere da parte per i prossimi trent'anni.
   Semplificare il calcolo non rende quell'errore meno grave — lo rende più
   facile da commettere. Da qui discendono le tre regole di questo file.

   REGOLA 1 — NETTO CONTRO NETTO, E IL NETTO SI CALCOLA, NON SI STIMA.
   Il cliente ragiona sul netto: «prendo 1.800 al mese». Se si confronta quel
   netto con una pensione LORDA, il divario esce più largo del vero — comodo
   per vendere, indifendibile davanti a chiunque sappia leggere una busta
   paga. Ma anche il contrario è un errore: i tassi di sostituzione pubblicati
   (Ragioneria Generale dello Stato) sono LORDI, e applicarli a un netto
   sottostima l'assegno.
   Qui si fa l'unica cosa che regge: si lavora in lordo dove la tabella è
   lorda, e si scende al netto DUE VOLTE con il motore fiscale vero —
   una sul reddito da lavoro, una sulla pensione. Il tasso di sostituzione
   netto che si mostra al cliente non è un numero scelto: è il rapporto fra
   due netti calcolati. Vedi `tariffe/motore/irpef.js`.

   REGOLA 2 — IL VERSAMENTO SI CAPITALIZZA PER GLI ANNI CHE RESTANO.
   Non per la carriera. Chi comincia a cinquant'anni versa per diciassette
   anni, non per quaranta. È l'errore che fa uscire rendite doppie, e non si
   vede perché il numero resta credibile.

   REGOLA 3 — «CON 100 € AZZERI IL GAP» DEV'ESSERE VERO.
   L'importo che azzera si CALCOLA e si verifica ricalcolando. Una proposta
   che non copre quello che promette è la promessa che poi non si mantiene, e
   il cliente se ne accorge fra trent'anni quando non si può più rimediare.

   ── DA DOVE VENGONO I NUMERI ──────────────────────────────────────────────
   Tre sorgenti, e il risultato dice sempre quale:
     · LEGGE — tetto di deducibilità, tassazione della prestazione, IRPEF.
       Non si toccano. Stanno nella tabella «Parametri previdenziali» e qui
       c'è la copia di riserva per quando il server non risponde.
     · TARIFFA HDI — rendimento, costi, coefficiente di conversione in
       rendita. Riferimento: preventivatore online HDI (Azione di Previdenza,
       fondo aperto; Previdenza HDI, PIP albo COVIP n. 5007).
     · STIMA — la tabella dei tassi di sostituzione. È l'unica cosa davvero
       stimata di questo modulo, sta tutta in un posto solo ed è marcata.

   Quello che NON è stato letto su un documento ufficiale viaggia con
   l'avviso attaccato, fino al foglio che il cliente porta a casa. Non è
   prudenza formale: è la regola 3 del CODEX di questo progetto.

   Come gli altri motori di questa cartella, il file lo caricano DUE mondi: la
   pagina nel browser (<script src>) e Node (require) per le prove.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var VERSIONE = 'pensione-2026-09-12';

/* Il motore fiscale. Nel browser arriva da window, in Node da require: si
   prende quello che c'è. Senza, il modulo NON inventa un'imposta — dice che
   il risparmio fiscale non si può calcolare, e lo dice al cliente. */
var IRPEF = (typeof window !== 'undefined' && window.Irpef) ? window.Irpef
  : (typeof require === 'function' ? (function () { try { return require('./irpef.js'); } catch (e) { return null; } })() : null);

var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
var pos = function (v) { return Math.max(0, num(v)); };

/* ══ I NUMERI DI LEGGE ═══════════════════════════════════════════════════ */

var LEGGE = {
  /* Art. 8 c. 4 D.Lgs. 252/2005. Numero di legge, non ipotesi. */
  tettoDeducibilita: { v: 5164.57, etichetta: 'Tetto di deducibilità annuo', unita: '€',
    fonte: 'Art. 8 c. 4 D.Lgs. 252/2005', daConfermare: false },

  /* Art. 11 c. 6 D.Lgs. 252/2005: 15%, che scende dello 0,30% per ogni anno
     di partecipazione oltre il quindicesimo, con un minimo del 9%. */
  prestazioneBase:   { v: 0.15,  etichetta: 'Tassazione della prestazione', unita: '%',
    fonte: 'Art. 11 c. 6 D.Lgs. 252/2005', daConfermare: false },
  prestazioneSconto: { v: 0.003, etichetta: 'Sconto per ogni anno oltre il quindicesimo', unita: '%',
    fonte: 'Art. 11 c. 6 D.Lgs. 252/2005', daConfermare: false },
  prestazioneMinima: { v: 0.09,  etichetta: 'Tassazione minima della prestazione', unita: '%',
    fonte: 'Art. 11 c. 6 D.Lgs. 252/2005', daConfermare: false },

  /* Art. 17 c. 1 D.Lgs. 252/2005 (e art. 1 c. 92 L. 205/2017 per la quota in
     titoli di Stato, che qui non si distingue: si usa l'aliquota piena, che è
     la più prudente delle due). */
  impostaRendimenti: { v: 0.20, etichetta: 'Imposta sui rendimenti del fondo', unita: '%',
    fonte: 'Art. 17 c. 1 D.Lgs. 252/2005', daConfermare: false },

  /* L'età della pensione di vecchiaia. 67 anni è il requisito in vigore.
     NON SI PROIETTA QUI, e va detto: il requisito si adegua alla speranza di
     vita, quindi chi oggi ha trent'anni ci arriverà più tardi. Proiettarlo a
     occhio vorrebbe dire rimettere dentro la complicazione che questo modulo
     toglie; inventarlo sarebbe peggio. Quando la tabella «Parametri
     previdenziali» porta `requisiti_eta_proiettati`, il calcolo la usa e
     l'avviso si spegne da solo — vedi `numeriDiLegge()`. */
  etaPensione: { v: 67, etichetta: 'Età della pensione di vecchiaia', unita: 'anni',
    fonte: 'Art. 24 c. 6 D.L. 201/2011; requisito in vigore, NON proiettato all\'adeguamento futuro alla speranza di vita',
    daConfermare: false, nonProiettata: true },
};

/* ══ LA TARIFFA DEL FONDO ════════════════════════════════════════════════
   Riferimento: preventivatore online HDI.
     · Azione di Previdenza — fondo pensione aperto
     · Previdenza HDI — PIP, albo COVIP n. 5007
   I valori qui sotto sono SEGNAPOSTO. Finché restano, ogni risultato porta
   `daConfermare` e il foglio lo scrive in chiaro. Si sostituiscono con quelli
   letti sul preventivatore, sulla Nota informativa e sul Documento sul
   Regime Fiscale, e da quel momento il report si può consegnare. */
var FONDO = {
  rendimentoLordo: { v: 0.045, etichetta: 'Rendimento lordo annuo della gestione', unita: '%',
    fonte: 'Segnaposto — da leggere sul preventivatore HDI e sulla Nota informativa', daConfermare: true },
  costi: { v: 0.015, etichetta: 'Costi del fondo (ISC a 35 anni)', unita: '%',
    fonte: 'Segnaposto — da leggere sull\'ISC della Nota informativa HDI', daConfermare: true },
  coeffRendita: { v: 0.044, etichetta: 'Coefficiente di conversione in rendita', unita: '%',
    fonte: 'Segnaposto — da leggere sulle Condizioni generali HDI (base demografica della convenzione)', daConfermare: true },
};

/* ══ I TIPI DI LAVORO ════════════════════════════════════════════════════
   Tre voci, e servono a due cose insieme: al calcolo (che gestione
   previdenziale, quale tabella di tassi) e al CRM (che tipo di cliente è).
   Per questo la chiave è commerciale — «dipendente» — e la gestione fiscale
   è una colonna, non il nome. */
var LAVORI = {
  dipendente: {
    etichetta: 'Lavoratore dipendente',
    gestione: 'dipendenti_privati',
    haTfr: true,
    /* Il 33% di aliquota di computo è il motivo per cui il dipendente ha il
       tasso di sostituzione più alto dei tre. */
    nota: 'Aliquota di computo 33%: è la carriera che accumula di più.',
    affidabilita: 'buona',
  },
  autonomo: {
    etichetta: 'Lavoratore autonomo',
    /* Artigiani e commercianti stanno entrambi al 24% di computo; si prende
       artigiani, che è il caso senza addizionali. Chi ha davanti un
       commerciante trova uno scarto di mezzo punto sui contributi, che sul
       risparmio fiscale vale qualche euro. */
    gestione: 'artigiani',
    haTfr: false,
    nota: 'Aliquota di computo 24%: a parità di carriera accumula circa tre quarti di un dipendente.',
    affidabilita: 'buona',
  },
  professionista: {
    etichetta: 'Libero professionista',
    gestione: 'gs_professionisti',
    haTfr: false,
    /* IL CASO PIÙ VARIABILE DI TUTTI, e non per poco: chi ha una cassa
       privata (avvocati, medici, ingegneri, commercialisti) segue il
       regolamento della sua cassa, che può essere retributivo, reddituale o
       contributivo. Un numero solo per tutti è per forza approssimativo, e va
       detto AL CLIENTE, non solo in un commento. */
    nota: 'Con cassa privata il calcolo dipende dal regolamento della singola cassa: questa è la stima meno affidabile delle tre.',
    affidabilita: 'bassa',
  },
};

/* ══ LA TABELLA CHE DECIDE TUTTO ═════════════════════════════════════════
   Tasso di sostituzione LORDO: pensione lorda al primo anno / ultimo reddito
   lordo. Per anni di contribuzione maturati al pensionamento.

   PERCHÉ LORDO E NON NETTO. Perché il lordo è il numero che si può citare:
   è la forma in cui la Ragioneria Generale dello Stato pubblica le sue
   previsioni. Il netto lo calcola questo modulo applicando l'IRPEF vera alle
   due grandezze — reddito e pensione — e viene fuori PIÙ ALTO del lordo,
   perché sulla pensione non si versano contributi. Una tabella «già netta»
   avrebbe nascosto quel passaggio dentro un numero non verificabile: era
   comodo, e non si sarebbe potuto difendere davanti a nessuno.

   COME SI CORREGGE. Si tocca una riga qui. `anni` è la soglia minima: si
   scende finché non si trova la prima soglia raggiunta, senza interpolare —
   mezzo punto di interpolazione non aggiunge precisione a una stima di
   questo tipo, e una tabella a scalini la legge anche chi la deve correggere.

   MARCATA DA CONFERMARE, tutta. Sono ordini di grandezza del regime
   contributivo, non numeri di legge. Finché la bandiera è accesa il foglio lo
   scrive. */
var TASSI_LORDI = {
  daConfermare: true,
  fonte: 'Ordini di grandezza del regime contributivo. DA CONFERMARE sul Rapporto della Ragioneria Generale dello Stato «Le tendenze di medio-lungo periodo del sistema pensionistico italiano» prima di consegnare un foglio a un cliente.',
  tavole: {
    dipendente:     [{ anni: 40, tasso: 0.70 }, { anni: 35, tasso: 0.61 }, { anni: 30, tasso: 0.52 }, { anni: 25, tasso: 0.44 }, { anni: 0, tasso: 0.35 }],
    autonomo:       [{ anni: 40, tasso: 0.51 }, { anni: 35, tasso: 0.45 }, { anni: 30, tasso: 0.38 }, { anni: 25, tasso: 0.32 }, { anni: 0, tasso: 0.25 }],
    professionista: [{ anni: 40, tasso: 0.50 }, { anni: 35, tasso: 0.43 }, { anni: 30, tasso: 0.37 }, { anni: 25, tasso: 0.31 }, { anni: 0, tasso: 0.24 }],
  },
};

/* SE NON SI SA QUANDO HA COMINCIATO A LAVORARE.
   Si assume un inizio TARDIVO: meno anni di contributi, pensione più bassa,
   divario più largo. È lo scenario peggiore, ed è una scelta precisa —
   sbagliare per eccesso di prudenza lascia il cliente con più soldi di quelli
   che servivano; sbagliare nell'altro verso lo lascia scoperto. Ma va marcato
   OVUNQUE, schermata e PDF: un numero prudenziale spacciato per stima è un
   numero falso. 30 anni: studi lunghi e primi anni discontinui. */
var ETA_INIZIO_PRUDENZIALE = 30;

/* ══ CARRIERA ════════════════════════════════════════════════════════════ */

/* L'età dalla data di nascita. La scheda cliente ce l'ha: chiederla di nuovo
   sarebbe una domanda in più su quattro, cioè un quarto del flusso. */
function etaDaNascita(dataNascita, oggi) {
  if (!dataNascita) return null;
  var d = (dataNascita instanceof Date) ? dataNascita : new Date(String(dataNascita));
  if (isNaN(d.getTime())) return null;
  var o = oggi ? new Date(oggi) : new Date();
  var anni = o.getFullYear() - d.getFullYear();
  var m = o.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && o.getDate() < d.getDate())) anni--;
  return (anni >= 0 && anni < 120) ? anni : null;
}

/* Quanti anni di contributi avrà AL PENSIONAMENTO — non quanti ne ha adesso.
   È quello che determina l'assegno, ed è la distinzione che salta per prima
   quando si semplifica. */
function carriera(dati, etaPensione) {
  var eta = pos(dati && dati.eta);
  var pens = pos(etaPensione) || LEGGE.etaPensione.v;
  var grezza = (dati && dati.etaInizioLavoro != null && dati.etaInizioLavoro !== '')
    ? pos(dati.etaInizioLavoro) : null;
  var prudenziale = (grezza === null);
  var inizio = prudenziale ? ETA_INIZIO_PRUDENZIALE : grezza;
  /* Chi avrebbe cominciato DOPO l'età che dichiara oggi non è un caso da
     arrotondare: è un dato sbagliato, e un dato sbagliato si tratta come
     un dato mancante — scenario prudenziale, e marcato. */
  var incoerente = !prudenziale && inizio > eta;
  if (incoerente) { inizio = ETA_INIZIO_PRUDENZIALE; prudenziale = true; }
  return {
    anniContributi: Math.max(0, pens - inizio),
    anniAllaPensione: Math.max(0, pens - eta),
    etaInizioUsata: inizio,
    etaPensione: pens,
    prudenziale: prudenziale,
    datoIncoerente: incoerente,
  };
}

function tassoLordo(lavoro, anni, tab) {
  var t = tab || TASSI_LORDI;
  var tavola = t.tavole[lavoro] || t.tavole.dipendente;
  for (var i = 0; i < tavola.length; i++) if (num(anni) >= tavola[i].anni) return tavola[i].tasso;
  return tavola[tavola.length - 1].tasso;
}

/* ══ IL FONDO ════════════════════════════════════════════════════════════ */

function rendimentoNetto(par) {
  var p = par || FONDO;
  return (num(p.rendimentoLordo.v) - num(p.costi.v)) * (1 - num(LEGGE.impostaRendimenti.v));
}

/* Art. 11 c. 6 D.Lgs. 252/2005: 15% meno 0,30% per ogni anno oltre il
   quindicesimo, minimo 9%. */
function aliquotaPrestazione(anniPartecipazione) {
  var oltre = Math.max(0, num(anniPartecipazione) - 15);
  return Math.max(LEGGE.prestazioneMinima.v, LEGGE.prestazioneBase.v - LEGGE.prestazioneSconto.v * oltre);
}

/* Il montante al pensionamento, e la rendita che ne esce.

   I VERSAMENTI DELL'ANNO SI CAPITALIZZANO PER MEZZO ANNO, non per uno intero.
   Chi versa cento euro a dicembre non ha guadagnato un anno di rendimento su
   quei cento euro. Accreditare l'anno pieno su tutti i dodici versamenti
   gonfia il montante di circa metà del rendimento annuo, ogni anno, per
   trent'anni: su una proiezione lunga non è un dettaglio. La convenzione di
   metà anno è la semplificazione standard, ed è quella che sbaglia per
   difetto — che è il verso giusto in cui sbagliare. */
function montanteFondo(versamentoMensile, anni, par) {
  var v = pos(versamentoMensile), n = Math.floor(pos(anni));
  var r = rendimentoNetto(par);
  var mezzoAnno = Math.pow(1 + r, 0.5);
  var m = 0;
  for (var a = 0; a < n; a++) m = m * (1 + r) + v * 12 * mezzoAnno;
  return m;
}

/* La rendita mensile, LORDA e NETTA. La rendita del fondo è tassata con
   l'imposta sostitutiva della prestazione — non con l'IRPEF — e la si mostra
   netta, perché è netta che il cliente la confronta con il suo stipendio.

   Semplificazione DICHIARATA: l'aliquota si applica a tutta la rendita. In
   realtà colpisce solo la parte non già tassata (i rendimenti hanno già
   pagato il 20% in accumulo). Applicarla a tutto sottostima la rendita netta:
   di nuovo, l'errore sta dal lato prudente. */
function renditaFondo(versamentoMensile, anniAllaPensione, anniPartecipazione, par) {
  var m = montanteFondo(versamentoMensile, anniAllaPensione, par);
  var p = par || FONDO;
  var lordaAnnua = m * num(p.coeffRendita.v);
  var aliq = aliquotaPrestazione(anniPartecipazione != null ? anniPartecipazione : anniAllaPensione);
  return {
    montante: m,
    versatoTotale: pos(versamentoMensile) * 12 * Math.floor(pos(anniAllaPensione)),
    renditaMensileLorda: lordaAnnua / 12,
    renditaMensileNetta: (lordaAnnua * (1 - aliq)) / 12,
    aliquotaPrestazione: aliq,
    rendimentoNetto: rendimentoNetto(par),
  };
}

/* ══ LE PROPOSTE ═════════════════════════════════════════════════════════
   «Con 20 euro sei ancora lontano, con 50 ti avvicini, con 100 azzeri.»
   Le prime tre cifre sono fisse e riconoscibili — un caffè al giorno, una
   cena, una rata piccola — e non si scelgono per fare effetto: si mostrano
   sempre le stesse e si dice la verità su cosa coprono.

   La quarta è quella che AZZERA, e si calcola. La rendita è lineare nel
   versamento (il montante lo è, e il coefficiente è una moltiplicazione),
   quindi basta una proporzione — ma poi SI RICALCOLA e si verifica che copra
   davvero, perché una proporzione su una funzione che qualcuno domani rende
   non lineare resterebbe verde mentendo. */
function proposte(gapMensile, anniAllaPensione, redditoNettoMensile, par) {
  var gap = pos(gapMensile);
  var reddito = pos(redditoNettoMensile);
  var tetto = LEGGE.tettoDeducibilita.v / 12;

  var voce = function (v, extra) {
    var r = renditaFondo(v, anniAllaPensione, anniAllaPensione, par);
    var o = {
      versamentoMensile: v,
      renditaMensileNetta: r.renditaMensileNetta,
      coperturaGap: gap > 0 ? Math.min(1, r.renditaMensileNetta / gap) : 1,
      azzera: r.renditaMensileNetta >= gap - 0.005,
      /* OLTRE IL TETTO NON SI DEDUCE PIÙ. 5.164,57 l'anno fanno 430,38 al
         mese: da lì in su ogni euro versato non porta più risparmio fiscale.
         Dire «servono 710 al mese» senza dirlo fa sembrare il fondo molto
         meno conveniente di quello che è. */
      oltreIlTettoDeducibile: v > tetto,
    };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  };

  var out = [voce(20), voce(50), voce(100)];

  if (gap > 0) {
    var unitaria = renditaFondo(1, anniAllaPensione, anniAllaPensione, par).renditaMensileNetta;
    if (unitaria > 0) {
      var serve = Math.ceil((gap / unitaria) / 5) * 5;   // arrotondato ai 5 euro
      /* LA VERIFICA. Non si annuncia «azzeri» su una proporzione: si ricalcola
         e, se per l'arrotondamento manca ancora qualcosa, si sale. */
      var giri = 0;
      while (renditaFondo(serve, anniAllaPensione, anniAllaPensione, par).renditaMensileNetta < gap && giri < 100) {
        serve += 5; giri++;
      }
      var gia = out.some(function (p) { return p.versamentoMensile === serve; });
      if (!gia) {
        out.push(voce(serve, {
          eQuelloCheAzzera: true,
          /* Quando l'importo che azzera è fuori scala rispetto a quello che la
             persona porta a casa, annunciarlo e basta non serve a niente: è un
             muro, non una proposta. Si segnala, e la schermata cambia discorso
             — coprire una parte invece di azzerare. */
          fuoriPortata: reddito > 0 && serve > reddito * 0.20,
        }));
      } else {
        for (var i = 0; i < out.length; i++) if (out[i].versamentoMensile === serve) out[i].eQuelloCheAzzera = true;
      }
    }
  }

  return out.sort(function (a, b) { return a.versamentoMensile - b.versamentoMensile; });
}

/* ══ IL RISPARMIO FISCALE ════════════════════════════════════════════════
   Passa dal motore fiscale vero, e non da una percentuale. Il motivo sta
   scritto in cima a irpef.js e vale la pena ripeterlo qui, perché è il punto
   in cui un modulo commerciale può fare un danno vero:

     dedurre abbassa l'imponibile, l'imposta lorda scende, e sotto una certa
     soglia il TRATTAMENTO INTEGRATIVO non spetta più. Il risparmio diventa
     NEGATIVO: versare costa più del versamento. Chi mostra «aliquota per
     importo dedotto» quel caso non lo vede, e in quel caso sta vendendo un
     danno chiamandolo vantaggio.

   Senza motore fiscale NON si inventa un numero: si dice che non c'è. */
function risparmioFiscale(lordoAnnuo, versamentoMensile, gestione) {
  if (!IRPEF || typeof IRPEF.risparmioDaDeduzione !== 'function') {
    return { disponibile: false, perche: 'Il motore fiscale non è caricato: il risparmio fiscale non è stato calcolato.' };
  }
  var tetto = LEGGE.tettoDeducibilita.v;
  var versatoAnnuo = pos(versamentoMensile) * 12;
  var dedotto = Math.min(versatoAnnuo, tetto);
  var r = IRPEF.risparmioDaDeduzione(pos(lordoAnnuo), dedotto, gestione);
  return {
    disponibile: true,
    versatoAnnuo: versatoAnnuo,
    dedotto: dedotto,
    tetto: tetto,
    oltreIlTetto: versatoAnnuo > tetto,
    eccedenza: Math.max(0, versatoAnnuo - tetto),
    risparmioAnnuo: r.risparmio,
    risparmioMensile: r.risparmio / 12,
    /* Quanto rende OGNI EURO dedotto. Non coincide con l'aliquota di
       scaglione, ed è esattamente il punto. */
    aliquotaEffettiva: r.aliquotaEffettiva,
    perdeIlTrattamentoIntegrativo: r.perdeIlTrattamentoIntegrativo,
    impostaAzzerata: r.impostaAzzerata,
    /* Un risparmio negativo NON si mostra come risparmio. Chi consuma questo
       risultato deve trovare la bandiera, non doverla dedurre dal segno. */
    inPerdita: r.risparmio < 0,
  };
}

/* ══ IL CALCOLO, TUTTO INTERO ════════════════════════════════════════════ */

function calcola(dati) {
  dati = dati || {};
  var lavoro = LAVORI[dati.lavoro] ? dati.lavoro : 'dipendente';
  var L = LAVORI[lavoro];

  /* L'età: dalla data di nascita se c'è (la scheda cliente ce l'ha), dal
     campo altrimenti. */
  var eta = pos(dati.eta) || etaDaNascita(dati.dataNascita) || 0;
  var car = carriera({ eta: eta, etaInizioLavoro: dati.etaInizioLavoro }, LEGGE.etaPensione.v);

  /* ── DAL REDDITO DICHIARATO AL LORDO E AL NETTO ────────────────────────
     Il consulente può avere in mano una busta paga (lordo) o la parola del
     cliente (netto). Si accettano tutti e due e si dichiara quale: sbagliare
     base qui sposta il risultato del 25-30%, e sarebbe l'errore muto più
     costoso di tutto il modulo. */
  var base = (dati.baseReddito === 'lordo') ? 'lordo' : 'netto';
  var mensileDichiarato = pos(dati.redditoMensile);
  var lordoAnnuo, nettoAnnuo, fiscoDisponibile = !!(IRPEF && IRPEF.lordoDaNetto);

  if (!fiscoDisponibile) {
    /* Senza motore fiscale non si converte: si tiene quello che è stato
       dichiarato su entrambi i lati e si dice che manca il conto. */
    lordoAnnuo = mensileDichiarato * 12;
    nettoAnnuo = mensileDichiarato * 12;
  } else if (base === 'lordo') {
    lordoAnnuo = mensileDichiarato * 12;
    nettoAnnuo = IRPEF.nettoDaLordo(lordoAnnuo, L.gestione);
  } else {
    nettoAnnuo = mensileDichiarato * 12;
    lordoAnnuo = IRPEF.lordoDaNetto(nettoAnnuo, L.gestione);
  }

  /* ── LA PENSIONE PUBBLICA ──────────────────────────────────────────────
     Tabella lorda sul lordo, poi IRPEF sulla pensione per arrivare al netto.
     Il tasso che si mostra al cliente è il rapporto fra i due netti: un
     numero derivato, non scelto. */
  var tLordo = tassoLordo(lavoro, car.anniContributi);
  var pensioneLordaAnnua = lordoAnnuo * tLordo;
  var pensioneNettaAnnua = fiscoDisponibile
    ? IRPEF.irpefSuPensione(pensioneLordaAnnua).netto
    : pensioneLordaAnnua;
  var tassoNetto = nettoAnnuo > 0 ? pensioneNettaAnnua / nettoAnnuo : 0;

  /* ── IL FONDO ──────────────────────────────────────────────────────────
     Si capitalizza per gli anni che RESTANO (regola 2). */
  var versamento = pos(dati.versamentoMensile);
  var fondo = renditaFondo(versamento, car.anniAllaPensione, car.anniAllaPensione, FONDO);

  var nettoMensile = nettoAnnuo / 12;
  var pensioneMensile = pensioneNettaAnnua / 12;
  var totaleMensile = pensioneMensile + fondo.renditaMensileNetta;
  var gap = Math.max(0, nettoMensile - totaleMensile);

  var fiscale = risparmioFiscale(lordoAnnuo, versamento, L.gestione);

  return {
    versione: VERSIONE,

    // ── quello che è stato chiesto
    lavoro: lavoro,
    etichettaLavoro: L.etichetta,
    notaLavoro: L.nota,
    affidabilita: L.affidabilita,
    gestione: L.gestione,
    eta: eta,
    baseReddito: base,
    redditoMensileDichiarato: mensileDichiarato,
    versamentoMensile: versamento,

    // ── la carriera
    anniContributi: car.anniContributi,
    anniAllaPensione: car.anniAllaPensione,
    etaPensione: car.etaPensione,
    etaInizioUsata: car.etaInizioUsata,
    /* Se l'età di inizio non c'era (o era incoerente) TUTTO il risultato è
       prudenziale, e va detto ovunque compaia — schermata e PDF. */
    prudenziale: car.prudenziale,
    datoIncoerente: car.datoIncoerente,

    // ── il reddito, nelle due forme
    lordoAnnuo: lordoAnnuo,
    nettoAnnuo: nettoAnnuo,
    redditoNettoMensile: nettoMensile,
    redditoLordoMensile: lordoAnnuo / 12,

    // ── la pensione pubblica
    tassoSostituzioneLordo: tLordo,
    tassoSostituzioneNetto: tassoNetto,
    pensioneLordaMensile: pensioneLordaAnnua / 12,
    pensioneNettaMensile: pensioneMensile,

    // ── il fondo
    fondo: fondo,

    // ── il divario
    totaleMensile: totaleMensile,
    gapMensile: gap,
    gapPercentuale: nettoMensile > 0 ? gap / nettoMensile : 0,
    proposte: proposte(gap, car.anniAllaPensione, nettoMensile, FONDO),

    // ── il fisco
    fiscale: fiscale,

    // ── il TFR: solo chi ce l'ha
    mostraTfr: L.haTfr,

    daConfermare: daConfermare(),
  };
}

/* ══ QUELLO CHE NON È ANCORA CONFERMATO ══════════════════════════════════
   Una lista sola, e la schermata e il report la stampano tutta. Se questa
   funzione torna vuota il foglio si può consegnare; finché torna qualcosa,
   no — e chi firma deve saperlo prima, non dopo. */
function daConfermare() {
  var out = [];
  var guarda = function (tab, gruppo) {
    for (var k in tab) {
      if (!Object.prototype.hasOwnProperty.call(tab, k)) continue;
      if (tab[k] && tab[k].daConfermare) out.push({ gruppo: gruppo, etichetta: tab[k].etichetta, fonte: tab[k].fonte });
    }
  };
  guarda(FONDO, 'Tariffa HDI');
  guarda(LEGGE, 'Numeri di legge');
  if (TASSI_LORDI.daConfermare) {
    out.push({ gruppo: 'Stima', etichetta: 'Tabella dei tassi di sostituzione', fonte: TASSI_LORDI.fonte });
  }
  if (LEGGE.etaPensione.nonProiettata) {
    out.push({ gruppo: 'Numeri di legge', etichetta: 'Età della pensione non proiettata',
      fonte: 'Il requisito si adegua alla speranza di vita: chi è lontano dalla pensione ci arriverà più tardi di ' + LEGGE.etaPensione.v + ' anni.' });
  }
  if (IRPEF && typeof IRPEF.numeriFiscaliDaRiscontrare === 'function') {
    var f = IRPEF.numeriFiscaliDaRiscontrare();
    for (var i = 0; i < f.length; i++) out.push({ gruppo: 'Fisco', etichetta: 'Da riscontrare sull\'originale', fonte: f[i] });
  }
  return out;
}

/* ══ I NUMERI DALLA TABELLA «PARAMETRI PREVIDENZIALI» ════════════════════
   La copia buona sta nel database, questa qui dentro è la riserva per quando
   il server non risponde. La schermata legge la tabella all'apertura e passa
   di qui: così quando a novembre esce il decreto nuovo si tocca una riga in
   tabella, non il codice.

   Un valore che arriva dall'archivio con la sua fonte NON è più «da
   confermare» — a meno che la riga stessa non si dichiari provvisoria
   (`__daConfermare`), che è il caso del coefficiente di rendita finché non
   arriva la Nota informativa. Spegnere la bandiera lì vorrebbe dire perdere
   l'unico avviso che arriva fino al foglio del cliente. */
function numeriDiLegge(par) {
  var applicati = [], ignorati = [];
  if (!par || typeof par !== 'object') return { applicati: applicati, ignorati: ['nessun parametro ricevuto'] };

  var provvisorio = function (chiaveTabella) {
    return !!(par.__daConfermare && par.__daConfermare[chiaveTabella] === true);
  };
  var fonteDi = function (chiaveTabella) {
    var s = par.__fonti && par.__fonti[chiaveTabella];
    return s ? ('Parametri previdenziali · ' + s) : 'Parametri previdenziali';
  };
  var metti = function (tab, chiave, valore, chiaveTabella) {
    if (valore === null || valore === undefined || !isFinite(Number(valore))) { ignorati.push(chiave); return; }
    if (!tab[chiave]) { ignorati.push(chiave); return; }
    tab[chiave].v = Number(valore);
    tab[chiave].fonte = fonteDi(chiaveTabella);
    tab[chiave].daConfermare = provvisorio(chiaveTabella);
    applicati.push(chiave);
  };

  if (par.tetto_deducibilita != null) metti(LEGGE, 'tettoDeducibilita', par.tetto_deducibilita, 'tetto_deducibilita');
  if (par.tassazione_rendimenti != null) metti(LEGGE, 'impostaRendimenti', par.tassazione_rendimenti, 'tassazione_rendimenti');

  var tp = par.tassazione_prestazione;
  if (tp && typeof tp === 'object') {
    metti(LEGGE, 'prestazioneBase', tp.aliquotaBase, 'tassazione_prestazione');
    metti(LEGGE, 'prestazioneSconto', tp.riduzionePerAnno, 'tassazione_prestazione');
    metti(LEGGE, 'prestazioneMinima', tp.aliquotaMinima, 'tassazione_prestazione');
  }

  /* Il coefficiente della convenzione del fondo. Non è un numero di legge, ma
     sta nella stessa tabella perché è lì che si tengono fonte e data. */
  if (par.coefficiente_rendita_fondo != null) {
    var c = par.coefficiente_rendita_fondo;
    metti(FONDO, 'coeffRendita', (c && typeof c === 'object') ? (c.coefficiente != null ? c.coefficiente : c.v) : c, 'coefficiente_rendita_fondo');
  }

  /* I REQUISITI DI ETÀ PROIETTATI. Se la tabella li porta, l'età della
     pensione smette di essere «67 e non proiettata» e diventa il requisito
     dell'anno in cui la persona ci arriva. L'avviso si spegne da solo: è
     l'unico modo perché spegnerlo significhi che qualcuno ha messo il dato,
     e non che qualcuno ha tolto la bandiera. */
  if (par.requisiti_eta_proiettati && typeof par.requisiti_eta_proiettati === 'object') {
    REQUISITI_PROIETTATI = par.requisiti_eta_proiettati;
    applicati.push('requisiti_eta_proiettati');
  }

  return { applicati: applicati, ignorati: ignorati };
}

var REQUISITI_PROIETTATI = null;

/* L'età della pensione per chi ci arriva in un certo anno. Senza tabella si
   dice il requisito di oggi e si tiene acceso l'avviso. */
function etaPensioneAll(anno) {
  if (!REQUISITI_PROIETTATI) return { eta: LEGGE.etaPensione.v, proiettata: false };
  var v = REQUISITI_PROIETTATI[String(anno)];
  if (v === undefined || v === null || !isFinite(Number(v))) return { eta: LEGGE.etaPensione.v, proiettata: false };
  return { eta: Number(v), proiettata: true };
}

/* ══ IL CONFRONTO TFR ════════════════════════════════════════════════════
   Pro e contro affiancati, NON una raccomandazione. La scelta sul TFR è del
   lavoratore e dipende da cose che in questo foglio non ci sono — quanto è
   solido il datore, se ha in programma una casa, quanto dorme la notte con i
   mercati. Un consulente che qui consiglia sta esondando.

   Solo per i dipendenti: sono gli unici ad avere un TFR.

   DA VERIFICARE CON HDI prima di pubblicare: i valori di tassazione e
   rivalutazione contro il Documento sul Regime Fiscale, e le anticipazioni
   contro il Documento sulle Anticipazioni, entrambi sul sito HDI. */
var TFR = {
  daVerificare: 'Tassazione, rivalutazione e anticipazioni: da riscontrare sul Documento sul Regime Fiscale e sul Documento sulle Anticipazioni pubblicati da HDI.',
  righe: [
    {
      voce: 'Tassazione',
      azienda: 'Tassazione separata, con l\'aliquota media IRPEF degli ultimi cinque anni: tipicamente sopra il 20%.',
      fondo: 'Il 15%, che scende dello 0,30% per ogni anno di partecipazione oltre il quindicesimo, fino a un minimo del 9% (art. 11 c. 6 D.Lgs. 252/2005).',
      aChiConviene: 'fondo',
    },
    {
      voce: 'Rivalutazione',
      azienda: '1,5% fisso all\'anno più il 75% dell\'inflazione. È certa, non dipende dai mercati — e quando l\'inflazione è bassa è poca cosa.',
      fondo: 'Il rendimento della linea scelta. Non è garantito, salvo le linee garantite — che in cambio rendono meno.',
      aChiConviene: 'dipende',
    },
    {
      voce: 'Contributo del datore di lavoro',
      azienda: 'Nessuno: lasciando il TFR in azienda il contributo del datore non spetta, anche quando il contratto lo prevede.',
      fondo: 'Previsto da molti contratti collettivi, ma SOLO se si aderisce al fondo. È denaro che altrimenti non si prende affatto.',
      aChiConviene: 'fondo',
    },
    {
      voce: 'Anticipazioni',
      azienda: 'Molto limitate: servono otto anni di anzianità, i casi sono stretti e il datore può contingentarle.',
      fondo: 'Fino al 75% per spese sanitarie gravi, in qualsiasi momento. Fino al 75% per la prima casa e fino al 30% per altre esigenze, dopo otto anni di partecipazione.',
      aChiConviene: 'fondo',
    },
    {
      voce: 'Se l\'azienda fallisce',
      azienda: 'Interviene il Fondo di Garanzia INPS, ma con i tempi e le procedure di un\'insolvenza.',
      fondo: 'Il patrimonio del fondo è separato da quello dell\'azienda e da quello della compagnia: non risponde dei loro debiti.',
      aChiConviene: 'fondo',
    },
    {
      voce: 'Flessibilità',
      azienda: 'Resta dov\'è. Nessuna scelta da fare, nessun rischio di mercato.',
      fondo: 'La scelta di conferire il TFR al fondo NON si torna indietro: il TFR già versato resta lì. Si può cambiare linea di investimento, non riportarlo in azienda.',
      aChiConviene: 'azienda',
    },
  ],

  /* ── QUANDO POSSO PRENDERE PRIMA I MIEI SOLDI ─────────────────────────
     L'obiezione numero uno, e va mostrata su TUTTE E DUE le colonne e sul
     foglio stampato. Se la si lascia fuori il cliente ci pensa lo stesso —
     solo senza risposta, e a quel punto la risposta se la dà da solo. */
  quandoLiRiprendo: {
    titolo: 'Quando posso prendere prima i miei soldi',
    fonte: 'Artt. 11 e 14 D.Lgs. 252/2005. La disciplina è la stessa per fondi negoziali, fondi aperti e PIP.',
    azienda: [
      'Alla fine del rapporto di lavoro si riscuote tutto, qualunque sia il motivo della cessazione.',
      'Prima, solo nei casi di anticipazione previsti dalla legge e dopo otto anni di servizio: spese sanitarie straordinarie (fino al 70%) e acquisto della prima casa per sé o per i figli (fino al 70%).',
      'Il datore può limitare le anticipazioni al 10% degli aventi diritto e al 4% dei dipendenti: non è un diritto che si esercita quando si vuole.',
    ],
    fondo: [
      'Spese sanitarie gravissime per sé, il coniuge o i figli: fino al 75%, IN QUALSIASI MOMENTO, senza aspettare nessuna anzianità.',
      'Prima casa per sé o per i figli: fino al 75%, dopo otto anni di partecipazione.',
      'Altre esigenze, senza doverle motivare: fino al 30%, dopo otto anni di partecipazione.',
      'Perdita del lavoro: il 50% dopo 12 mesi di inoccupazione, il 100% dopo 48 mesi.',
      'Invalidità permanente che riduce a meno di un terzo la capacità di lavoro: 100%, subito.',
      'Dimissioni volontarie: il riscatto totale è possibile, ma solo dopo il periodo di attesa previsto — non è immediato come la fine di un rapporto in azienda.',
    ],
    /* Quello che cambia da compagnia a compagnia NON è la disciplina: sono i
       TEMPI MATERIALI di liquidazione. E quelli non si scrivono su un foglio
       che va a un cliente finché non li conferma HDI. */
    daVerificare: 'Tempi e condizioni reali di liquidazione in caso di LICENZIAMENTO rispetto alle DIMISSIONI: da confermare con HDI prima di dirlo a un cliente.',
  },
};

/* ══ IL DISCLAIMER ═══════════════════════════════════════════════════════
   Obbligatorio sul foglio. Non è una formalità: senza, una proiezione diventa
   una promessa, e una promessa su trent'anni non la può fare nessuno. */
function disclaimer(esito) {
  var e = esito || {};
  var t = 'Proiezione a scopo illustrativo, basata su ipotesi e parametri attuali. ' +
    'NON è una promessa di rendimento né una previsione dell\'assegno INPS effettivo: ' +
    'i valori cambiano al variare dei parametri, delle norme, dei rendimenti dei mercati e della carriera lavorativa.';
  if (e.prudenziale) {
    t += ' STIMA PRUDENZIALE: l\'età di inizio dell\'attività lavorativa non è stata indicata' +
      (e.datoIncoerente ? ' in modo utilizzabile' : '') +
      ', e il calcolo usa uno scenario peggiorativo (inizio a ' + ETA_INIZIO_PRUDENZIALE + ' anni). ' +
      'Ne risultano una pensione più bassa e un divario più ampio di quelli probabili.';
  }
  if (e.affidabilita === 'bassa') {
    t += ' Per i liberi professionisti con cassa privata il calcolo dipende dal regolamento della singola cassa: questa stima è indicativa più delle altre.';
  }
  t += ' L\'età della pensione usata è ' + (e.etaPensione || LEGGE.etaPensione.v) + ' anni' +
    (LEGGE.etaPensione.nonProiettata ? ', senza proiettare l\'adeguamento futuro alla speranza di vita' : '') + '.';
  t += ' Gli importi sono espressi in euro di oggi e non tengono conto delle addizionali regionali e comunali.';
  return t;
}

var API = {
  VERSIONE: VERSIONE,
  LEGGE: LEGGE,
  FONDO: FONDO,
  LAVORI: LAVORI,
  TASSI_LORDI: TASSI_LORDI,
  TFR: TFR,
  ETA_INIZIO_PRUDENZIALE: ETA_INIZIO_PRUDENZIALE,
  etaDaNascita: etaDaNascita,
  carriera: carriera,
  tassoLordo: tassoLordo,
  rendimentoNetto: rendimentoNetto,
  aliquotaPrestazione: aliquotaPrestazione,
  montanteFondo: montanteFondo,
  renditaFondo: renditaFondo,
  proposte: proposte,
  risparmioFiscale: risparmioFiscale,
  calcola: calcola,
  daConfermare: daConfermare,
  numeriDiLegge: numeriDiLegge,
  etaPensioneAll: etaPensioneAll,
  disclaimer: disclaimer,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Pensione = API;
})();
