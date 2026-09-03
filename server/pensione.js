// ═══════════════════════════════════════════════════════════════════════════════
//  IL MOTORE DEL CALCOLO PREVIDENZIALE
//
//  Cosa fa: dice quanto montante mette insieme una persona, che pensione ne
//  esce, quanto le manca rispetto all'ultimo stipendio e quanto dovrebbe
//  versare ogni anno per colmare quel buco.
//
//  ─────────────────────────────────────────────────────────────────────────────
//  QUI DENTRO NON C'E' NESSUN NUMERO UFFICIALE. E NON CE NE DEVE ENTRARE UNO.
//
//  Niente coefficienti di trasformazione, niente aliquote contributive, niente
//  requisiti di eta', niente tetto di deducibilita', niente aliquota IRPEF.
//  Tutti quei numeri ARRIVANO DA FUORI, come parametri.
//
//  Il motivo non e' eleganza. Quei numeri cambiano per decreto, tipicamente ogni
//  due anni. Un numero scritto dentro il codice e' un numero che un giorno sara'
//  sbagliato senza che nessuno se ne accorga: il preventivo continua a uscire,
//  bello e stampabile, e nessuno ha modo di sapere che e' vecchio di due
//  riforme. Un parametro che manca, invece, si fa sentire subito — e infatti
//  qui, quando manca, si alza un errore in italiano invece di mettere uno zero
//  o un valore «ragionevole».
//
//  L'elenco di cosa serve, con le unita' di misura, sta in PARAMETRI_RICHIESTI
//  in fondo al file: e' quello che si gira al cliente perche' lo compili.
//
//  ─────────────────────────────────────────────────────────────────────────────
//  IL RISULTATO FINISCE SOTTO GLI OCCHI DI UN CLIENTE
//
//  Non e' la quotazione di un prodotto: e' un'analisi previdenziale, che
//  stampiamo e consegniamo — e che usano anche i collaboratori della rete. Una
//  proiezione senza le ipotesi accanto e' un numero che sembra una promessa:
//  fra due anni il cliente torna, la cifra e' un'altra e chiede perche'. L'unica
//  risposta possibile e' fargli vedere con quali valori era stato fatto allora.
//  Per questo c'e' ipotesiUsate(), che elenca in italiano i valori davvero
//  ricevuti — e li legge dallo stesso catalogo, non da una seconda lista scritta
//  a mano che prima o poi direbbe un'altra cosa.
//
//  ─────────────────────────────────────────────────────────────────────────────
//  DUE REGOLE DI CASA
//
//  1. NIENTE ARROTONDAMENTI. Qui escono numeri, non euro da mostrare. Arrotonda
//     chi stampa, una volta sola, alla fine. Arrotondare a meta' strada e poi
//     rimoltiplicare per trent'anni fa sparire centinaia di euro.
//  2. NIENTE STRINGHE ACCETTATE IN SILENZIO. «30.000» in JavaScript diventa 30,
//     non trentamila. Chi legge un modulo converte prima; qui si rifiuta.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Controlli sugli ingressi ──────────────────────────────────────────────────
/* Un messaggio d'errore lo legge chi sta compilando, non chi ha scritto il
   codice: deve dire QUALE dato manca e COME va scritto, non «expected number». */
const cosE = (v) => {
  if (v === null) return 'niente (null)';
  if (Array.isArray(v)) return 'un elenco';
  if (typeof v === 'string') return `del testo («${v}»)`;
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN (un conto andato storto prima di qui)' : `${v} (infinito)`;
  return typeof v;
};

function numero(v, nome, { min = -Infinity, max = Infinity, obbligatorio = true } = {}) {
  if (v === undefined || v === null) {
    if (!obbligatorio) return undefined;
    /* Il valore di riserva e' il nemico: uno zero messo per far girare il
       conto e' un conto che gira e sbaglia. Meglio fermarsi qui. */
    throw new Error(`Manca «${nome}»: il motore non inventa valori di riserva, quel dato deve arrivare da fuori.`);
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`«${nome}» deve essere un numero, invece è arrivato ${cosE(v)}. Se viene da un modulo va convertito prima (attenzione ai punti e alle virgole: «30.000» letto come numero fa 30).`);
  }
  if (v < min) throw new Error(`«${nome}» vale ${v} e non può essere meno di ${min}.`);
  if (v > max) throw new Error(`«${nome}» vale ${v} e non può essere più di ${max}.`);
  return v;
}

