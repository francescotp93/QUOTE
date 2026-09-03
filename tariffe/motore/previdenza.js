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
var VERSIONE_REGOLE = '2026-09-01';

/* ── Le ipotesi ────────────────────────────────────────────────────────────
   `v` e' il valore usato dal calcolo. Il resto serve a mostrarlo a chi legge:
   `etichetta` sulla schermata, `unita` per formattare, `fonte` per rispondere
   alla domanda «e questo numero da dove esce?» senza aprire il codice.
   `modificabile:false` marca cio' che viene dalla legge e non si tocca. */
var IPOTESI = {
  coeffTfr: { v: 13.5, etichetta: 'Divisore del TFR', unita: '', modificabile: false,
    fonte: 'Art. 2120 c.c.: la quota annua e\' la retribuzione divisa per 13,5' },
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
  rivalTfr: { v: 0.0375, etichetta: 'Rivalutazione annua del TFR in azienda', unita: '%', modificabile: true,
    fonte: '1,5% fisso + 75% dell\'inflazione; con inflazione al 3% fa 3,75%' },
  /* ATTENZIONE — numero cambiato rispetto al Lab, ed e' l'unico.
     Il Lab usava 11%: e' l'aliquota in vigore FINO AL 2014. Dal 2015 (Legge di
     Stabilita' 2015) e' il 17%. Tenere l'11% sottostimava di circa un terzo il
     vantaggio dell'azienda su quella voce — un errore che gioca CONTRO la
     proposta, ma resta un errore. `daConfermare` resta acceso finche' qualcuno
     non lo verifica sul testo di legge: vedi `NUMERI_DA_CONFERMARE`. */
  aliqImpostaRival: { v: 0.17, etichetta: 'Imposta sostitutiva sulla rivalutazione', unita: '%', modificabile: false,
    daConfermare: true,
    fonte: 'Legge di Stabilita\' 2015: 17% (era 11% fino al 2014, valore che usava il Lab)' },
  inflazione: { v: 0.03, etichetta: 'Inflazione attesa', unita: '%', modificabile: true,
    fonte: 'Ipotesi: fa crescere il monte retributivo anno su anno' },
  rendFondo: { v: 0.035, etichetta: 'Rendimento netto del fondo', unita: '%', modificabile: true,
    fonte: 'Ipotesi prudenziale. Non e\' garantito e non e\' una promessa' },
  dedMax: { v: 5164.57, etichetta: 'Deduzione massima annua', unita: '€', modificabile: false,
    fonte: 'Art. 8 D.lgs. 252/2005, previdenza complementare' },
  aliqContributivaDipendente: { v: 0.33, etichetta: 'Aliquota contributiva (dipendente)', unita: '%', modificabile: true,
    fonte: 'Quota che finisce nel montante contributivo: 33% della retribuzione' },
  aliqContributivaAutonomo: { v: 0.24, etichetta: 'Aliquota contributiva (autonomo)', unita: '%', modificabile: true,
    fonte: 'Gestione separata / artigiani e commercianti, ordine di grandezza' },
  capitalizzazioneMontante: { v: 0.02, etichetta: 'Rivalutazione del montante', unita: '%', modificabile: true,
    fonte: 'Media quinquennale del PIL nominale. Ipotesi prudenziale' },
  crescitaReddito: { v: 0.02, etichetta: 'Crescita del reddito', unita: '%', modificabile: true,
    fonte: 'Ipotesi di carriera: quanto cresce lo stipendio ogni anno' },
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
    fonte: 'Tassazione separata: aliquota media dei 5 anni precedenti. Qui e\' un\'ipotesi, si corregge' },
  sogliaAdeguato: { v: 0.70, etichetta: 'Soglia «posizione adeguata»', unita: '%', modificabile: true,
    fonte: 'Quota del divario da coprire perche\' la posizione si consideri a posto' },
  sogliaParziale: { v: 0.33, etichetta: 'Soglia «copertura parziale»', unita: '%', modificabile: true,
    fonte: 'Sotto questa quota la copertura si considera insufficiente' },
};

/* Aliquota marginale IRPEF per scaglione. Serve al risparmio fiscale della
   deduzione: e' quella dell'ULTIMO euro di reddito, non la media. */
