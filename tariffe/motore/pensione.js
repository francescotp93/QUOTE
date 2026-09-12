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

   ── ATTENZIONE AL NOME: ESISTE UN ALTRO `pensione.js` ─────────────────────
   `server/pensione.js` e' un terzo motore previdenziale, server-side, in ESM
   puro, con 63 prove sue in `server/pensione.test.mjs`. Al 12/09/2026 NON LO
   CHIAMA NESSUNO: l'unico posto del repository che lo nomina e' un commento
   dentro index.html. E' stato trovato mentre si scriveva questo file, ed e'
   stato lasciato dov'era — non era fra le cose da sostituire, e cancellare
   32 KB di codice corretto senza chiederlo sarebbe una decisione di
   qualcun altro.

   NON SI COLLEGANO. Quello e' ESM con import/export e gira solo in Node;
   questo deve girare anche nel browser con un <script src>, e in questa
   cartella non c'e' compilazione. Farli parlare vorrebbe dire introdurre un
   passo di build, che questo repository ha scelto di non avere.

   Se un giorno serve un'API previdenziale lato server, quello e' il posto
   giusto da cui ripartire. Se non serve, va cancellato insieme alle sue
   prove: una suite verde sopra codice che non chiama nessuno tiene occupato
   chi la legge e non protegge niente.
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
  /* QUALE PRODOTTO SONO QUESTI NUMERI. Senza il nome attaccato, «confermare
     la tariffa con HDI» non vuol dire niente: i due prodotti hanno costi
     diversi, e un ISC diverso sposta il montante di parecchio su trent'anni.
     Il riferimento e' il fondo APERTO; il PIP e' l'alternativa, e quando si
     quota quello i tre numeri qui sotto vanno rifatti, non riusati. */
  prodotto: {
    etichetta: 'Azione di Previdenza — fondo pensione aperto HDI',
    alternativa: 'Previdenza HDI — PIP, albo COVIP n. 5007',
    fonte: 'Preventivatore online HDI. I costi del PIP sono diversi da quelli del fondo aperto: cambiando prodotto i parametri qui sotto vanno rifatti.',
  },
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
/* ATTENZIONE AL DIVARIO CHE SI PASSA QUI, ed è l'errore che le prove hanno
   trovato il 12/09/2026 dopo che tutto sembrava a posto.

   Le proposte sono versamenti TOTALI ALTERNATIVI — «e se invece mettessi
   100?» — non aggiunte a quello che uno versa già. Quindi vanno misurate sul
   divario che c'è SENZA fondo: reddito meno pensione pubblica, e basta.

   Misurandole sul divario che già sconta la rendita del versamento attuale,
   succede questo: a un cliente che versa 20 euro il modulo diceva «con 295
   azzeri», e mettendo davvero 295 ne restavano scoperti 31 — esattamente la
   rendita dei 20 euro, contata due volte. Il numero restava credibile, il
   cliente se ne sarebbe accorto fra trent'anni, e chi versava di più riceveva
   una promessa più falsa di chi non versava niente.

   Chi chiama questa funzione passa `gapSenzaFondo`. */