/* PERCENTUALE O FRAZIONE: e' l'errore piu' facile e il piu' caro. Il 33% scritto
   come 33 invece che 0.33 non fa saltare niente — fa uscire un montante cento
   volte piu' grande, che sembra soltanto una buona notizia. Quindi qualunque
   tasso qui dentro e' una FRAZIONE, e un valore fra 1 e 100 viene rifiutato con
   il nome del colpevole. */
function frazione(v, nome, { min = 0, max = 1, obbligatorio = true } = {}) {
  const n = numero(v, nome, { obbligatorio });
  if (n === undefined) return undefined;
  if (n > 1 && n <= 100) throw new Error(`«${nome}» vale ${n}: sembra una percentuale. Qui si scrivono frazioni — 33% si scrive 0.33, 1,5% si scrive 0.015.`);
  return numero(n, nome, { min, max });
}

/* Un conto puo' uscire dai numeri che il computer sa scrivere: (1+r) elevato a
   un numero enorme diventa Infinity, e da li' in poi ogni risultato e' Infinity
   o NaN — ma stampato sembra un numero. Meglio dirlo. */
function finito(x, dove) {
  if (!Number.isFinite(x)) throw new Error(`Il calcolo «${dove}» è uscito dai numeri che il computer sa rappresentare: controlla gli importi e il numero di anni, uno dei due è fuori scala.`);
  return x;
}

const interoNonNegativo = (v, nome) => {
  const n = numero(v, nome, { min: 0 });
  if (!Number.isInteger(n)) throw new Error(`«${nome}» vale ${n}: gli anni si contano interi. Se ci sono mesi, decidi prima come arrotondarli e passa un intero.`);
  return n;
};

// ── 1. IL MONTANTE CONTRIBUTIVO ───────────────────────────────────────────────
/* ORDINE DELLE OPERAZIONI: E' QUI CHE SI SBAGLIA.
   Nel sistema contributivo italiano il montante gia' accumulato si rivaluta
   PRIMA, e poi ci si somma il contributo dell'anno. Conseguenza pratica: il
   contributo dell'ultimo anno non viene rivalutato nemmeno una volta.

   L'altro ordine — prima sommo, poi rivaluto tutto insieme — non e' assurdo (e'
   quello che farebbe un fondo dove versi a gennaio), ma da' un montante piu'
   alto, e la differenza su trent'anni non e' un dettaglio: e' qualche punto
   percentuale di pensione.

   Per questo l'ordine e' un'OPZIONE ESPLICITA e non una scelta nascosta nel
   codice: chi legge il preventivo deve poter sapere quale delle due si e' usata.
   Il valore di riserva e' quello italiano. */
export const ORDINE_ITALIANO = 'rivaluta-poi-contribuisci';
export const ORDINE_FONDO = 'contribuisci-poi-rivaluta';

