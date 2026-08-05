// ═══════════════════════════════════════════════════════════════════════════════
//  ANALISI DEI BISOGNI — motore del rating (COPIA AUTOREVOLE)
//
//  Questo e' il calcolo che vale. La gemella in IAM
//  (Agente-sospesi/analisi-bisogni-rating.js) serve solo all'anteprima mentre
//  si compila: e' il browser, e il browser puo' essere cambiato da chi lo usa.
//  Prima di salvare o di stampare un report, il punteggio si RICALCOLA qui.
//
//  Le due copie devono restare identiche. Non c'e' modo di importarne una
//  sola: stanno in due repository diversi e IAM non ha un passo di
//  costruzione. Ci sono pero' due prove — una per repository — che confrontano
//  l'impronta delle regole con lo stesso valore atteso: se qualcuno tocca una
//  soglia di qua e non di la', la sua suite diventa rossa.
//
//  Chi cambia le regole cambia anche VERSIONE_REGOLE, in ENTRAMBI i file.
// ═══════════════════════════════════════════════════════════════════════════════

export const VERSIONE_REGOLE = 'ABR-1.0.0';
export const VERSIONE_QUESTIONARIO = 'ABQ-1.0.0';

export const META_CATEGORIE = Object.freeze({
  famiglia: {
    etichetta: 'Famiglia e reddito',
    prossimoPasso: 'Misurare reddito da proteggere, impegni familiari, debiti e tutele già presenti.',
  },
  casa: {
    etichetta: 'Casa e patrimonio',
    prossimoPasso: 'Verificare valori, mutuo, somme assicurate, responsabilità ed eventi coperti.',
  },
  salute: {
    etichetta: 'Salute e infortuni',
    prossimoPasso: 'Controllare invalidità, franchigie, limiti, diaria e continuità del reddito.',
  },
  previdenza: {
    etichetta: 'Previdenza e risparmio',
    prossimoPasso: 'Chiarire obiettivi, orizzonte, contributi, costi e capitale atteso.',
  },
  responsabilita: {
    etichetta: 'Responsabilità e professione',
    prossimoPasso: 'Verificare responsabilità familiari, professionali, massimali ed esclusioni.',
  },
});

function contiene(elenco, valore) {
  return Array.isArray(elenco) && elenco.includes(valore);
}

/* L'età si calcola in UTC su entrambe le date. Farlo sull'ora locale sposta il
   compleanno di un giorno a cavallo di mezzanotte, e chi compie 45 anni oggi
   finirebbe in una fascia di punteggio diversa a seconda di che ore sono. */
function etaAllaData(dataNascita, dataRiferimento) {
  if (!dataNascita) return null;
  const nascita = new Date(`${dataNascita}T00:00:00Z`);
  if (Number.isNaN(nascita.getTime())) return null;
  let eta = dataRiferimento.getUTCFullYear() - nascita.getUTCFullYear();
  const mese = dataRiferimento.getUTCMonth() - nascita.getUTCMonth();
  if (mese < 0 || (mese === 0 && dataRiferimento.getUTCDate() < nascita.getUTCDate())) eta--;
  return eta >= 0 ? eta : null;
}

/* I due casi che tengono onesto tutto il resto.

   GRIGIO — dati insufficienti. Il verde è un'affermazione: «ho guardato e va
   bene». Su una categoria senza risposte nessuno ha guardato niente, e un
   punteggio basso vuol dire soltanto che non c'è ancora nulla che lo alzi.
   Va in fondo (urgenza -100) finché non arrivano i dati.

   BLU — prodotto dichiarato. «Ho la polizza casa» non è «sono coperto»:
   massimali, esclusioni e franchigie non le ha lette nessuno. Chiudere l'area
   in verde la toglierebbe dal colloquio proprio dove servirebbe aprirlo. Il
   punteggio resta visibile, così si vede quanto pesa quello che c'è da
   verificare. */
function statoCategoria({ punteggio, prodottoPresente, datiSufficienti }) {
  if (!datiSufficienti) return { colore: 'grigio', stato: 'Dati insufficienti', urgenza: -100 };
  if (prodottoPresente) return { colore: 'blu', stato: 'Da verificare', urgenza: punteggio };
  if (punteggio >= 65) return { colore: 'rosso', stato: 'Priorità alta', urgenza: punteggio + 15 };
  if (punteggio >= 38) return { colore: 'ambra', stato: 'Da approfondire', urgenza: punteggio + 5 };
  return { colore: 'verde', stato: 'Bassa priorità', urgenza: punteggio - 10 };
}

