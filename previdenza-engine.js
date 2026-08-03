/* ══════════════════════════════════════════════════════════════════════════
   PREVIDENZA — motore di calcolo
   ─────────────────────────────────────────────────────────────────────────
   Funzioni pure: nessun accesso al DOM, nessuna chiamata di rete, nessun
   numero di legge cablato. Tutti i parametri arrivano da
   tariffe/previdenza-parametri.json (oggetto `P` passato a ogni funzione).

   Il file è caricabile sia dal browser (window.PREV) sia da Node
   (require) — serve per i test da riga di comando.

   NATURA DEI RISULTATI: sono STIME COMMERCIALI. Servono ad aprire una
   conversazione, non a certificare un importo. Ogni funzione di alto
   livello restituisce anche `ipotesi[]`, l'elenco delle assunzioni fatte,
   che l'interfaccia deve mostrare al cliente.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const api = factory();
  // Browser (script classico) → window.PREV. Node → globalThis.PREV, perché
  // package.json dichiara "type": "module" e qui non esiste `module.exports`.
  root.PREV = api;
  if (typeof module === 'object' && module !== null && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ── utilità ─────────────────────────────────────────────────────────── */

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const num = (v, def = 0) => { const n = Number(v); return isFinite(n) ? n : def; };
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  /* ── IRPEF ───────────────────────────────────────────────────────────── */

  /** Imposta lorda sugli scaglioni definiti nei parametri. */
  function irpefLorda(reddito, P) {
    const red = Math.max(0, num(reddito));
    let imposta = 0, prec = 0;
    for (const s of P.irpef.scaglioni) {
      const tetto = s.fino_a == null ? Infinity : s.fino_a;
      if (red <= prec) break;
      imposta += (Math.min(red, tetto) - prec) * s.aliquota;
      prec = tetto;
    }
    return r2(imposta);
  }

  /** Aliquota dell'ultimo euro guadagnato: è quella che determina il
      risparmio fiscale di un versamento deducibile. */
  function aliquotaMarginale(reddito, P) {
    const red = Math.max(0, num(reddito));
    for (const s of P.irpef.scaglioni) if (s.fino_a == null || red <= s.fino_a) return s.aliquota;
    return P.irpef.scaglioni[P.irpef.scaglioni.length - 1].aliquota;
  }

  /** Aliquota media effettiva (imposta / reddito). */
  function aliquotaMedia(reddito, P) {
    const red = Math.max(0, num(reddito));
    return red > 0 ? irpefLorda(red, P) / red : 0;
  }

  /** Stima del netto annuo da RAL — dipendente. Volutamente semplificata:
      contributi a carico lavoratore + IRPEF + addizionali medie. */
  function nettoDaRal(ral, P) {
    const lordo = Math.max(0, num(ral));
    const contributi = lordo * P.contributi.dipendente_quota_lavoratore;
    const imponibile = lordo - contributi;
    const addiz = imponibile * (P.irpef.addizionale_regionale_media + P.irpef.addizionale_comunale_media);
    return r2(imponibile - irpefLorda(imponibile, P) - addiz);
  }

  /* ── TFR · regole di base ────────────────────────────────────────────── */

  /** Quota TFR che matura in un anno.
      In azienda si sconta il contributo al Fondo di garanzia INPS (0,50%);
      se il TFR è conferito a previdenza complementare viene versata intera. */
  function quotaTfrAnnua(ral, P, destinazione) {
    const lordo = Math.max(0, num(ral));
    const quota = lordo / P.tfr.divisore_quota;
    return r2(destinazione === 'fondo' ? quota : quota - lordo * P.tfr.aliquota_fondo_garanzia);
  }

  /** Tasso di rivalutazione del TFR lasciato in azienda: 1,5% fisso + 75% FOI. */
  function tassoRivalutazioneTfr(foi, P) {
    return P.tfr.rivalutazione_fissa + P.tfr.rivalutazione_quota_foi * num(foi);
  }

  /* ── TFR in azienda · proiezione ─────────────────────────────────────── */

  /**
   * Accumulo anno per anno del TFR lasciato in azienda.
   * La rivalutazione è tassata ogni anno con imposta sostitutiva (17%),
   * quindi il montante che cresce è già al netto di quell'imposta.
   */
  function proiezioneTfrAzienda(input, P) {
    const anni = Math.max(0, Math.round(num(input.anni)));
    const foi = num(input.foi, P.inflazione.foi_default);
    const crescita = num(input.crescitaRal, 0);
    const tasso = tassoRivalutazioneTfr(foi, P);

    let montante = num(input.montanteIniziale, 0);
    let ral = num(input.ral);
    let totQuote = 0, totRivalutazione = 0, totImposte = 0;
    const righe = [];

    for (let a = 1; a <= anni; a++) {
      const rivalutazione = montante * tasso;
      const imposta = rivalutazione * P.tfr.imposta_sostitutiva_rivalutazione;
      const quota = quotaTfrAnnua(ral, P, 'azienda');

      montante = montante + rivalutazione - imposta + quota;
      totQuote += quota; totRivalutazione += rivalutazione; totImposte += imposta;

      righe.push({
        anno: a, ral: r2(ral), quota: r2(quota), rivalutazione: r2(rivalutazione),
        imposta: r2(imposta), montante: r2(montante),
        quoteCumulate: r2(totQuote)   // serve per tassare la liquidazione a un anno qualsiasi
      });
      ral *= (1 + crescita);
    }

    return {
      montanteLordo: r2(montante),
      totaleQuote: r2(totQuote),
      totaleRivalutazione: r2(totRivalutazione),
      totaleImposteRivalutazione: r2(totImposte),
      tassoRivalutazione: tasso,
      righe
    };
  }

  /**
   * Tassazione del TFR alla liquidazione (art. 19 TUIR, tassazione separata).
   * L'imponibile è il solo capitale accantonato: le rivalutazioni sono già
   * state tassate al 17% anno per anno.
   * Il reddito di riferimento è (imponibile / anni di servizio) × 12, e su
   * quello si calcola l'aliquota media, con il pavimento previsto dai parametri.
   */
  function tassazioneTfrAzienda(proiezione, anniServizio, P) {
    const imponibile = Math.max(0, num(proiezione.totaleQuote));
    const anni = Math.max(1, num(anniServizio));
    const redditoRiferimento = (imponibile / anni) * 12;

    let aliq = redditoRiferimento > 0 ? irpefLorda(redditoRiferimento, P) / redditoRiferimento : P.tfr.aliquota_media_minima;
    aliq = Math.max(aliq, P.tfr.aliquota_media_minima);

    const imposta = imponibile * aliq;
    return {
      imponibile: r2(imponibile),
      redditoRiferimento: r2(redditoRiferimento),
      aliquota: aliq,
      imposta: r2(imposta),
      netto: r2(num(proiezione.montanteLordo) - imposta)
    };
  }

  /* ── TFR / versamenti in fondo pensione · proiezione ─────────────────── */

  /** Tassazione annua dei rendimenti del fondo: 12,5% sulla quota in titoli
      di Stato, 20% sul resto. */
  function aliquotaRendimentiFondo(quotaTitoliStato, P) {
    const q = clamp(num(quotaTitoliStato, 0), 0, 1);
    return q * P.fondo_pensione.tassazione_rendimenti_titoli_stato + (1 - q) * P.fondo_pensione.tassazione_rendimenti;
  }

  /** Aliquota sulla prestazione finale: 15%, ridotta dello 0,30% per ogni
      anno oltre il quindicesimo, con pavimento al 9%. */
  function aliquotaPrestazioneFondo(anniPartecipazione, P) {
    const fp = P.fondo_pensione;
    const extra = Math.max(0, num(anniPartecipazione) - fp.anni_soglia_riduzione);
    return Math.max(fp.tassazione_prestazione_minima, fp.tassazione_prestazione_base - extra * fp.riduzione_annua_oltre_soglia);
  }

  /**
   * Accumulo anno per anno in previdenza complementare.
   * Confluiscono, a seconda di cosa è attivo: quota TFR, versamento
   * volontario del lavoratore, contributo del datore.
   * I rendimenti sono tassati annualmente; il capitale resta imponibile
   * alla prestazione finale.
   */
  function proiezioneFondo(input, P) {
    const anni = Math.max(0, Math.round(num(input.anni)));
    const crescita = num(input.crescitaRal, 0);
    const linea = input.linea || {};
    const rendLordo = num(linea.rendimento_atteso, 0) + num(input.deltaRendimento, 0);
    const costoGestione = num(linea.costo_gestione_annuo, 0);
    const rendNetto = Math.max(-0.99, rendLordo - costoGestione);
    const aliqRend = aliquotaRendimentiFondo(linea.quota_titoli_stato, P);

    let montante = num(input.montanteIniziale, 0);
    let ral = num(input.ral);
    let capitaleVersato = num(input.montanteIniziale, 0);
    let totTfr = 0, totVolontario = 0, totDatore = 0, totRendimenti = 0, totImposteRend = 0;
    const righe = [];

    for (let a = 1; a <= anni; a++) {
      // I rendimenti maturano sul montante di inizio anno.
      const rendimentoLordo = montante * rendNetto;
      const impostaRend = Math.max(0, rendimentoLordo) * aliqRend;
      const rendimentoNetto = rendimentoLordo - impostaRend;

      const tfr = input.conferisceTfr ? quotaTfrAnnua(ral, P, 'fondo') : 0;
      const volontario = num(input.versamentoAnnuo, 0);
      const datore = num(input.contributoDatoreAliquota, 0) * ral;

      montante = montante + rendimentoNetto + tfr + volontario + datore;
      capitaleVersato += tfr + volontario + datore;
      totTfr += tfr; totVolontario += volontario; totDatore += datore;
      totRendimenti += rendimentoLordo; totImposteRend += impostaRend;

      righe.push({
        anno: a, ral: r2(ral), tfr: r2(tfr), volontario: r2(volontario), datore: r2(datore),
        rendimento: r2(rendimentoNetto), montante: r2(montante),
        capitaleCumulato: r2(capitaleVersato)   // è l'imponibile della prestazione
      });
      ral *= (1 + crescita);
    }

    return {
      montanteLordo: r2(montante),
      capitaleVersato: r2(capitaleVersato),
      totaleTfr: r2(totTfr),
      totaleVolontario: r2(totVolontario),
      totaleContributoDatore: r2(totDatore),
      totaleRendimenti: r2(totRendimenti),
      totaleImposteRendimenti: r2(totImposteRend),
      rendimentoNettoAnnuo: rendNetto,
      righe
    };
  }

  /**
   * Tassazione della prestazione finale.
   * Imponibile = montante meno i rendimenti (già tassati anno per anno).
   */
  function tassazionePrestazioneFondo(proiezione, anniPartecipazione, P) {
    const montante = num(proiezione.montanteLordo);
    const rendimentiNetti = num(proiezione.totaleRendimenti) - num(proiezione.totaleImposteRendimenti);
    const imponibile = Math.max(0, montante - rendimentiNetti);
    const aliq = aliquotaPrestazioneFondo(anniPartecipazione, P);
    const imposta = imponibile * aliq;
    return { imponibile: r2(imponibile), aliquota: aliq, imposta: r2(imposta), netto: r2(montante - imposta) };
  }

  /* ── Risparmio fiscale da deducibilità ───────────────────────────────── */

  /**
   * Il versamento volontario è deducibile fino al tetto annuo: il risparmio
   * è calcolato scalando il reddito per scaglioni, non moltiplicando per
   * l'aliquota marginale (che sovrastima quando il versamento fa scendere
   * di scaglione).
   */
  function risparmioFiscaleAnnuo(reddito, versamento, P) {
    const red = Math.max(0, num(reddito));
    const dedotto = Math.min(Math.max(0, num(versamento)), P.fondo_pensione.tetto_deducibilita);
    const risparmio = irpefLorda(red, P) - irpefLorda(red - dedotto, P);
    return {
      versamento: r2(num(versamento)),
      dedotto: r2(dedotto),
      eccedenzaNonDeducibile: r2(Math.max(0, num(versamento) - dedotto)),
      risparmio: r2(risparmio),
      aliquotaMarginale: aliquotaMarginale(red, P),
      costoReale: r2(num(versamento) - risparmio)
    };
  }

  /* ── LATO PRIVATO · confronto TFR azienda vs fondo ───────────────────── */

  /**
   * Il confronto che regge tutta la consulenza: gli stessi euro di TFR,
   * lasciati in azienda oppure conferiti al fondo, a parità di anni.
   */
  function confrontoTfr(input, P) {
    const anni = Math.max(1, Math.round(num(input.anni)));
    const base = { ral: num(input.ral), anni, crescitaRal: num(input.crescitaRal, 0), foi: num(input.foi, P.inflazione.foi_default) };

    const azienda = proiezioneTfrAzienda(base, P);
    const tassAzienda = tassazioneTfrAzienda(azienda, anni, P);

    const fondo = proiezioneFondo({ ...base, conferisceTfr: true, linea: input.linea, deltaRendimento: num(input.deltaRendimento, 0) }, P);
    const tassFondo = tassazionePrestazioneFondo(fondo, anni, P);

    const delta = r2(tassFondo.netto - tassAzienda.netto);

    return {
      anni,
      azienda: { ...azienda, tassazione: tassAzienda, netto: tassAzienda.netto },
      fondo: { ...fondo, tassazione: tassFondo, netto: tassFondo.netto },
      differenza: delta,
      differenzaPercentuale: tassAzienda.netto > 0 ? r2((delta / tassAzienda.netto) * 100) : 0,
      conviene: delta > 0 ? 'fondo' : (delta < 0 ? 'azienda' : 'pari'),
      ipotesi: [
        `Retribuzione lorda di partenza ${fmtEuro(base.ral)}, crescita ipotizzata ${(base.crescitaRal * 100).toFixed(1)}% l'anno.`,
        `Inflazione (FOI) ipotizzata al ${(base.foi * 100).toFixed(1)}%: il TFR in azienda si rivaluta del ${(azienda.tassoRivalutazione * 100).toFixed(2)}% l'anno.`,
        `Rendimento netto della linea scelta ipotizzato al ${(fondo.rendimentoNettoAnnuo * 100).toFixed(2)}% l'anno, già al netto dei costi di gestione.`,
        `TFR in azienda tassato al ${(tassAzienda.aliquota * 100).toFixed(1)}%; TFR nel fondo tassato al ${(tassFondo.aliquota * 100).toFixed(1)}% dopo ${anni} anni di adesione.`
      ]
    };
  }

  /**
   * Le due curve del TFR al NETTO delle imposte, anno per anno: quanto
   * resterebbe davvero in mano se si liquidasse in quell'anno.
   *
   * Serve perché sul montante lordo le due curve sono quasi sovrapposte —
   * la differenza tra le due destinazioni non nasce da come si accumula, ma
   * da come si tassa: in azienda l'aliquota media IRPEF (23% o più), nel
   * fondo il 15% che scende fino al 9%. Un grafico sul lordo nasconde
   * esattamente il fatto che si vuole mostrare.
   */
  function nettiPerAnno(confronto, P) {
    const azienda = confronto.azienda.righe.map(r => {
      const imponibile = r.quoteCumulate;
      const redditoRif = r.anno > 0 ? (imponibile / r.anno) * 12 : 0;
      let aliq = redditoRif > 0 ? irpefLorda(redditoRif, P) / redditoRif : P.tfr.aliquota_media_minima;
      aliq = Math.max(aliq, P.tfr.aliquota_media_minima);
      return r2(r.montante - imponibile * aliq);
    });

    const fondo = confronto.fondo.righe.map(r => {
      const aliq = aliquotaPrestazioneFondo(r.anno, P);
      return r2(r.montante - r.capitaleCumulato * aliq);
    });

    return { azienda, fondo };
  }

  /* ── LATO PRIVATO · pensione pubblica e gap ──────────────────────────── */

  /** Coefficiente di trasformazione per età, con estremi tabellati. */
  function coefficienteTrasformazione(eta, P) {
    const tab = P.pensione_pubblica.coefficienti_trasformazione;
    const eta_i = Math.round(num(eta));
    if (tab[eta_i] != null) return tab[eta_i];
    const chiavi = Object.keys(tab).map(Number).sort((a, b) => a - b);
    if (eta_i < chiavi[0]) return tab[chiavi[0]];
    return tab[chiavi[chiavi.length - 1]];
  }

  /** Aliquota di computo ai fini pensionistici, per tipo di lavoratore. */
  function aliquotaComputo(tipoLavoratore, P) {
    const c = P.contributi;
    switch (tipoLavoratore) {
      case 'autonomo_artigiano': return c.autonomo_artigiani;
      case 'autonomo_commerciante': return c.autonomo_commercianti;
      case 'professionista': return c.gestione_separata_professionisti;
      case 'gestione_separata': return c.gestione_separata_senza_altra_tutela;
      default: return c.dipendente_totale;
    }
  }

  /**
   * Montante contributivo già maturato.
   * Se il cliente porta il dato dell'estratto conto INPS si usa quello (è
   * il percorso preciso). Altrimenti si ricostruisce all'indietro dalla RAL
   * attuale: è una stima, e viene dichiarata come tale.
   */
  function montanteMaturato(input, P) {
    if (input.montanteInps != null && num(input.montanteInps) > 0) {
      return { montante: r2(num(input.montanteInps)), stimato: false };
    }
    const anni = Math.max(0, Math.round(num(input.anniContributi)));
    const aliq = aliquotaComputo(input.tipoLavoratore, P);
    const crescita = num(input.crescitaRal, 0);
    const capit = num(input.tassoCapitalizzazione, P.pensione_pubblica.tasso_capitalizzazione_default);
    const massimale = P.contributi.massimale_annuo;

    let m = 0;
    for (let i = anni; i >= 1; i--) {
      const ralAllora = Math.min(num(input.ral) / Math.pow(1 + crescita, i), massimale);
      m += ralAllora * aliq * Math.pow(1 + capit, i);
    }
    return { montante: r2(m), stimato: true };
  }

  /**
   * Quota retributiva per chi ha contributi ante 1996.
   * Approssimazione commerciale standard: 2% per ogni anno di anzianità
   * sulla retribuzione pensionabile. Va dichiarata come approssimazione.
   */
  function quotaRetributiva(anniAnte1996, retribuzionePensionabile, P) {
    const anni = Math.max(0, num(anniAnte1996));
    return r2(anni * P.pensione_pubblica.aliquota_rendimento_retributivo * Math.max(0, num(retribuzionePensionabile)));
  }

  /**
   * Pensione pubblica attesa + tasso di sostituzione + gap.
   * È il numero che apre la conversazione con il cliente.
   */
  function pensionePubblica(input, P) {
    const pp = P.pensione_pubblica;
    const etaAttuale = num(input.eta);
    const etaPensione = num(input.etaPensione, pp.requisiti.vecchiaia.eta);
    const anniAllaPensione = Math.max(0, etaPensione - etaAttuale);
    const aliq = aliquotaComputo(input.tipoLavoratore, P);
    const crescita = num(input.crescitaRal, 0);
    const capit = num(input.tassoCapitalizzazione, pp.tasso_capitalizzazione_default);
    const massimale = P.contributi.massimale_annuo;

    // Montante già maturato, portato avanti fino alla pensione.
    const mat = montanteMaturato(input, P);
    let montante = mat.montante;
    let ral = num(input.ral);

    for (let a = 1; a <= anniAllaPensione; a++) {
      montante = montante * (1 + capit) + Math.min(ral, massimale) * aliq;
      ral *= (1 + crescita);
    }
    const ultimaRal = ral / (anniAllaPensione > 0 ? (1 + crescita) : 1);

    const coeff = coefficienteTrasformazione(etaPensione, P);
    const pensioneContributiva = montante * coeff;
    const pensioneRetributiva = quotaRetributiva(input.anniAnte1996, ultimaRal, P);
    const pensioneAnnua = pensioneContributiva + pensioneRetributiva;

    const pensioneNettaAnnua = pensioneAnnua - irpefLorda(pensioneAnnua, P);
    const mens = pp.mensilita_pensione;

    const ultimoNetto = nettoDaRal(ultimaRal, P);
    const tassoSostituzioneLordo = ultimaRal > 0 ? pensioneAnnua / ultimaRal : 0;
    const tassoSostituzioneNetto = ultimoNetto > 0 ? pensioneNettaAnnua / ultimoNetto : 0;

    const gapAnnuoNetto = Math.max(0, ultimoNetto - pensioneNettaAnnua);

    /* Presidio di plausibilità.
       Il risultato è dominato dal rapporto tra rivalutazione del montante e
       crescita della retribuzione: se la prima supera la seconda il tasso di
       sostituzione schizza verso l'alto e il gap sparisce. Matematicamente è
       corretto, ma mostrare a un cliente "prenderai il 98% del tuo stipendio"
       è sbagliato nella sostanza. Meglio segnalarlo che lasciarlo passare. */
    const avvertenze = [];
    const ts = tassoSostituzioneLordo * 100;
    if (ts > 90) {
      avvertenze.push('Il tasso di sostituzione stimato è molto alto e poco realistico: succede quando la rivalutazione ipotizzata del montante supera la crescita della retribuzione. Riallinea le due ipotesi prima di mostrare il risultato.');
    } else if (ts > 0 && ts < 30) {
      avvertenze.push('Il tasso di sostituzione stimato è molto basso: verifica anni di contributi e retribuzione inseriti.');
    }
    if (crescita < capit) {
      avvertenze.push(`Stai ipotizzando una rivalutazione del montante (${(capit * 100).toFixed(1)}%) superiore alla crescita della retribuzione (${(crescita * 100).toFixed(1)}%): è l'ipotesi che più di ogni altra alza la pensione stimata.`);
    }
    if (anniAllaPensione > 0 && num(input.anniContributi) === 0 && !(num(input.montanteInps) > 0)) {
      avvertenze.push('Nessun contributo pregresso indicato: la stima considera solo gli anni che mancano alla pensione.');
    }

    return {
      avvertenze,
      etaPensione,
      anniAllaPensione,
      montanteFinale: r2(montante),
      montanteMaturatoOggi: mat.montante,
      montanteStimato: mat.stimato,
      coefficiente: coeff,
      ultimaRal: r2(ultimaRal),
      pensioneAnnuaLorda: r2(pensioneAnnua),
      pensioneMensileLorda: r2(pensioneAnnua / mens),
      pensioneAnnuaNetta: r2(pensioneNettaAnnua),
      pensioneMensileNetta: r2(pensioneNettaAnnua / mens),
      quotaRetributiva: r2(pensioneRetributiva),
      quotaContributiva: r2(pensioneContributiva),
      ultimoRedditoNettoAnnuo: r2(ultimoNetto),
      ultimoRedditoNettoMensile: r2(ultimoNetto / mens),
      tassoSostituzioneLordo: r2(tassoSostituzioneLordo * 100),
      tassoSostituzioneNetto: r2(tassoSostituzioneNetto * 100),
      gapAnnuoNetto: r2(gapAnnuoNetto),
      gapMensileNetto: r2(gapAnnuoNetto / mens),
      ipotesi: [
        mat.stimato
          ? `Montante contributivo stimato da ${input.anniContributi || 0} anni di contributi: per un calcolo puntuale serve l'estratto conto INPS.`
          : `Montante contributivo preso dall'estratto conto INPS indicato dal cliente.`,
        `Rivalutazione del montante ipotizzata al ${(capit * 100).toFixed(1)}% l'anno (media quinquennale del PIL nominale).`,
        `Retribuzione in crescita del ${(crescita * 100).toFixed(1)}% l'anno fino alla pensione.`,
        `Coefficiente di trasformazione a ${etaPensione} anni: ${(coeff * 100).toFixed(3)}%.`,
        `Continuità lavorativa piena fino alla pensione, senza interruzioni contributive.`,
        `Gli importi netti non tengono conto delle detrazioni per lavoro dipendente e per carichi di famiglia: i netti reali sono più alti di quelli indicati, sia oggi sia in pensione.`
      ]
    };
  }

  /**
   * Quanto bisogna versare ogni anno per colmare (in tutto o in parte) il gap.
   * Percorso inverso: dal gap desiderato al versamento necessario.
   */
  function versamentoPerColmareGap(input, P) {
    const anni = Math.max(1, Math.round(num(input.anni)));
    const obiettivoMontante = Math.max(0, num(input.obiettivoMontante));
    const linea = input.linea || {};
    const rendNetto = Math.max(-0.99, num(linea.rendimento_atteso, 0) + num(input.deltaRendimento, 0) - num(linea.costo_gestione_annuo, 0));
    const aliqRend = aliquotaRendimentiFondo(linea.quota_titoli_stato, P);
    const rendPostTasse = rendNetto * (1 - aliqRend);

    // Montante prodotto da un versamento annuo di 1 €.
    const aliqFinale = aliquotaPrestazioneFondo(anni, P);
    let fattore = 0;
    for (let a = 1; a <= anni; a++) fattore += Math.pow(1 + rendPostTasse, anni - a);

    // L'imponibile della prestazione è il solo capitale versato (i rendimenti
    // sono già tassati anno per anno): con 1 € l'anno per `anni` anni
    // l'imponibile vale `anni`. Quindi il netto per euro versato è
    // `fattore - anni × aliquota finale`.
    const fattoreNetto = fattore - anni * aliqFinale;

    const versamento = fattoreNetto > 0 ? obiettivoMontante / fattoreNetto : 0;
    const risp = risparmioFiscaleAnnuo(num(input.reddito), versamento, P);

    return {
      versamentoAnnuo: r2(versamento),
      versamentoMensile: r2(versamento / 12),
      risparmioFiscaleAnnuo: risp.risparmio,
      costoRealeAnnuo: risp.costoReale,
      costoRealeMensile: r2(risp.costoReale / 12),
      oltreTetto: risp.eccedenzaNonDeducibile > 0
    };
  }

  /* ── LATO PRIVATO · confronto multi-compagnia ────────────────────────── */

  /**
   * Stessi versamenti, prodotti diversi: quanto resta in mano al cliente.
   * Accetta sia i profili generici sia i prodotti reali del catalogo.
   */
  function confrontoProdotti(input, P, prodotti) {
    const anni = Math.max(1, Math.round(num(input.anni)));
    const esiti = (prodotti || []).map(pr => {
      const linea = pr.linea || pr;
      const proj = proiezioneFondo({
        ral: num(input.ral), anni, crescitaRal: num(input.crescitaRal, 0),
        conferisceTfr: !!input.conferisceTfr, versamentoAnnuo: num(input.versamentoAnnuo, 0),
        contributoDatoreAliquota: num(pr.contributoDatoreAliquota, 0),
        linea, deltaRendimento: num(input.deltaRendimento, 0)
      }, P);
      const tass = tassazionePrestazioneFondo(proj, anni, P);
      const costiUnaTantum = num(pr.costoAdesione, 0);
      return {
        id: pr.id, nome: pr.nome || linea.nome, compagnia: pr.compagnia || null, tipo: pr.tipo || 'profilo_generico',
        reale: !!pr.reale,
        montanteLordo: proj.montanteLordo,
        capitaleVersato: proj.capitaleVersato,
        rendimentoNettoAnnuo: proj.rendimentoNettoAnnuo,
        imposta: tass.imposta,
        aliquotaFinale: tass.aliquota,
        netto: r2(tass.netto - costiUnaTantum),
        contributoDatore: proj.totaleContributoDatore,
        righe: proj.righe
      };
    });
    esiti.sort((a, b) => b.netto - a.netto);
    const migliore = esiti[0], peggiore = esiti[esiti.length - 1];
    return {
      anni,
      esiti,
      migliore: migliore ? migliore.id : null,
      spread: migliore && peggiore ? r2(migliore.netto - peggiore.netto) : 0
    };
  }

  /* ── LATO AZIENDA · costo del TFR ────────────────────────────────────── */

  /**
   * Che cosa costa davvero tenere il TFR in azienda.
   * Sotto la soglia di dipendenti il TFR resta in azienda ed è liquidità
   * disponibile (autofinanziamento); sopra la soglia va al Fondo Tesoreria
   * INPS e quel vantaggio di cassa non c'è.
   */
  function costoTfrAzienda(input, P) {
    const az = P.azienda;
    const dipendenti = Math.max(1, Math.round(num(input.dipendenti)));
    const monteRetributivo = num(input.monteRetributivo);
    const anni = Math.max(1, Math.round(num(input.anni)));
    const sottoSoglia = dipendenti < az.soglia_dipendenti_tesoreria;
    const foi = num(input.foi, P.inflazione.foi_default);
    const tasso = tassoRivalutazioneTfr(foi, P);

    const accantonamentoAnnuo = monteRetributivo / P.tfr.divisore_quota;
    let fondo = num(input.fondoTfrEsistente, 0);
    let totRival = 0, totImposta = 0;
    const righe = [];

    for (let a = 1; a <= anni; a++) {
      const rival = fondo * tasso;
      const imposta = rival * P.tfr.imposta_sostitutiva_rivalutazione;
      // Sopra soglia il nuovo TFR non resta in azienda: si versa al Fondo Tesoreria.
      const accantonato = sottoSoglia ? accantonamentoAnnuo : 0;
      fondo = fondo + rival - imposta + accantonato;
      totRival += rival; totImposta += imposta;
      righe.push({ anno: a, accantonato: r2(accantonato), rivalutazione: r2(rival), imposta: r2(imposta), fondo: r2(fondo) });
    }

    // Il TFR trattenuto è liquidità che l'azienda non chiede alla banca.
    const costoDenaro = num(input.costoDenaro, 0);
    const risparmioFinanziario = sottoSoglia ? r2(fondo * costoDenaro) : 0;
    const costoAnnuoRivalutazione = r2((totRival + totImposta) / anni);

    return {
      sottoSoglia, dipendenti, anni,
      accantonamentoAnnuo: r2(accantonamentoAnnuo),
      fondoFinale: r2(fondo),
      totaleRivalutazione: r2(totRival),
      totaleImpostaSostitutiva: r2(totImposta),
      costoAnnuoRivalutazione,
      risparmioFinanziarioAnnuo: risparmioFinanziario,
      righe,
      ipotesi: [
        sottoSoglia
          ? `Azienda sotto i ${az.soglia_dipendenti_tesoreria} dipendenti: il TFR resta in azienda ed è liquidità utilizzabile.`
          : `Azienda con almeno ${az.soglia_dipendenti_tesoreria} dipendenti: il TFR non conferito va al Fondo di Tesoreria INPS, senza vantaggio di cassa.`,
        `Rivalutazione del ${(tasso * 100).toFixed(2)}% l'anno, con imposta sostitutiva del ${(P.tfr.imposta_sostitutiva_rivalutazione * 100).toFixed(0)}%.`
      ]
    };
  }

  /**
   * Vantaggi fiscali e contributivi del TFR conferito a previdenza
   * complementare: deduzione aggiuntiva, esonero dal Fondo di garanzia,
   * riduzione degli oneri impropri.
   */
  function vantaggioConferimento(input, P) {
    const az = P.azienda;
    const dipendenti = Math.max(1, Math.round(num(input.dipendenti)));
    const monteRetributivo = num(input.monteRetributivo);
    const quotaConferita = clamp(num(input.quotaConferita, 1), 0, 1);
    const sottoSoglia = dipendenti < az.soglia_dipendenti_tesoreria;

    const tfrConferito = (monteRetributivo / P.tfr.divisore_quota) * quotaConferita;
    const aliqDeduzione = sottoSoglia ? az.deducibilita_tfr_conferito_sotto_soglia : az.deducibilita_tfr_conferito;

    const deduzioneAggiuntiva = tfrConferito * aliqDeduzione;
    const risparmioDeduzione = deduzioneAggiuntiva * az.aliquota_ires;
    const esoneroGaranzia = monteRetributivo * az.esonero_fondo_garanzia * quotaConferita;
    const riduzioneOneri = monteRetributivo * az.riduzione_oneri_impropri * quotaConferita;

    const totale = risparmioDeduzione + esoneroGaranzia + riduzioneOneri;

    return {
      sottoSoglia, tfrConferito: r2(tfrConferito),
      aliquotaDeduzione: aliqDeduzione,
      deduzioneAggiuntiva: r2(deduzioneAggiuntiva),
      risparmioDeduzione: r2(risparmioDeduzione),
      esoneroFondoGaranzia: r2(esoneroGaranzia),
      riduzioneOneriImpropri: r2(riduzioneOneri),
      vantaggioAnnuo: r2(totale),
      vantaggioPerDipendente: r2(totale / dipendenti),
      ipotesi: [
        `Deduzione aggiuntiva del ${(aliqDeduzione * 100).toFixed(0)}% del TFR conferito (azienda ${sottoSoglia ? 'sotto' : 'sopra'} i ${az.soglia_dipendenti_tesoreria} dipendenti), valorizzata all'IRES del ${(az.aliquota_ires * 100).toFixed(0)}%.`,
        `Esonero dal contributo al Fondo di garanzia (${(az.esonero_fondo_garanzia * 100).toFixed(2)}%) e riduzione degli oneri impropri (${(az.riduzione_oneri_impropri * 100).toFixed(2)}%) sulla quota conferita.`,
        `Calcolo su un monte retributivo di ${fmtEuro(monteRetributivo)} e una quota di adesione del ${(quotaConferita * 100).toFixed(0)}%.`
      ]
    };
  }

  /**
   * "Quanto mi costa mettere N euro netti in tasca al dipendente."
   * Confronto tra aumento in busta, fringe benefit, contributo a previdenza
   * complementare e premio di risultato detassato.
   * È il numero che chiude la trattativa con il titolare.
   */
  function confrontoErogazione(input, P) {
    const az = P.azienda;
    const netto = Math.max(0, num(input.nettoObiettivo));
    const redditoDip = num(input.redditoDipendente);
    const conFigli = !!input.figliACarico;

    const aliqIrpef = aliquotaMarginale(redditoDip, P);
    const addiz = P.irpef.addizionale_regionale_media + P.irpef.addizionale_comunale_media;
    const contrDip = P.contributi.dipendente_quota_lavoratore;
    const contrDatore = az.contributi_datore_medio;

    const opzioni = [];

    /* 1 — Aumento in busta paga.
       Dal netto si risale al lordo: prima le imposte, poi i contributi
       a carico del lavoratore. Sul lordo l'azienda paga i propri contributi. */
    {
      const imponibileFiscale = netto / (1 - aliqIrpef - addiz);
      const lordo = imponibileFiscale / (1 - contrDip);
      const costo = lordo * (1 + contrDatore);
      const costoNettoIres = costo * (1 - az.aliquota_ires);
      opzioni.push({
        id: 'busta', modalita: 'Aumento in busta paga',
        nettoDipendente: r2(netto), lordo: r2(lordo),
        costoAzienda: r2(costo), costoDopoDeduzione: r2(costoNettoIres),
        efficienza: r2((netto / costo) * 100),
        nota: `Su ${fmtEuro(lordo)} lordi il dipendente perde contributi (${(contrDip * 100).toFixed(2)}%) e imposte (${((aliqIrpef + addiz) * 100).toFixed(1)}%).`
      });
    }

    /* 2 — Fringe benefit entro la soglia di esenzione: nessuna imposta,
       nessun contributo. Oltre la soglia l'intero importo torna imponibile,
       quindi la simulazione si ferma alla soglia. */
    {
      const soglia = conFigli ? az.fringe_benefit_esente_con_figli : az.fringe_benefit_esente;
      const erogabile = Math.min(netto, soglia);
      const costo = erogabile;
      opzioni.push({
        id: 'fringe', modalita: 'Fringe benefit / beni e servizi',
        nettoDipendente: r2(erogabile), lordo: r2(erogabile),
        costoAzienda: r2(costo), costoDopoDeduzione: r2(costo * (1 - az.aliquota_ires)),
        efficienza: costo > 0 ? r2((erogabile / costo) * 100) : 0,
        limite: r2(soglia),
        parziale: netto > soglia,
        nota: netto > soglia
          ? `Il tetto di esenzione è ${fmtEuro(soglia)}${conFigli ? ' (con figli a carico)' : ''}: oltre quella soglia l'intero importo torna imponibile.`
          : `Entro il tetto di ${fmtEuro(soglia)} non paga né imposte né contributi.`
      });
    }

    /* 3 — Contributo del datore a previdenza complementare: non concorre
       al reddito del dipendente entro il tetto di deducibilità; l'azienda
       versa il contributo di solidarietà. Il netto arriva differito. */
    {
      const solidarieta = num(input.contributoSolidarieta, 0.10);
      const versabile = Math.min(netto, P.fondo_pensione.tetto_deducibilita);
      const costo = versabile * (1 + solidarieta);
      opzioni.push({
        id: 'previdenza', modalita: 'Contributo a previdenza complementare',
        nettoDipendente: r2(versabile), lordo: r2(versabile),
        costoAzienda: r2(costo), costoDopoDeduzione: r2(costo * (1 - az.aliquota_ires)),
        efficienza: costo > 0 ? r2((versabile / costo) * 100) : 0,
        limite: r2(P.fondo_pensione.tetto_deducibilita),
        differito: true,
        parziale: netto > P.fondo_pensione.tetto_deducibilita,
        nota: `Entro ${fmtEuro(P.fondo_pensione.tetto_deducibilita)} l'anno non concorre al reddito del dipendente. L'azienda versa il contributo di solidarietà del ${(solidarieta * 100).toFixed(0)}%. Il beneficio è differito alla pensione.`
      });
    }

    /* 4 — Premio di risultato con imposta sostitutiva agevolata.
       Richiede un accordo aziendale e un reddito sotto il limite. */
    {
      const ammesso = redditoDip <= az.premio_risultato_reddito_massimo;
      const tetto = az.premio_risultato_tetto;
      const aliqSost = az.premio_risultato_imposta_sostitutiva;
      const lordo = Math.min(netto / (1 - aliqSost - contrDip), tetto);
      const nettoEff = ammesso ? lordo * (1 - aliqSost - contrDip) : 0;
      const costo = ammesso ? lordo * (1 + contrDatore) : 0;
      opzioni.push({
        id: 'premio', modalita: 'Premio di risultato detassato',
        nettoDipendente: r2(nettoEff), lordo: r2(ammesso ? lordo : 0),
        costoAzienda: r2(costo), costoDopoDeduzione: r2(costo * (1 - az.aliquota_ires)),
        efficienza: costo > 0 ? r2((nettoEff / costo) * 100) : 0,
        limite: r2(tetto),
        ammesso,
        parziale: netto > tetto,
        nota: ammesso
          ? `Imposta sostitutiva del ${(aliqSost * 100).toFixed(0)}% invece dell'IRPEF, entro ${fmtEuro(tetto)}. Serve un accordo aziendale depositato.`
          : `Non applicabile: il reddito del dipendente supera ${fmtEuro(az.premio_risultato_reddito_massimo)}.`
      });
    }

    const validi = opzioni.filter(o => o.costoAzienda > 0);
    validi.sort((a, b) => b.efficienza - a.efficienza);

    return {
      nettoObiettivo: r2(netto),
      aliquotaMarginaleDipendente: aliqIrpef,
      opzioni,
      classifica: validi.map(o => o.id),
      migliore: validi.length ? validi[0].id : null,
      ipotesi: [
        `Aliquota marginale del dipendente ${(aliqIrpef * 100).toFixed(0)}%, addizionali medie ${(addiz * 100).toFixed(2)}%.`,
        `Contributi a carico azienda ipotizzati al ${(contrDatore * 100).toFixed(0)}% (variano per CCNL e inquadramento).`,
        `I costi sono indicati sia lordi sia al netto della deducibilità IRES del ${(az.aliquota_ires * 100).toFixed(0)}%.`
      ]
    };
  }

  /* ── Scenari ─────────────────────────────────────────────────────────── */

  /**
   * Esegue lo stesso calcolo nei tre scenari di rendimento.
   * Mostrare un numero solo su un orizzonte di trent'anni sarebbe falso.
   */
  function conScenari(fn, input, P) {
    const out = {};
    for (const chiave of ['pessimistico', 'atteso', 'ottimistico']) {
      const s = P.scenari[chiave];
      out[chiave] = {
        etichetta: s.etichetta,
        deltaRendimento: s.delta_rendimento,
        risultato: fn({ ...input, deltaRendimento: s.delta_rendimento }, P)
      };
    }
    return out;
  }

  /* ── Formattazione ───────────────────────────────────────────────────── */

  function fmtEuro(n, decimali) {
    const v = num(n);
    return new Intl.NumberFormat('it-IT', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: decimali == null ? 0 : decimali,
      maximumFractionDigits: decimali == null ? 0 : decimali
    }).format(v);
  }
  function fmtPerc(n, decimali) {
    return new Intl.NumberFormat('it-IT', {
      minimumFractionDigits: decimali == null ? 1 : decimali,
      maximumFractionDigits: decimali == null ? 1 : decimali
    }).format(num(n)) + '%';
  }

  /* ── Validazione input ───────────────────────────────────────────────── */

  /** Controlli minimi prima di mostrare numeri al cliente. */
  function validaPrivato(input) {
    const err = [];
    const eta = num(input.eta);
    if (eta < 18 || eta > 75) err.push('L\'età deve essere compresa tra 18 e 75 anni.');
    if (num(input.ral) <= 0) err.push('Indica la retribuzione annua lorda.');
    if (num(input.anniContributi) < 0) err.push('Gli anni di contributi non possono essere negativi.');
    if (num(input.anniContributi) > eta - 15) err.push('Gli anni di contributi non sono compatibili con l\'età indicata.');
    if (input.etaPensione != null && num(input.etaPensione) <= eta) err.push('L\'età di pensionamento deve essere successiva all\'età attuale.');
    return err;
  }

  function validaAzienda(input) {
    const err = [];
    if (num(input.dipendenti) < 1) err.push('Indica il numero di dipendenti.');
    if (num(input.monteRetributivo) <= 0) err.push('Indica il monte retributivo annuo lordo.');
    return err;
  }

  /* ── Esportazione ────────────────────────────────────────────────────── */

  return {
    // fiscalità
    irpefLorda, aliquotaMarginale, aliquotaMedia, nettoDaRal,
    // TFR
    quotaTfrAnnua, tassoRivalutazioneTfr, proiezioneTfrAzienda, tassazioneTfrAzienda,
    // fondo
    aliquotaRendimentiFondo, aliquotaPrestazioneFondo, proiezioneFondo,
    tassazionePrestazioneFondo, risparmioFiscaleAnnuo,
    // privato
    confrontoTfr, nettiPerAnno, pensionePubblica, montanteMaturato, coefficienteTrasformazione,
    aliquotaComputo, quotaRetributiva, versamentoPerColmareGap, confrontoProdotti,
    // azienda
    costoTfrAzienda, vantaggioConferimento, confrontoErogazione,
    // supporto
    conScenari, fmtEuro, fmtPerc, validaPrivato, validaAzienda
  };
});