export function montanteContributivo({ storico, aliquota, rivalutazioni, montanteIniziale = 0, ordine = ORDINE_ITALIANO } = {}) {
  if (!Array.isArray(storico)) throw new Error(`«storico» deve essere un elenco di anni (redditi), invece è arrivato ${cosE(storico)}.`);
  if (ordine !== ORDINE_ITALIANO && ordine !== ORDINE_FONDO) {
    throw new Error(`«ordine» può essere solo «${ORDINE_ITALIANO}» (regola italiana) o «${ORDINE_FONDO}»: è arrivato ${cosE(ordine)}.`);
  }
  if (Array.isArray(rivalutazioni) && rivalutazioni.length < storico.length) {
    throw new Error(`Ci sono ${storico.length} anni di reddito ma solo ${rivalutazioni.length} tassi di rivalutazione: mancano gli ultimi ${storico.length - rivalutazioni.length}.`);
  }

  let montante = numero(montanteIniziale, 'montanteIniziale', { min: 0 });
  let contributi = 0;
  const anni = [];

  for (let i = 0; i < storico.length; i++) {
    /* Ogni anno puo' arrivare come semplice numero (il reddito) o come oggetto
       con la sua aliquota e la sua rivalutazione: le carriere vere cambiano
       cassa, e un'aliquota unica per trent'anni e' una semplificazione che va
       potuta togliere. */
    const riga = (storico[i] && typeof storico[i] === 'object' && !Array.isArray(storico[i])) ? storico[i] : { reddito: storico[i] };
    const etichetta = riga.anno !== undefined ? `anno ${riga.anno}` : `anno n. ${i + 1}`;

    const reddito = numero(riga.reddito, `reddito ${etichetta}`, { min: 0 });
    const al = frazione(riga.aliquota !== undefined ? riga.aliquota : aliquota, `aliquota ${etichetta}`, { min: 0, max: 1 });
    const grezzoTasso = riga.rivalutazione !== undefined ? riga.rivalutazione
      : (Array.isArray(rivalutazioni) ? rivalutazioni[i] : rivalutazioni);
    /* Un tasso puo' essere NEGATIVO: il 2020 e' esistito, e il PIL nominale che
       scende porta il montante giu'. Il limite vero e' -1 (-100%), sotto il
       quale un capitale diventerebbe negativo, che non vuol dire niente. */
    const tasso = frazione(grezzoTasso, `rivalutazione ${etichetta}`, { min: -1, max: 1 });

    const contributo = finito(reddito * al, `contributo ${etichetta}`);
    const apertura = montante;
    montante = ordine === ORDINE_ITALIANO
      ? montante * (1 + tasso) + contributo
      : (montante + contributo) * (1 + tasso);
    finito(montante, `montante ${etichetta}`);
    contributi += contributo;
    anni.push({ anno: riga.anno ?? null, reddito, aliquota: al, contributo, rivalutazione: tasso, apertura, chiusura: montante });
  }

  return {
    montante,
    contributi,
    /* Quanto ci ha messo la rivalutazione: serve a spiegare al cliente che il
       montante non e' la somma di quello che ha versato. */
    rivalutazione: montante - contributi - montanteIniziale,
    ordine,
    anni,
  };
}

// ── 2. LA PROIEZIONE DEI REDDITI ──────────────────────────────────────────────
/* La crescita e' COMPOSTA, non lineare: il 2% del secondo anno si calcola su un
   reddito gia' cresciuto. Sembra ovvio e invece la somma dei redditi con la
   crescita lineare, su trent'anni, sbaglia di parecchio.

   IL PRIMO ANNO: qui la scelta di riserva e' che il primo anno della proiezione
   sia il reddito di OGGI, ancora fermo — e' quello che si conosce e che il
   cliente si aspetta di vedere in cima alla tabella. Chi preferisce far partire
   la crescita subito passa crescitaDalPrimoAnno: true. E' una scelta di modello,
   non una regola: va confermata da un umano. */
export function proiezioneRedditi({ redditoOggi, anni, crescitaAnnua, crescitaDalPrimoAnno = false } = {}) {
  const base = numero(redditoOggi, 'redditoOggi', { min: 0 });
  const n = interoNonNegativo(anni, 'anni');
  /* La crescita puo' essere negativa (carriere che scendono), ma non sotto
     -100%: un reddito negativo non esiste. */
  const g = frazione(crescitaAnnua, 'crescitaAnnua', { min: -1, max: 1 });

  const fuori = [];
  for (let i = 0; i < n; i++) {
    const esponente = crescitaDalPrimoAnno ? i + 1 : i;
    fuori.push(finito(base * Math.pow(1 + g, esponente), `reddito dell'anno n. ${i + 1}`));
  }
  return fuori;   // elenco vuoto se anni === 0: zero anni, zero redditi
}

// ── 3. LA PENSIONE ANNUA ──────────────────────────────────────────────────────
/* montante × coefficiente di trasformazione. Il coefficiente dipende dall'eta'
   di uscita ed e' fissato per decreto: NON sta qui dentro, arriva da fuori.

   COEFFICIENTE MANCANTE O ZERO: si alza un errore, non si restituisce zero.
   Uno zero qui vorrebbe dire «pensione zero», che e' una risposta credibile e
   catastrofica; un errore invece dice la verita', cioe' che non sappiamo a che
   eta' esce questa persona. */
export function pensioneAnnua({ montante, coefficiente } = {}) {
  const m = numero(montante, 'montante', { min: 0 });
  const c = frazione(coefficiente, 'coefficiente', { min: 0, max: 1 });
  if (c === 0) throw new Error('Il coefficiente di trasformazione è zero: non è un coefficiente, è un dato mancante. Serve quello dell\'età di uscita prevista.');
  // Montante zero invece e' legittimo: chi non ha versato niente prende zero.
  return finito(m * c, 'pensione annua');
}