function proposte(gapSenzaFondo, anniAllaPensione, redditoNettoMensile, par) {
  var gap = pos(gapSenzaFondo);
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
  /* Il divario NUDO: quello che manca contando solo la pensione pubblica.
     È la misura su cui si costruiscono le proposte (vedi la nota sopra
     `proposte`), e va anche mostrata — è la domanda vera del cliente:
     «quanto mi manca?», non «quanto mi manca al netto di quello che sto già
     facendo». */
  var gapSenzaFondo = Math.max(0, nettoMensile - pensioneMensile);

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
    gapSenzaFondoMensile: gapSenzaFondo,
    proposte: proposte(gapSenzaFondo, car.anniAllaPensione, nettoMensile, FONDO),

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
  /* Il prodotto di riferimento si dice sempre, anche quando i numeri saranno
     confermati: chi legge il foglio fra un anno deve sapere di quale tariffa
     parlava, non solo che era «HDI». */
  out.push({ gruppo: 'Tariffa HDI', etichetta: 'Prodotto di riferimento: ' + FONDO.prodotto.etichetta,
    fonte: FONDO.prodotto.fonte + ' Alternativa: ' + FONDO.prodotto.alternativa });
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

/* ══ IL FOGLIO PER IL CLIENTE ════════════════════════════════════════════
   Sta QUI e non nella schermata, per la stessa ragione per cui ci sta il
   calcolo: un documento che si firma e si consegna va provato senza aprire
   un browser. Il foglio del modulo vecchio era l'unica cosa che nessuna
   prova guardava, ed era l'unica che usciva di casa.

   NON SI PRODUCE UN FOGLIO SU UN CALCOLO CHE NON C'È. Meglio un pulsante che
   si rifiuta e dice perché, di un PDF con dei trattini al posto dei numeri:
   il primo lo risolve il consulente in dieci secondi, il secondo arriva al
   cliente. */

/* `useGrouping: 'always'` NON è un vezzo: senza, Intl smette di mettere il
   punto sotto le cinque cifre e sullo stesso foglio compaiono «1800 €» e
   «57.477 €». Su un documento che si consegna è la prima cosa che si nota, ed
   è la convenzione di casa (vedi le prove sugli importi in ui-test.mjs). */
function euro(n, decimali) {
  var v = Number(n) || 0;
  return v.toLocaleString('it-IT', {
    minimumFractionDigits: decimali || 0, maximumFractionDigits: decimali || 0, useGrouping: 'always',
  }) + ' €';
}
function perc(n, d) { return ((Number(n) || 0) * 100).toFixed(d == null ? 0 : d).replace('.', ',') + '%'; }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Quello che manca per poter consegnare un foglio. Separato dal calcolo:
   il conto si può fare per curiosità, il foglio no. */
function problemiDelFoglio(d) {
  var p = [];
  var e = d && d.esito;
  if (!e || typeof e !== 'object') p.push('Manca il risultato del calcolo.');
  else {
    if (!(e.redditoNettoMensile > 0)) p.push('Il reddito è a zero: il calcolo non dice niente.');
    if (!(e.eta > 0)) p.push('Manca l\'età della persona.');
  }
  if (!d || !d.cliente || !String(d.cliente.nome || '').trim()) p.push('Manca il nome del cliente: un foglio senza intestatario non si consegna.');
  if (!d || !d.consulente || !String(d.consulente.nome || '').trim()) p.push('Manca il consulente che firma.');
  return p;
}

function foglioHtml(d) {
  d = d || {};
  var problemi = problemiDelFoglio(d);
  if (problemi.length) return { ok: false, problemi: problemi };

  var e = d.esito;
  var cli = d.cliente || {}, con = d.consulente || {};
  var data = d.dataRiferimento || new Date().toLocaleDateString('it-IT');
  var marchi = daConfermare();

  /* LA FASCIA PRUDENZIALE, se serve, sta IN CIMA e non in fondo: un avviso
     sotto la firma lo legge chi già sapeva. */
  var fasciaPrudenziale = e.prudenziale
    ? '<div class="prudenziale"><b>STIMA PRUDENZIALE</b> — l\'età di inizio dell\'attività lavorativa non è stata indicata' +
      (e.datoIncoerente ? ' in modo utilizzabile' : '') + '. Il calcolo usa uno scenario peggiorativo (inizio a ' +
      ETA_INIZIO_PRUDENZIALE + ' anni): pensione più bassa e divario più ampio di quelli probabili.</div>'
    : '';

  var righeProposte = e.proposte.map(function (p) {
    return '<tr' + (p.eQuelloCheAzzera ? ' class="azzera"' : '') + '>' +
      '<td><b>' + euro(p.versamentoMensile) + '</b> al mese</td>' +
      '<td>' + euro(p.renditaMensileNetta) + ' al mese</td>' +
      '<td>' + (p.azzera ? 'copre tutto il divario' : 'copre il ' + perc(p.coperturaGap) + ' del divario') +
      (p.oltreIlTettoDeducibile ? ' <span class="nota">· oltre il tetto deducibile</span>' : '') +
      (p.fuoriPortata ? ' <span class="nota">· oltre un quinto del reddito</span>' : '') + '</td></tr>';
  }).join('');

  var bloccoFiscale = e.fiscale.disponibile
    ? (e.fiscale.inPerdita
      ? '<div class="allarme"><b>Attenzione: a questo livello di reddito dedurre NON conviene.</b> ' +
        'Il versamento farebbe perdere il trattamento integrativo, e il conto finale sarebbe in perdita di ' +
        euro(Math.abs(e.fiscale.risparmioAnnuo)) + ' l\'anno. Il fondo resta utile per la pensione, ma il vantaggio fiscale qui non c\'è.</div>'
      : '<p><b>' + euro(e.fiscale.risparmioAnnuo) + ' l\'anno</b> di minori imposte, versando ' +
        euro(e.fiscale.versatoAnnuo) + '. Ogni euro dedotto vale ' + perc(e.fiscale.aliquotaEffettiva, 1) + '.' +
        (e.fiscale.oltreIlTetto
          ? ' <span class="nota">Il versamento supera il tetto di deducibilità di ' + euro(LEGGE.tettoDeducibilita.v, 2) +
            ': ' + euro(e.fiscale.eccedenza) + ' l\'anno non danno diritto a deduzione.</span>' : '') +
        (e.fiscale.impostaAzzerata ? ' <span class="nota">L\'imposta è già azzerata dalle detrazioni: la deduzione non produce risparmio.</span>' : '') +
        '</p>')
    : '<p class="nota">' + esc(e.fiscale.perche) + '</p>';

  var bloccoTfr = '';
  if (e.mostraTfr) {
    bloccoTfr =
      '<h2>TFR: in azienda o nel fondo?</h2>' +
      '<p class="nota">Un confronto, non un consiglio. La scelta dipende anche da cose che in questo foglio non ci sono.</p>' +
      '<table class="confronto"><tr><th></th><th>TFR in azienda</th><th>TFR nel fondo</th></tr>' +
      TFR.righe.map(function (r) {
        return '<tr><th class="voce">' + esc(r.voce) + '</th><td>' + esc(r.azienda) + '</td><td>' + esc(r.fondo) + '</td></tr>';
      }).join('') + '</table>';
  }

  /* IL BLOCCO DEL RISCATTO VA SEMPRE, anche a chi non ha TFR: «quando posso
     riprendere i miei soldi» è l'obiezione numero uno di chiunque, non solo
     dei dipendenti. Se non la si scrive, il cliente ci pensa lo stesso — solo
     senza risposta davanti. */
  var q = TFR.quandoLiRiprendo;
  var bloccoRiscatto =
    '<h2>' + esc(q.titolo) + '</h2>' +
    '<table class="confronto"><tr><th>Se il TFR resta in azienda</th><th>Nel fondo pensione</th></tr><tr>' +
    '<td><ul>' + q.azienda.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></td>' +
    '<td><ul>' + q.fondo.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></td>' +
    '</tr></table>' +
    '<p class="nota">' + esc(q.fonte) + ' — ' + esc(q.daVerificare) + '</p>';

  var bloccoMarchi = marchi.length
    ? '<div class="daconfermare"><b>Valori ancora da confermare</b><ul>' +
      marchi.map(function (m) { return '<li><b>' + esc(m.gruppo) + '</b> · ' + esc(m.etichetta) + ' — ' + esc(m.fonte) + '</li>'; }).join('') +
      '</ul></div>'
    : '';

  var html =
'<!doctype html><html lang="it"><head><meta charset="utf-8">' +
'<title>Pensione · ' + esc(cli.nome) + '</title><style>' +
'*{box-sizing:border-box}body{font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2a37;margin:0;padding:28px 34px;max-width:860px}' +
'h1{font-size:22px;margin:0 0 2px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#02984e;margin:26px 0 8px;border-bottom:1px solid #d8e3dc;padding-bottom:5px}' +
'.testa{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #02984e;padding-bottom:12px;margin-bottom:16px}' +
'.testa img{height:34px}.sotto{color:#5b6b7c;font-size:12px}' +
'.prudenziale{background:#fff8ec;border-left:4px solid #d98b00;padding:11px 14px;margin:14px 0;font-size:12.5px}' +
'.allarme{background:#fdecec;border-left:4px solid #c0392b;padding:11px 14px;margin:10px 0;font-size:12.5px}' +
'.numeri{display:flex;gap:12px;margin:14px 0}' +
'.n{flex:1;border:1px solid #d8e3dc;border-radius:9px;padding:12px 14px}' +
'.n .et{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#5b6b7c;font-weight:700}' +
'.n .v{font-size:23px;font-weight:800;letter-spacing:-.02em;margin-top:3px}' +
'.n.gap{background:#fdecec;border-color:#f0c0bb}.n.gap .v{color:#c0392b}' +
'.n.ok{background:#eaf7f0;border-color:#b9e3cd}.n.ok .v{color:#02984e}' +
'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12.5px}' +
'th,td{text-align:left;vertical-align:top;padding:7px 9px;border-bottom:1px solid #e8eeeb}' +
'table.confronto th{background:#f4f8f6;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5b6b7c}' +
'table.confronto th.voce{width:150px;background:#fff;text-transform:none;font-size:12.5px;color:#1f2a37}' +
'tr.azzera{background:#eaf7f0;font-weight:700}' +
'ul{margin:0;padding-left:16px}li{margin-bottom:3px}' +
'.nota{color:#5b6b7c;font-size:11.5px}' +
'.daconfermare{background:#fff8ec;border:1px solid #f0dcb8;border-radius:8px;padding:11px 14px;margin:18px 0;font-size:11.5px}' +
'.disclaimer{margin-top:22px;padding-top:12px;border-top:1px solid #d8e3dc;color:#5b6b7c;font-size:11px;line-height:1.6}' +
'.firma{margin-top:18px;font-size:12px}' +
'@media print{body{padding:0}h2{break-after:avoid}table{break-inside:avoid}}' +
'</style></head><body>' +

'<div class="testa"><div>' +
  '<h1>La tua pensione, in una pagina</h1>' +
  '<div class="sotto">' + esc(cli.nome) + ' · ' + esc(e.etichettaLavoro) + ' · ' + e.eta + ' anni · ' + esc(data) + '</div>' +
'</div>' + (d.logo ? '<img src="' + esc(d.logo) + '" alt="">' : '') + '</div>' +

fasciaPrudenziale +

'<h2>Dove sei oggi, e dove arrivi</h2>' +
'<div class="numeri">' +
  '<div class="n"><div class="et">Oggi porti a casa</div><div class="v">' + euro(e.redditoNettoMensile) + '</div><div class="nota">al mese, netti</div></div>' +
  '<div class="n"><div class="et">Pensione pubblica</div><div class="v">' + euro(e.pensioneNettaMensile) + '</div><div class="nota">' + perc(e.tassoSostituzioneNetto) + ' di quello che prendi oggi</div></div>' +
  '<div class="n ' + (e.gapMensile > 0 ? 'gap' : 'ok') + '"><div class="et">' + (e.gapMensile > 0 ? 'Ti mancheranno' : 'Sei coperto') + '</div><div class="v">' +
    euro(e.gapMensile) + '</div><div class="nota">al mese' + (e.gapMensile > 0 ? ', il ' + perc(e.gapPercentuale) + ' del reddito di oggi' : '') + '</div></div>' +
'</div>' +
'<p class="nota">Andrai in pensione a ' + e.etaPensione + ' anni, con ' + e.anniContributi + ' anni di contributi' +
  (e.versamentoMensile > 0
    ? '. Versando ' + euro(e.versamentoMensile) + ' al mese per i ' + e.anniAllaPensione +
      ' anni che mancano, il fondo aggiungerebbe ' + euro(e.fondo.renditaMensileNetta) + ' al mese (montante stimato ' + euro(e.fondo.montante) + ').'
    : '. Oggi non stai versando in nessun fondo: il divario qui sopra è tutto scoperto.') +
  '</p>' +
'<p class="nota">Tariffa di riferimento: <b>' + esc(FONDO.prodotto.etichetta) + '</b>. Alternativa: ' + esc(FONDO.prodotto.alternativa) + '.</p>' +

'<h2>Con quanto al mese lo copri</h2>' +
/* LA STESSA NOTA CHE STA A SCHERMO, e qui serve anche di più. Le proposte
   sono versamenti TOTALI alternativi, quindi le percentuali si misurano sul
   divario che resterebbe con la sola pensione pubblica. Senza questa riga, un
   cliente che legge «ti mancheranno 350» e poi «20 € coprono il 6%» fa la
   divisione e non torna: 33 diviso 350 fa il 9%. Un numero che non torna su un
   foglio firmato è un numero che distrugge la fiducia in tutto il resto. */
(e.versamentoMensile > 0 && e.gapSenzaFondoMensile > e.gapMensile + 0.5
  ? '<p class="nota">Sono ipotesi di versamento <b>al posto</b> dei ' + euro(e.versamentoMensile) +
    ' di adesso, non in aggiunta: le percentuali si riferiscono al divario di <b>' +
    euro(e.gapSenzaFondoMensile) + '</b> al mese che resterebbe con la sola pensione pubblica.</p>'
  : '') +
'<table><tr><th>Se versi</th><th>Ti tornano</th><th>Cosa copre</th></tr>' + righeProposte + '</table>' +

'<h2>Quanto ti fa risparmiare di tasse</h2>' + bloccoFiscale +

bloccoTfr + bloccoRiscatto + bloccoMarchi +

'<div class="firma"><b>' + esc(con.nome) + '</b>' +
  (con.ruolo ? ' · ' + esc(con.ruolo) : '') +
  (con.rui ? ' · RUI ' + esc(con.rui) : '') +
  (con.email ? '<br>' + esc(con.email) : '') +
  (con.telefono ? ' · ' + esc(con.telefono) : '') +
'</div>' +

'<div class="disclaimer">' + esc(disclaimer(e)) + '</div>' +
'</body></html>';

  return { ok: true, html: html };
}

/* ══ LA RIGA D'ARCHIVIO ══════════════════════════════════════════════════
   Ogni foglio che esce lascia la sua riga: chi, per chi, con quali numeri e
   con quale versione delle regole. Serve fra un anno, quando i parametri
   saranno cambiati e il cliente tornerà con quel foglio in mano.

   LA VERSIONE LA SCRIVE IL MOTORE, non chi chiama. Se la copiasse da fuori,
   l'archivio comincerebbe a raccontare con quale codice NON è stato fatto il
   conto, e nessuno se ne accorgerebbe finché non serve. */
function schedaArchivio(d) {
  d = d || {};
  var problemi = [];
  var e = d.esito;
  if (!e || typeof e !== 'object' || !(e.redditoNettoMensile >= 0)) problemi.push('Il calcolo non è riuscito: non c\'è niente da archiviare.');
  if (!d.consulente || !String(d.consulente.nome || '').trim()) problemi.push('Manca il consulente che firma: un\'analisi che non è di nessuno non si archivia.');
  if (problemi.length) return { ok: false, problemi: problemi };

  var cli = d.cliente || {}, con = d.consulente || {};
  return {
    ok: true,
    riga: {
      anagrafica_id: d.anagraficaId || null,
      titolo: 'Pensione · ' + (String(cli.nome || '').trim() || 'senza intestatario'),
      dati: {
        eta: e.eta, lavoro: e.lavoro, etichettaLavoro: e.etichettaLavoro,
        baseReddito: e.baseReddito, redditoMensileDichiarato: e.redditoMensileDichiarato,
        versamentoMensile: e.versamentoMensile,
        etaInizioUsata: e.etaInizioUsata, prudenziale: e.prudenziale, datoIncoerente: e.datoIncoerente,
        dataRiferimento: d.dataRiferimento || null,
        cliente: cli.nome || null, consulente: con.nome || null, rui: con.rui || null,
      },
      obiettivo: { gapMensile: e.gapMensile, gapPercentuale: e.gapPercentuale },
      scelte: { proposte: e.proposte },
      risultato: {
        lordoAnnuo: e.lordoAnnuo, nettoAnnuo: e.nettoAnnuo,
        anniContributi: e.anniContributi, anniAllaPensione: e.anniAllaPensione, etaPensione: e.etaPensione,
        tassoSostituzioneLordo: e.tassoSostituzioneLordo, tassoSostituzioneNetto: e.tassoSostituzioneNetto,
        pensioneNettaMensile: e.pensioneNettaMensile,
        fondo: e.fondo, totaleMensile: e.totaleMensile, gapMensile: e.gapMensile,
        fiscale: e.fiscale,
      },
      /* I PARAMETRI DI QUEL GIORNO, non solo il risultato. È la parte che non
         si può ricostruire dopo: fra due anni in tabella ci sono altri numeri,
         e senza questi la riga non spiega più da dove veniva la cifra che il
         cliente ha in mano. */
      parametri_usati: {
        legge: LEGGE, fondo: FONDO, tassiLordi: TASSI_LORDI,
        daConfermare: daConfermare(),
      },
      versione_motore: VERSIONE,
      nota: e.prudenziale ? 'Scenario prudenziale: età di inizio lavoro non indicata.' : null,
    },
  };
}

/* ══ IL MESSAGGIO WHATSAPP ═══════════════════════════════════════════════
   Precompilato, corto, e senza numeri che non si possono spiegare in due
   righe. Il foglio arriva allegato: qui dentro ci va il motivo per aprirlo.
   NIENTE DATI SENSIBILI OLTRE IL NECESSARIO: il messaggio passa da un
   servizio che non è nostro. */
function messaggioWhatsApp(d) {
  d = d || {};
  var e = d.esito || {};
  var cli = (d.cliente && d.cliente.nome) ? String(d.cliente.nome).trim().split(/\s+/)[0] : '';
  var con = (d.consulente && d.consulente.nome) ? String(d.consulente.nome).trim() : '';
  var r = [];
  r.push((cli ? 'Ciao ' + cli + ', ' : 'Ciao, ') + 'ecco il riepilogo di cui parlavamo.');
  r.push('');
  if (e.gapMensile > 0) {
    r.push('Con la sola pensione pubblica, alla tua età di pensionamento ti mancherebbero circa ' +
      euro(e.gapMensile) + ' al mese rispetto a quello che porti a casa oggi.');
    var az = (e.proposte || []).filter(function (p) { return p.azzera && !p.fuoriPortata; })[0];
    var parziale = (e.proposte || []).filter(function (p) { return !p.azzera; }).pop();
    if (az) r.push('Con ' + euro(az.versamentoMensile) + ' al mese in un fondo pensione quel divario si chiude.');
    else if (parziale) r.push('Con ' + euro(parziale.versamentoMensile) + ' al mese se ne copre già il ' + perc(parziale.coperturaGap) + '.');
  } else {
    r.push('Con quello che stai già versando il divario è coperto.');
  }
  if (e.fiscale && e.fiscale.disponibile && e.fiscale.risparmioAnnuo > 0) {
    r.push('In più recuperi circa ' + euro(e.fiscale.risparmioAnnuo) + ' l\'anno di tasse sul versato.');
  }
  r.push('');
  r.push('Ti allego il foglio con i numeri' + (e.prudenziale ? ' (è una stima prudenziale: manca l\'anno di inizio lavoro)' : '') + '.');
  r.push('Sono una proiezione a scopo illustrativo, non una promessa di rendimento.');
  if (con) { r.push(''); r.push(con); }
  return r.join('\n');
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
  foglioHtml: foglioHtml,
  problemiDelFoglio: problemiDelFoglio,
  schedaArchivio: schedaArchivio,
  messaggioWhatsApp: messaggioWhatsApp,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Pensione = API;
})();