export function calcolaNecessita(dati, { dataRiferimento = new Date() } = {}) {
  const d = dati || {};
  const ha = (chiave) => contiene(d.coperture, chiave);
  const interesse = (chiave) => contiene(d.interessi, chiave);
  const eta = etaAllaData(d.anagrafica && d.anagrafica.nascita, dataRiferimento);
  const motivi = { famiglia: [], casa: [], salute: [], previdenza: [], responsabilita: [] };

  // ── Famiglia e reddito ───────────────────────────────────────────────────
  let famiglia = 15;
  if (['figli', 'allargata'].includes(d.famiglia)) {
    famiglia += 28;
    motivi.famiglia.push('Ci sono persone che dipendono dalle scelte economiche del cliente.');
  } else if (d.famiglia === 'coppia') {
    famiglia += 12;
    motivi.famiglia.push('Spese e progetti sono condivisi con il partner.');
  }
  if (['alta', 'totale'].includes(d.dipendenzaReddito)) {
    famiglia += 30;
    motivi.famiglia.push('La famiglia dipende in modo rilevante dal reddito dichiarato.');
  } else if (d.dipendenzaReddito === 'media') {
    famiglia += 15;
    motivi.famiglia.push("Il reddito è importante anche se non è l'unica entrata.");
  }
  if (d.casa === 'mutuo') {
    famiglia += 18;
    motivi.famiglia.push('È presente un mutuo ancora attivo.');
  }
  if (interesse('famiglia') || interesse('mutuo')) famiglia += 10;
  /* La differenza fra «non ce l'ha» e «non l'ha ancora detto»: il punteggio si
     alza solo se il cliente ha davvero confermato l'elenco delle coperture. */
  if (ha('tcm')) {
    motivi.famiglia.push('È già presente una TCM o protezione mutuo: va verificata rispetto a debito e beneficiari.');
  } else if (d.copertureConfermate && d.casa === 'mutuo') {
    famiglia += 15;
    motivi.famiglia.push('Non risulta una TCM o protezione mutuo dichiarata.');
  }

  // ── Casa e patrimonio ────────────────────────────────────────────────────
  let casa = 10;
  if (d.casa === 'mutuo') {
    casa += 48;
    motivi.casa.push("L'abitazione è gravata da un mutuo.");
  } else if (d.casa === 'multi') {
    casa += 45;
    motivi.casa.push('Il patrimonio comprende più immobili.');
  } else if (d.casa === 'proprieta') {
    casa += 30;
    motivi.casa.push("L'abitazione principale è di proprietà.");
  } else if (d.casa === 'affitto') {
    casa += 15;
    motivi.casa.push('Anche in affitto restano responsabilità su contenuto e danni a terzi.');
  }
  if (contiene(d.patrimonio, 'altri_immobili')) casa += 15;
  if (contiene(d.patrimonio, 'oggetti_valore')) casa += 12;
  if (interesse('casa')) casa += 12;
  if (ha('casa')) {
    motivi.casa.push('È già presente una polizza casa: massimali, somme assicurate e garanzie vanno controllati.');
  } else if (d.copertureConfermate && ['proprieta', 'mutuo', 'multi'].includes(d.casa)) {
    casa += 20;
    motivi.casa.push('Non risulta una polizza casa dichiarata per il patrimonio indicato.');
  }

  // ── Salute e infortuni ───────────────────────────────────────────────────
  let salute = 22;
  if (['alta', 'totale'].includes(d.dipendenzaReddito)) {
    salute += 18;
    motivi.salute.push('Un problema di salute avrebbe un impatto diretto sulla capacità di sostenere le spese.');
  }
  if (['figli', 'allargata'].includes(d.famiglia)) {
    salute += 10;
    motivi.salute.push('Il reddito protegge anche altre persone.');
  }
  if (interesse('salute') || interesse('infortuni')) salute += 18;
  if (d.copertureConfermate) {
    if (!ha('salute') && !ha('infortuni')) {
      salute += 48;
      motivi.salute.push('Non risultano coperture salute o infortuni dichiarate.');
    } else {
      motivi.salute.push('Esiste già una copertura salute o infortuni: franchigie, limiti e invalidità vanno verificati.');
    }
  } else {
    motivi.salute.push('Le coperture salute e infortuni non sono ancora state dichiarate.');
  }

  // ── Previdenza e risparmio ───────────────────────────────────────────────
  let previdenza = 15;
  if (eta !== null && eta >= 45) {
    previdenza += 22;
    motivi.previdenza.push("L'età rende utile misurare con più precisione il reddito pensionistico futuro.");
  } else if (eta !== null && eta >= 35) {
    previdenza += 12;
    motivi.previdenza.push("C'è ancora un orizzonte utile per programmare obiettivi di lungo periodo.");
  }
  if (interesse('pensione')) {
    previdenza += 30;
    motivi.previdenza.push('Il cliente ha espresso interesse per la pensione.');
  }
  if (interesse('risparmio')) {
    previdenza += 20;
    motivi.previdenza.push('Il cliente ha espresso un obiettivo di risparmio.');
  }
  if (ha('previdenza')) {
    motivi.previdenza.push('È già presente una soluzione previdenziale: costi, contributi e obiettivo vanno controllati.');
  }

  // ── Responsabilità e professione ─────────────────────────────────────────
  let responsabilita = 12;
  if (['figli', 'allargata'].includes(d.famiglia)) {
    responsabilita += 16;
    motivi.responsabilita.push('Il nucleo familiare aumenta le occasioni di responsabilità verso terzi.');
  }
  if (contiene(d.patrimonio, 'impresa') || interesse('impresa')) {
    responsabilita += 38;
    motivi.responsabilita.push("È presente un'attività o un interesse professionale da proteggere.");
  }
  if (contiene(d.patrimonio, 'prima_casa') || contiene(d.patrimonio, 'altri_immobili')) responsabilita += 12;
  if (ha('rcfam') || ha('professionale') || ha('tutela')) {
    motivi.responsabilita.push('Esistono già tutele di responsabilità o legali: ambito, massimali ed esclusioni vanno verificati.');
  }

  const valori = { famiglia, casa, salute, previdenza, responsabilita };

  /* Quando una categoria ha abbastanza per esprimersi. Sono le condizioni
     minime perché un colore diverso dal grigio voglia dire qualcosa. */
  const sufficienza = {
    famiglia: Boolean(d.famiglia && d.dipendenzaReddito),
    casa: Boolean(d.casa),
    salute: Boolean(d.famiglia && d.dipendenzaReddito && d.copertureConfermate),
    previdenza: eta !== null || interesse('pensione') || interesse('risparmio') || ha('previdenza'),
    responsabilita: Boolean(d.famiglia || (Array.isArray(d.patrimonio) && d.patrimonio.length) || interesse('impresa')),
  };
  const presente = {
    famiglia: ha('tcm'),
    casa: ha('casa'),
    salute: ha('salute') || ha('infortuni'),
    previdenza: ha('previdenza'),
    responsabilita: ha('rcfam') || ha('professionale') || ha('tutela'),
  };

  return Object.entries(valori)
    .map(([chiave, valore]) => {
      const punteggio = Math.min(100, valore);
      const stato = statoCategoria({
        punteggio,
        prodottoPresente: presente[chiave],
        datiSufficienti: sufficienza[chiave],
      });
      return {
        chiave,
        punteggio,
        ...stato,
        motivi: motivi[chiave].length ? motivi[chiave] : ['Non sono emersi elementi sufficienti per una priorità elevata.'],
        prossimoPasso: META_CATEGORIE[chiave].prossimoPasso,
        etichetta: META_CATEGORIE[chiave].etichetta,
        versioneRegole: VERSIONE_REGOLE,
      };
    })
    .sort((a, b) => b.urgenza - a.urgenza || b.punteggio - a.punteggio);
}