// ── 4. IL TASSO DI SOSTITUZIONE ───────────────────────────────────────────────
/* Quanto della busta paga resta, in frazione (0.62 = 62%). Chi mostra il numero
   lo moltiplica per 100; qui resta frazione come tutti gli altri tassi, cosi'
   non si mescolano le unita'.

   ULTIMO REDDITO ZERO: e' una divisione per zero, e in JavaScript non esplode —
   restituisce Infinity. Un tasso di sostituzione «infinito» stampato su un
   preventivo e' peggio di un errore. */
export function tassoSostituzione({ pensione, ultimoReddito } = {}) {
  const p = numero(pensione, 'pensione', { min: 0 });
  const r = numero(ultimoReddito, 'ultimoReddito', { min: 0 });
  if (r === 0) throw new Error('L\'ultimo reddito è zero: il tasso di sostituzione è un confronto con la busta paga, e senza busta paga non c\'è niente da confrontare.');
  return finito(p / r, 'tasso di sostituzione');
}

// ── 5. QUANTO VERSARE PER COLMARE IL BUCO ─────────────────────────────────────
/* Si parte dalla fine: per avere gapAnnuo di rendita in piu' serve un capitale
   pari a gapAnnuo / coefficiente. Poi si chiede quale versamento annuo, messo
   da parte per «anni» anni al rendimento netto, arriva a quel capitale.

   TRE COSE DA FAR CONFERMARE A UN UMANO:

   · QUANDO SI VERSA. A fine anno (posticipato) o a inizio anno (anticipato)?
     Versare a inizio anno significa un anno di rendimento in piu' su ogni rata,
     quindi serve versare meno. Il valore di riserva qui e' «fine»: e' la scelta
     prudente, quella che non promette un risultato migliore di quello vero.
   · I COSTI. Qui costiAnnui e' una FRAZIONE del capitale (l'ISC del fondo), non
     euro: si sottrae al rendimento. Se il cliente ragiona in euro fissi il conto
     e' un altro e va rifatto.
   · IL COEFFICIENTE usato per convertire e' quello di OGGI o quello previsto
     fra trent'anni? Sono numeri diversi e nessuno conosce il secondo. */
export function versamentoPerColmare({ gapAnnuo, anni, rendimento, coefficiente, costiAnnui = 0, quando = 'fine' } = {}) {
  const gap = numero(gapAnnuo, 'gapAnnuo');
  const c = frazione(coefficiente, 'coefficiente', { min: 0, max: 1 });
  if (c === 0) throw new Error('Il coefficiente di trasformazione è zero: senza non si sa quanto capitale serve per un euro di rendita.');
  if (quando !== 'fine' && quando !== 'inizio') throw new Error(`«quando» può essere solo «fine» (si versa a fine anno) o «inizio»: è arrivato ${cosE(quando)}.`);

  /* GAP NEGATIVO O ZERO: la pensione basta gia'. Non e' un caso limite da
     respingere, e' la risposta piu' bella che ci sia — e non si versa niente.
     Restituire un numero negativo qui vorrebbe dire «ti restituiamo dei soldi»,
     che nessuno fa. */
  if (gap <= 0) return { annuo: 0, capitaleObiettivo: 0, rendimentoNetto: 0, quando, anni: interoNonNegativo(anni, 'anni') };

  const n = interoNonNegativo(anni, 'anni');
  if (n === 0) throw new Error('Non resta nessun anno per versare: un buco da colmare e zero anni per farlo non è un conto, è una notizia. Va detta, non calcolata.');

  const r = frazione(rendimento, 'rendimento', { min: -1, max: 1 });
  const costi = frazione(costiAnnui, 'costiAnnui', { min: 0, max: 1 });
  const netto = r - costi;
  if (netto <= -1) throw new Error('Fra rendimento negativo e costi il capitale si azzererebbe ogni anno: con questi numeri non esiste un versamento che colmi il buco.');

  const capitaleObiettivo = finito(gap / c, 'capitale obiettivo');

  /* RENDIMENTO NETTO ZERO: la formula generale dividerebbe per zero. Non e' un
     caso raro da ignorare — «tengo i soldi fermi» e' esattamente quello che
     fanno molte persone — ed e' anche il caso piu' semplice: n versamenti
     uguali fanno n volte il versamento. */
  let fattore = netto === 0 ? n : (Math.pow(1 + netto, n) - 1) / netto;
  if (quando === 'inizio') fattore *= (1 + netto);   // ogni rata guadagna un anno in più
  finito(fattore, 'fattore di accumulo');
  if (fattore <= 0) throw new Error('Con questo rendimento e questi anni il capitale accumulato non cresce: non esiste un versamento che colmi il buco.');

  return { annuo: finito(capitaleObiettivo / fattore, 'versamento annuo'), capitaleObiettivo, rendimentoNetto: netto, quando, anni: n };
}