var SCAGLIONI_IRPEF = [
  { fino: 28000, aliquota: 0.23 },
  { fino: 50000, aliquota: 0.35 },
  { fino: Infinity, aliquota: 0.43 },
];
function aliquotaMarginale(reddito) {
  var r = Number(reddito) || 0;
  for (var i = 0; i < SCAGLIONI_IRPEF.length; i++) if (r <= SCAGLIONI_IRPEF[i].fino) return SCAGLIONI_IRPEF[i].aliquota;
  return SCAGLIONI_IRPEF[SCAGLIONI_IRPEF.length - 1].aliquota;
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
  return out;
}
var val = function (ip, k) { return ip[k].v; };

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
        ': la deduzione applicata e\' il ' + (percDed * 100).toFixed(0) + '%.',
      'Il monte retributivo cresce del ' + (val(ip, 'inflazione') * 100).toFixed(1).replace('.', ',') +
        '% l\'anno per l\'inflazione ipotizzata.',
      'L\'esonero dall\'imposta sulla rivalutazione parte dal secondo anno: nel primo non c\'e\' ancora TFR accantonato da rivalutare.',
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
  if (!eta || eta <= 0) problemi.push('Serve l\'eta\' della persona.');
  if (reddito <= 0) problemi.push('Serve il reddito annuo lordo.');
  if (isNaN(anniGia)) problemi.push('Servono gli anni di contributi gia\' versati.');
  if (eta && etaPensione && eta >= etaPensione) problemi.push('L\'eta\' di pensionamento deve essere successiva a quella attuale.');
  if (problemi.length) {
    return { ok: false, motivo: 'dati_insufficienti', problemi: problemi,
             versioneRegole: VERSIONE_REGOLE, ipotesi: ip, coefficienti: COEFFICIENTI };
  }

  /* La tabella si puo' sostituire dall'esterno: quando l'INPS pubblica il
     biennio nuovo, si aggiorna da li' senza toccare il codice. Chi la
     sostituisce si porta dietro anche il suo `daVerificare`: una tabella
     nuova non e' verificata solo perche' e' nuova. */
  var tabella = (d.coefficienti && d.coefficienti.perEta) ? d.coefficienti : COEFFICIENTI;
  var coeff = coefficientePerEta(etaPensione, tabella);
  if (coeff == null) {
    /* Diverso da «dati insufficienti»: i dati ci sono, e' la tabella che non
       copre quell'eta'. Dirlo con precisione evita che qualcuno cerchi
       l'errore nei dati del cliente. */
    return { ok: false, motivo: 'eta_fuori_tabella',
             problemi: ['Non ho il coefficiente di trasformazione per l\'eta\' ' + etaPensione +
                        '. La tabella copre da 57 a 71 anni.'],
             versioneRegole: VERSIONE_REGOLE, ipotesi: ip, coefficienti: COEFFICIENTI };
  }

  var anniMancanti = Math.round(etaPensione - eta);
  var aliquota = autonomo ? val(ip, 'aliqContributivaAutonomo') : val(ip, 'aliqContributivaDipendente');
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
    coefficienti: { biennio: tabella.biennio, daVerificare: tabella.daVerificare,
                    nota: tabella.nota, usato: coeff, eta: etaPensione },
    persona: { eta: eta, etaPensionamento: etaPensione, anniMancanti: anniMancanti,
               redditoOggi: reddito, redditoAllaPensione: redditoFinale, autonomo: autonomo },
    montante: montante,
    pensioneAnnua: pensioneAnnua,
    pensioneMensile: pensioneAnnua / 13,      // tredici mensilita'
    tassoSostituzione: tasso,
    gapAnnuo: gapAnnuo,
    gapMensile: gapAnnuo / 13,
    /* Gli avvisi della tabella viaggiano col risultato e finiscono sul report:
       «scaduto», «da ricontrollare», «valore derivato» sono cose che chi firma
       il foglio deve leggere, non cose da scoprire dopo. */
    avvisi: (tabella.daVerificare
      ? ['I coefficienti di trasformazione del biennio ' + tabella.biennio +
         ' non sono ancora stati verificati contro la fonte ufficiale: non consegnare questo calcolo a un cliente prima di averlo fatto.']
      : []).concat(tabella.avvisi || []),
    motivi: [
      'Pensione stimata col metodo contributivo: montante accumulato per il coefficiente di trasformazione a ' +
        etaPensione + ' anni (' + (coeff * 100).toFixed(3).replace('.', ',') + '%).',
      'Aliquota contributiva applicata: ' + (aliquota * 100).toFixed(0) + '% (' + (autonomo ? 'lavoratore autonomo' : 'lavoratore dipendente') + ').',
      montanteStimatoDaAnni
        ? 'Il montante gia\' maturato e\' STIMATO dagli anni di contributi al reddito attuale: se hai l\'estratto conto INPS, inseriscilo per un conto piu\' vicino al vero.'
        : 'Montante gia\' maturato preso dal dato inserito.',
      'Il reddito cresce del ' + (crescita * 100).toFixed(1).replace('.', ',') + '% l\'anno e il montante si rivaluta del ' +
        (capitalizzazione * 100).toFixed(1).replace('.', ',') + '%: sono ipotesi, si cambiano.',
      'Il tasso di sostituzione e\' calcolato sull\'ultimo reddito prima della pensione, non su quello di oggi.',
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
            'si tassa allo stesso modo. La differenza sta in cosa si puo\' riscattare e quando, e ' +
            'dipende dal regolamento del fondo: va chiesta al fondo, non calcolata qui.',
    },
    motivi: [
      'Aliquota finale nel fondo: ' + (aliqFondo * 100).toFixed(2).replace('.', ',') + '% dopo ' + anniAdesione +
        ' anni di adesione' + (sconto > 0 ? ' (15% meno lo sconto per gli anni oltre il quindicesimo)' : ' (nessuno sconto: servono piu\' di 15 anni)') + '.',
      'Aliquota sul TFR in azienda: ' + (aliqAzienda * 100).toFixed(0) + '%, tassazione separata. E\' un\'ipotesi sulla media IRPEF: si corregge.',
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

  /* La rendita si ricava con lo stesso coefficiente della pensione pubblica,
     non con una divisione: e' l'errore che c'era nel Lab. */
  var coeff = prospettiva.coefficienti.usato;
  var renditaAnnua = capitale * coeff;

  var dedotto = Math.min(annuo, val(ip, 'dedMax'));
  var marginale = aliquotaMarginale(prospettiva.persona.redditoOggi);
  return {
    versamentoMensile: mensile, versamentoAnnuo: annuo, anni: anni,
    capitale: capitale, renditaAnnua: renditaAnnua, renditaMensile: renditaAnnua / 13,
    dedotto: dedotto, oltreIlTetto: Math.max(0, annuo - val(ip, 'dedMax')),
    aliquotaMarginale: marginale,
    risparmioFiscaleAnnuo: dedotto * marginale,
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
      ? 'Il divario da coprire e\' di ' + Math.round(gap) + ' € l\'anno: e\' la differenza fra l\'ultimo reddito e la pensione stimata.'
      : 'Non c\'e\' divario da coprire: la pensione stimata copre gia\' l\'ultimo reddito.',
    'Con ' + sim.versamentoMensile + ' € al mese per ' + sim.anni + ' anni la rendita aggiuntiva stimata e\' di ' +
      Math.round(sim.renditaMensile) + ' € al mese, cioe\' il ' + Math.round(copertura * 100) + '% del divario.',
    'Il tasso di sostituzione passa dal ' + prospettiva.tassoSostituzione.toFixed(1).replace('.', ',') +
      '% al ' + tassoNuovo.toFixed(1).replace('.', ',') + '%.',
    'Risparmio fiscale: ' + Math.round(sim.risparmioFiscaleAnnuo) + ' € l\'anno, deducendo ' + Math.round(sim.dedotto) +
      ' € all\'aliquota marginale del ' + Math.round(sim.aliquotaMarginale * 100) + '%.' +
      (sim.oltreIlTetto > 0 ? ' Attenzione: ' + Math.round(sim.oltreIlTetto) + ' € l\'anno restano fuori dal tetto di deducibilita\'.' : ''),
  ];

  /* Le alternative si propongono SOLO se la posizione non e' adeguata. */
  var alternative = [];
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
    motivi.push('La posizione e\' adeguata: non vengono proposte alternative. Chi sta gia\' bene non ha bisogno che gli si venda di piu\'.');
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
  d = d || {};
  var pr = d.prospettiva, vl = d.valutazione;
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
    ? '<div class="sec">Se vuoi coprire di piu\'</div><table class="t"><tr><th>Versamento</th><th class="n">Copre</th>' +
      '<th class="n">Rendita in piu\'</th><th class="n">Risparmio fiscale</th></tr>' +
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

'<div class="sec">La situazione oggi</div>' +
'<div class="row"><span>Eta\'</span><b>' + esc(pr.persona.eta) + ' anni</b></div>' +
'<div class="row"><span>Pensione prevista a</span><b>' + esc(pr.persona.etaPensionamento) + ' anni</b></div>' +
'<div class="row"><span>Reddito annuo lordo</span><b>' + euro(pr.persona.redditoOggi) + '</b></div>' +
'<div class="row"><span>Reddito stimato all\'ultimo anno di lavoro</span><b>' + euro(pr.persona.redditoAllaPensione) + '</b></div>' +

'<div class="sec">Cosa succede alla pensione</div>' +
'<div class="row"><span>Pensione pubblica stimata</span><b>' + euro(pr.pensioneMensile) + ' al mese</b></div>' +
'<div class="row"><span>Quanto copre dell\'ultimo stipendio (tasso di sostituzione)</span><b>' + perc(pr.tassoSostituzione) + '</b></div>' +
'<div class="row"><span>Quanto manca ogni mese</span><b style="color:#c0392b">' + euro(pr.gapMensile) + '</b></div>' +
'<div class="box">Il divario da colmare e\' di <b>' + euro(pr.gapAnnuo) + ' all\'anno</b>. ' +
'E\' la differenza fra l\'ultimo stipendio e la pensione stimata, ed e\' la cifra su cui si misura tutto il resto di questo documento.</div>' +

'<div class="sec">La soluzione proposta</div>' +
'<div class="row"><span>Versamento</span><b>' + euro(vl.soluzione.versamentoMensile) + ' al mese per ' + esc(vl.soluzione.anni) + ' anni</b></div>' +
'<div class="row"><span>Costo complessivo nel periodo</span><b>' + euro(vl.soluzione.versamentoAnnuo * vl.soluzione.anni) + '</b></div>' +
'<div class="row"><span>Capitale stimato alla pensione</span><b>' + euro(vl.soluzione.capitale) + '</b></div>' +
'<div class="row"><span>Rendita aggiuntiva stimata</span><b>' + euro(vl.soluzione.renditaMensile) + ' al mese</b></div>' +
'<div class="row"><span>Risparmio fiscale</span><b style="color:#02984e">' + euro(vl.soluzione.risparmioFiscaleAnnuo) + ' all\'anno</b></div>' +
(vl.soluzione.oltreIlTetto > 0
  ? '<div class="warn">Di quanto versi, <b>' + euro(vl.soluzione.oltreIlTetto) + ' all\'anno</b> superano il tetto di deducibilita\' ' +
    'e non danno risparmio fiscale.</div>' : '') +

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
'<td class="f">Tabella INPS, biennio ' + esc(pr.coefficienti.biennio) + '</td></tr></table>' +

(avvisi.length ? '<div class="warn"><b>Da verificare prima della consegna:</b><ul style="margin:6px 0 0">' +
  avvisi.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>' : '') +

'<div class="firma"><b>' + esc(cons.nome) + '</b>' + (cons.ruolo ? ' — ' + esc(cons.ruolo) : '') +
(cons.rui ? '<br>Iscrizione RUI ' + esc(cons.rui) : '') +
((cons.email || cons.telefono) ? '<br>' + esc([cons.email, cons.telefono].filter(Boolean).join(' · ')) : '') +
'</div>' +

'<div class="note">Documento a fini illustrativi. I valori sono <b>stime orientative</b> costruite sulle ipotesi ' +
'riportate qui sopra, non impegni contrattuali: rendimenti e coefficienti possono cambiare, e con loro i risultati. ' +
'Non sostituisce la consulenza di un CAF, di un patronato o di un commercialista, ne\' la documentazione ' +
'precontrattuale del prodotto. Regole di calcolo versione ' + esc(vl.versioneRegole) + '.</div>' +

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
  aliquotaMarginale: aliquotaMarginale,
  simulaIntegrativa: simulaIntegrativa,
  valutaSoluzione: valutaSoluzione,
  reportPrevidenza: reportPrevidenza,
  numeriDaConfermare: numeriDaConfermare,
  numeriDiLegge: numeriDiLegge,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Previdenza = API;
})();