/* Le categorie grigie restano fuori e i pesi si ridistribuiscono su quelle
   rimaste. Farle entrare col loro punteggio basso abbasserebbe l'indice come
   se fosse una buona notizia, mentre vuol dire solo che non sappiamo niente.
   Se non resta niente si torna null: meglio nessun numero di uno inventato. */
export function calcolaIndiceComplessivo(necessita) {
  const valide = (necessita || []).filter((n) => n.colore !== 'grigio').slice(0, 3);
  if (!valide.length) return null;
  const pesi = [0.5, 0.3, 0.2];
  const sommaPesi = valide.reduce((totale, _n, indice) => totale + pesi[indice], 0);
  return Math.round(valide.reduce((totale, n, indice) => totale + n.punteggio * pesi[indice], 0) / sommaPesi);
}

export function creaSnapshotRating(dati, opzioni = {}) {
  const necessita = calcolaNecessita(dati, opzioni);
  const principale = necessita.find((n) => n.colore !== 'grigio');
  return {
    versioneRegole: VERSIONE_REGOLE,
    versioneQuestionario: VERSIONE_QUESTIONARIO,
    generatoIl: (opzioni.dataRiferimento || new Date()).toISOString(),
    indiceComplessivo: calcolaIndiceComplessivo(necessita),
    bisognoPrincipale: principale ? principale.chiave : null,
    necessita,
  };
}