// ── 6. LA DEDUZIONE FISCALE ───────────────────────────────────────────────────
/* Il tetto annuo di deducibilita' e' un numero di legge in EURO: sta fuori, e
   non ha un valore di riserva. L'aliquota IRPEF e' quella marginale di questa
   persona — non la media, non quella dello scaglione piu' basso: il risparmio
   si calcola sull'ultimo euro guadagnato.

   Quello che supera il tetto NON si perde e NON si deduce: resta versato, e
   verra' tassato in modo diverso al momento della prestazione. Qui lo si
   restituisce a parte («eccedenza») perche' chi mostra il preventivo lo dica,
   invece di far credere che tutto il versamento faccia risparmiare. */
export function deduzioneFiscale({ versato, tetto, aliquotaIrpef } = {}) {
  const v = numero(versato, 'versato', { min: 0 });
  const t = numero(tetto, 'tetto', { min: 0 });
  const a = frazione(aliquotaIrpef, 'aliquotaIrpef', { min: 0, max: 1 });
  const dedotto = Math.min(v, t);
  return { dedotto, eccedenza: v - dedotto, risparmio: finito(dedotto * a, 'risparmio fiscale') };
}

// ── 7. LA TASSAZIONE DELLA PRESTAZIONE ────────────────────────────────────────
/* L'aliquota parte da una base e scende di un tot per ogni anno di permanenza
   oltre una certa soglia, fino a un pavimento. Base, riduzione, pavimento e
   soglia SONO TUTTI PARAMETRI: qui non c'e' nessuno dei quattro.

   DUE TRANELLI:
   · L'UNITA'. riduzionePerAnno deve essere nella stessa unita' delle aliquote,
     cioe' una frazione: «0,30 punti percentuali all'anno» si scrive 0.003, non
     0.30. Scritto 0.30 azzera l'aliquota in un anno, e il controllo qui sotto
     non puo' accorgersene — e' un numero legittimo. Va scritto giusto.
   · GLI ANNI PARZIALI. Si contano solo gli anni interi (undici anni e mezzo
     valgono undici): e' la scelta prudente, e va confermata. Chi vuole contare
     anche i mesi passa soloAnniInteri: false. */
export function tassazionePrestazione({ anni, aliquotaBase, riduzionePerAnno, aliquotaMinima, annoDaCuiSiRiduce, soloAnniInteri = true } = {}) {
  const n = numero(anni, 'anni', { min: 0 });
  const base = frazione(aliquotaBase, 'aliquotaBase', { min: 0, max: 1 });
  const passo = frazione(riduzionePerAnno, 'riduzionePerAnno', { min: 0, max: 1 });
  const minima = frazione(aliquotaMinima, 'aliquotaMinima', { min: 0, max: 1 });
  const soglia = numero(annoDaCuiSiRiduce, 'annoDaCuiSiRiduce', { min: 0 });

  /* Se il pavimento e' piu' alto della base, i parametri sono stati compilati
     male (o invertiti). Meglio dirlo adesso che far uscire un'aliquota che
     cresce con gli anni di permanenza. */
  if (minima > base) throw new Error(`L'aliquota minima (${minima}) è più alta di quella base (${base}): i due parametri sono stati invertiti o compilati male.`);

  const conteggio = soloAnniInteri ? Math.floor(n) : n;
  const anniConSconto = Math.max(0, conteggio - soglia);
  return Math.max(minima, base - passo * anniConSconto);
}

// ── L'ELENCO DA FAR COMPILARE ─────────────────────────────────────────────────
/* Non e' documentazione decorativa: e' la lista della spesa dei numeri ufficiali
   che questo motore NON sa e non deve sapere. Ogni voce dice l'unita' di misura,
   perche' meta' degli errori possibili sono percentuali scritte come frazioni e
   viceversa. Nessuna voce ha un valore: se un giorno qualcuno ne mette uno qui,
   ha appena rimesso un numero di legge dentro il codice.

   E' ANCHE LA FONTE DELLE IPOTESI STAMPATE SUL FOGLIO DEL CLIENTE: ipotesiUsate()
   qui sotto legge da questo stesso elenco. Una seconda lista, scritta a mano per
   il PDF, prima o poi direbbe una cosa diversa da quella con cui si e' fatto il
   conto — e lo direbbe proprio sul foglio che diamo al cliente. */
export const PARAMETRI_RICHIESTI = [
  { nome: 'aliquota', etichetta: 'Aliquota contributiva', formato: 'frazione', cosaE: 'Aliquota contributiva di computo della gestione previdenziale della persona', unita: 'frazione (es. 0.33 = 33%)', fonte: 'Circolare INPS in vigore per l\'anno' },
  { nome: 'rivalutazioni', etichetta: 'Rivalutazione del montante', formato: 'elencoFrazioni', cosaE: 'Tasso di capitalizzazione del montante, anno per anno', unita: 'frazione, anche negativa (es. 0.0175 = 1,75%)', fonte: 'Comunicato ISTAT / circolare INPS annuale' },
  { nome: 'coefficiente', etichetta: 'Coefficiente di trasformazione', formato: 'coefficiente', cosaE: 'Coefficiente di trasformazione del montante in rendita, per l\'età di uscita', unita: 'frazione (es. 0.05700)', fonte: 'Decreto biennale di aggiornamento' },
  { nome: 'etaUscita', etichetta: 'Età di uscita ipotizzata', formato: 'anni', cosaE: 'Età alla quale si presume l\'accesso: è quella che sceglie il coefficiente, e senza di lei il coefficiente non si sa leggere', unita: 'anni', fonte: 'Requisiti in vigore + adeguamento alla speranza di vita' },
  { nome: 'crescitaAnnua', etichetta: 'Crescita annua del reddito', formato: 'frazione', cosaE: 'Crescita annua attesa del reddito della persona', unita: 'frazione (es. 0.01 = 1%)', fonte: 'Ipotesi commerciale, da dichiarare al cliente' },
  { nome: 'rendimento', etichetta: 'Rendimento annuo ipotizzato', formato: 'frazione', cosaE: 'Rendimento annuo atteso della linea del fondo o della polizza', unita: 'frazione lorda annua', fonte: 'Ipotesi, dalla documentazione del prodotto' },
  { nome: 'costiAnnui', etichetta: 'Costi annui di gestione', formato: 'frazione', cosaE: 'Costo annuo di gestione, in percentuale del capitale (ISC)', unita: 'frazione (es. 0.012 = 1,2%)', fonte: 'Scheda costi del prodotto' },
  { nome: 'tetto', etichetta: 'Tetto annuo di deducibilità', formato: 'euro', cosaE: 'Tetto annuo di deducibilità dei versamenti a previdenza complementare', unita: 'EURO all\'anno', fonte: 'Norma in vigore' },
  { nome: 'aliquotaIrpef', etichetta: 'Aliquota IRPEF marginale', formato: 'frazione', cosaE: 'Aliquota IRPEF marginale della persona', unita: 'frazione (es. 0.35 = 35%)', fonte: 'Scaglioni in vigore + reddito del cliente' },
  { nome: 'aliquotaBase', etichetta: 'Aliquota sulla prestazione, prima delle riduzioni', formato: 'frazione', cosaE: 'Aliquota sostitutiva sulla prestazione prima delle riduzioni', unita: 'frazione', fonte: 'Norma in vigore' },
  { nome: 'riduzionePerAnno', etichetta: 'Riduzione dell\'aliquota per anno di permanenza', formato: 'frazionePerAnno', cosaE: 'Di quanto scende l\'aliquota per ogni anno di permanenza oltre la soglia', unita: 'frazione all\'anno (0,30 punti = 0.003)', fonte: 'Norma in vigore' },
  { nome: 'aliquotaMinima', etichetta: 'Aliquota minima sulla prestazione', formato: 'frazione', cosaE: 'Pavimento sotto cui l\'aliquota non scende', unita: 'frazione', fonte: 'Norma in vigore' },
  { nome: 'annoDaCuiSiRiduce', etichetta: 'Anno dal quale l\'aliquota comincia a scendere', formato: 'anni', cosaE: 'Anno di permanenza dal quale comincia la riduzione', unita: 'anni', fonte: 'Norma in vigore' },
];

/* I dati della PERSONA. Non sono numeri di legge e non vanno chiesti a nessun
   decreto — ma finiscono sullo stesso foglio, perche' un tasso di sostituzione
   senza lo stipendio a cui si riferisce non vuol dire niente. */
export const DATI_DELLA_PERSONA = [
  { nome: 'redditoOggi', etichetta: 'Reddito annuo di oggi', formato: 'euro' },
  { nome: 'ultimoReddito', etichetta: 'Ultimo reddito prima della pensione', formato: 'euro' },
  { nome: 'montanteIniziale', etichetta: 'Montante già maturato', formato: 'euro' },
  { nome: 'anni', etichetta: 'Anni considerati', formato: 'anni' },
  { nome: 'gapAnnuo', etichetta: 'Buco annuo da colmare', formato: 'euro' },
  { nome: 'versato', etichetta: 'Versamento annuo alla previdenza complementare', formato: 'euro' },
];

/* LE SCELTE DI MODELLO. Non sono numeri, sono decisioni — e ognuna sposta il
   risultato. Vanno stampate come le altre ipotesi: se non le si dichiara, il
   cliente non ha modo di sapere che una strada diversa, altrettanto legittima,
   avrebbe dato un'altra cifra.
   Qui c'e' anche il valore di riserva, ed e' giusto che ci sia: NON e' un numero
   di legge, e serve a poter scrivere sul foglio cosa e' stato usato anche quando
   nessuno ha scelto niente. */
export const SCELTE_DI_MODELLO = [
  { nome: 'ordine', etichetta: 'Ordine di rivalutazione del montante', riserva: ORDINE_ITALIANO, letture: {
    [ORDINE_ITALIANO]: 'prima si rivaluta il montante, poi si somma il contributo dell\'anno (regola italiana)',
    [ORDINE_FONDO]: 'prima si somma il contributo dell\'anno, poi si rivaluta tutto insieme',
  } },
  { nome: 'quando', etichetta: 'Momento del versamento', riserva: 'fine', letture: {
    fine: 'a fine anno (posticipato)',
    inizio: 'a inizio anno (anticipato): ogni rata guadagna un anno di rendimento in più',
  } },
  { nome: 'crescitaDalPrimoAnno', etichetta: 'Primo anno della proiezione', riserva: false, letture: {
    false: 'il primo anno è il reddito di oggi, ancora fermo',
    true: 'il reddito cresce già dal primo anno',
  } },
  { nome: 'soloAnniInteri', etichetta: 'Conteggio degli anni di permanenza', riserva: true, letture: {
    true: 'si contano solo gli anni interi (i mesi in più non danno sconto)',
    false: 'si contano anche i mesi',
  } },
];

// ── LE IPOTESI DA STAMPARE ACCANTO AL RISULTATO ───────────────────────────────
/* PERCHE' ESISTE
   Una proiezione previdenziale senza le ipotesi accanto e' un numero che sembra
   una promessa. Fra due anni il cliente torna, il conto dice un'altra cifra e
   chiede perche': l'unica risposta possibile e' far vedere con quali valori era
   stato fatto allora. Se il motore non li sa elencare, quella risposta non ce
   l'ha nessuno — ne' l'agenzia ne' il collaboratore che gliel'ha stampato.

   COSTRUITO DAI PARAMETRI RICEVUTI, non da una lista parallela: si passa lo
   stesso oggetto che si e' dato alle funzioni di calcolo, e quello che esce e'
   quello che e' entrato. Nulla viene nascosto — anche una chiave che non
   conosciamo finisce nell'elenco, perche' un'ipotesi che non compare sul foglio
   e' peggio di una scritta male.

   L'ARROTONDAMENTO QUI E' LEGITTIMO ed e' l'unico di tutto il file: questa
   funzione non calcola, scrive. Il valore esatto resta comunque nel campo
   «valore», cosi' chi vuole ricontrollare ha il numero vero e non il testo. */
const numeroIt = (x, dec) => {
  const r = Math.round(x * Math.pow(10, dec)) / Math.pow(10, dec);
  const [intero, decimali] = Math.abs(r).toFixed(dec).split('.');
  const conPunti = intero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const coda = (decimali || '').replace(/0+$/, '');
  return (r < 0 ? '-' : '') + conPunti + (coda ? ',' + coda : '');
};
const percento = (n) => numeroIt(n * 100, 4) + '%';

function testoIpotesi(v, formato) {
  const numerico = typeof v === 'number' && Number.isFinite(v);
  if (formato === 'elencoFrazioni') {
    if (numerico) return percento(v) + ' per tutti gli anni';
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      const min = Math.min(...v), max = Math.max(...v);
      /* Trenta tassi stampati uno per uno non li legge nessuno: si dice quanti
         anni sono e fra quali estremi si sono mossi. Chi vuole il dettaglio ha
         il campo «valore» con tutti i numeri dentro. */
      return min === max ? percento(min) + ' per ' + v.length + ' anni'
        : v.length + ' anni, dal ' + percento(min) + ' al ' + percento(max);
    }
    return 'valore non utilizzabile: ' + cosE(v);
  }
  if (!numerico && ['frazione', 'coefficiente', 'frazionePerAnno', 'euro', 'anni'].includes(formato)) {
    /* Non si alza un errore: questa funzione serve a STAMPARE, e una stampa che
       esplode lascia il cliente senza foglio. Il valore storto si scrive com'e',
       e si vede. */
    return 'valore non utilizzabile: ' + cosE(v);
  }
  if (formato === 'frazione') return percento(v);
  if (formato === 'coefficiente') return numeroIt(v, 5) + ' (' + percento(v) + ')';
  if (formato === 'frazionePerAnno') return numeroIt(v * 100, 4) + ' punti percentuali all\'anno';
  if (formato === 'euro') return numeroIt(v, 2) + ' €';
  if (formato === 'anni') return numeroIt(v, 2) + ' anni';
  if (Array.isArray(v)) return v.length + ' valori';
  if (numerico) return numeroIt(v, 2);
  return String(v);
}

export function ipotesiUsate(parametri = {}) {
  if (parametri === null || typeof parametri !== 'object' || Array.isArray(parametri)) {
    throw new Error(`«parametri» deve essere l'oggetto che è stato passato al calcolo, invece è arrivato ${cosE(parametri)}.`);
  }
  const fuori = [];
  const gia = new Set();

  /* L'ordine e' quello dei cataloghi, non quello in cui sono arrivate le chiavi:
     due preventivi fatti lo stesso giorno devono avere le ipotesi nello stesso
     ordine, altrimenti confrontarli diventa un lavoro. */
  for (const [elenco, tipo] of [[PARAMETRI_RICHIESTI, 'parametro ufficiale'], [DATI_DELLA_PERSONA, 'dato della persona']]) {
    for (const voce of elenco) {
      if (!(voce.nome in parametri) || parametri[voce.nome] === undefined) continue;
      gia.add(voce.nome);
      fuori.push({
        nome: voce.nome, tipo, etichetta: voce.etichetta,
        testo: testoIpotesi(parametri[voce.nome], voce.formato),
        valore: parametri[voce.nome],
        unita: voce.unita || null, fonte: voce.fonte || null, diRiserva: false,
      });
    }
  }

  for (const s of SCELTE_DI_MODELLO) {
    /* Le scelte si stampano ANCHE quando nessuno le ha fatte: il conto una
       strada l'ha presa comunque, e il foglio deve dire quale. */
    const scelto = (s.nome in parametri) && parametri[s.nome] !== undefined;
    const v = scelto ? parametri[s.nome] : s.riserva;
    gia.add(s.nome);
    const letto = s.letture[String(v)];
    fuori.push({
      nome: s.nome, tipo: 'scelta di modello', etichetta: s.etichetta,
      testo: (letto || String(v)) + (scelto ? '' : ' — scelta di riserva, nessuno l\'ha indicata'),
      valore: v, unita: null, fonte: null, diRiserva: !scelto,
    });
  }

  for (const k of Object.keys(parametri)) {
    if (gia.has(k) || parametri[k] === undefined) continue;
    /* Una chiave che non conosciamo e' comunque entrata nel conto: sparire dal
       foglio sarebbe la cosa peggiore che potrebbe fare. Si stampa col suo nome
       tecnico, e chi la vede capisce che manca un'etichetta in questo file. */
    fuori.push({
      nome: k, tipo: 'altro', etichetta: k,
      testo: testoIpotesi(parametri[k], null), valore: parametri[k],
      unita: null, fonte: null, diRiserva: false,
    });
  }

  return fuori;
}
