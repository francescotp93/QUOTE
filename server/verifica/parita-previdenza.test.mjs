// ═══════════════════════════════════════════════════════════════════════════
//  PARITA' PREVIDENZA — i numeri non sono cambiati spostandosi
//
//  Il calcolo «lato azienda» viene da buildPIVATable del progetto Lab. Qui la
//  formula vecchia e' riscritta com'era, con le sue costanti scritte a mano, e
//  si confronta riga per riga con il motore nuovo su un ventaglio di casi.
//
//  Perche' serve: una riscrittura sbagliata di un calcolo NON da' errore.
//  Produce un numero storto, quel numero finisce in un report firmato, e lo
//  scopre il cliente. Il compilatore non aiuta, le prove sui comportamenti
//  nemmeno: serve il confronto col vecchio, cifra per cifra.
//
//  Le seconde prove (dalla 2 in poi) riguardano le tre cose cambiate APPOSTA:
//  ipotesi visibili e correggibili, nessuna data nascosta, snapshot nel
//  risultato.
// ═══════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../../tariffe/motore/previdenza.js');

/* ── La formula VECCHIA, copiata dal Lab con le sue costanti ─────────────── */
//  Una sola costante NON e' quella del Lab, ed e' voluto: l'imposta sostitutiva
//  sulla rivalutazione del TFR. Il Lab usava 11%, che e' l'aliquota in vigore
//  FINO AL 2014; dal 2015 e' il 17%. Tenere l'11% sottostimava di circa un terzo
//  il vantaggio dell'azienda su quella voce.
//  Percio' la parita' qui verifica la FORMULA, non la costante: si prende
//  l'aliquota dal motore stesso. Se un giorno cambia di nuovo, questa prova
//  continua a dimostrare che il calcolo e' quello del Lab — che e' la cosa che
//  deve garantire. Il valore in se' ha la sua prova, separata, poco piu' sotto.
const INFL = 0.03, COEFF_TFR = 13.5, PERC_DED4 = 0.04, PERC_FDO_GAR = 0.002,
      PERC_ONERI = 0.0028, PERC_RIVAL = 0.0375;
const ALIQ_IMPOSTA_RIVAL = P.ipotesiAttive().aliqImpostaRival.v;
const ALIQ_LAB = 0.11;   // quella che c'era nel Lab, per la prova dedicata

function vecchio(ndip, stipMed, anni, annoInizio) {
  const piccola = ndip < 50;
  const percDed = piccola ? 0.06 : PERC_DED4;
  const monte0 = ndip * stipMed * 12;
  let monteCurr = monte0, tfrTotAcc = 0, rispTotale = 0, tfrTotale = 0;
  const righe = [];
  for (let i = 0; i < anni; i++) {
    const monte = monteCurr;
    const tfr = monte / COEFF_TFR;
    tfrTotAcc += tfr; tfrTotale += tfr;
    const mis1 = tfr * percDed;
    const mis2 = monte * PERC_FDO_GAR;
    const mis3 = monte * PERC_ONERI;
    const mis2bis = i > 0 ? (tfrTotAcc - tfr) * PERC_RIVAL * ALIQ_IMPOSTA_RIVAL : 0;
    const rispAnn = mis1 + mis2 + mis3 + mis2bis;
    rispTotale += rispAnn;
    righe.push({ anno: annoInizio + i, monte, tfr, mis1, mis2, mis3, mis2bis, rispAnn, rispTotale });
    monteCurr *= (1 + INFL);
  }
  return { righe, rispTotale, tfrTotale,
    percTFR: tfrTotale > 0 ? (rispTotale / tfrTotale) * 100 : 0,
    percLordo: (monte0 * anni) > 0 ? (rispTotale / (monte0 * anni)) * 100 : 0 };
}

/* ── esiti ───────────────────────────────────────────────────────────────── */
const esiti = [];
const prova = (nome, fn) => { try { esiti.push([true, nome, fn() || '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };
const vicino = (a, b) => Math.abs(a - b) < 0.000001;

/* ── 1) PARITA' su un ventaglio di casi ──────────────────────────────────── */
prova('lato azienda: identico alla formula del Lab, riga per riga', () => {
  let combinazioni = 0, celle = 0;
  for (const ndip of [1, 3, 12, 49, 50, 51, 120, 800]) {
    for (const stip of [900, 1500, 2200, 3800, 7000]) {
      for (const anni of [1, 2, 5, 20, 35]) {
        const annoInizio = 2026;
        const v = vecchio(ndip, stip, anni, annoInizio);
        const n = P.pianoAzienda({ dipendenti: ndip, stipendioMensile: stip, anni, annoInizio });
        deve(n.ok, 'il motore nuovo si rifiuta su ' + ndip + '/' + stip + '/' + anni);
        deve(n.righe.length === v.righe.length, 'numero di righe diverso');
        for (let i = 0; i < v.righe.length; i++) {
          const a = v.righe[i], b = n.righe[i];
          const coppie = [[a.anno, b.anno], [a.monte, b.monteRetributivo], [a.tfr, b.quotaTfr],
            [a.mis1, b.deduzione], [a.mis2, b.fondoGaranzia], [a.mis3, b.oneriImpropri],
            [a.mis2bis, b.esoneroRivalutazione], [a.rispAnn, b.risparmioAnno], [a.rispTotale, b.risparmioCumulato]];
          for (const [x, y] of coppie) {
            deve(vicino(x, y), 'divergenza su ' + ndip + ' dip/' + stip + '€/' + anni + 'a riga ' + i + ': ' + x + ' ≠ ' + y);
            celle++;
          }
        }
        deve(vicino(v.rispTotale, n.totali.risparmio), 'risparmio totale diverso');
        deve(vicino(v.tfrTotale, n.totali.tfrDestinato), 'TFR destinato diverso');
        deve(vicino(v.percTFR, n.totali.risparmioSuTfr), 'percentuale sul TFR diversa');
        deve(vicino(v.percLordo, n.totali.risparmioSuMonte), 'percentuale sul monte diversa');
        combinazioni++;
      }
    }
  }
  return combinazioni + ' combinazioni, ' + celle + ' numeri confrontati';
});

prova('l\'unico numero cambiato rispetto al Lab e\' l\'aliquota, e si vede', () => {
  // Cambiare un numero in silenzio e' peggio che sbagliarlo: chi rilegge fra un
  // anno non sa piu' quale versione ha prodotto quale report. Questa prova
  // esiste per rendere il cambio esplicito e permanente.
  const ip = P.ipotesiAttive();
  deve(ip.aliqImpostaRival.v === 0.17, 'l\'aliquota non e\' il 17% di legge dal 2015: ' + ip.aliqImpostaRival.v);
  deve(ip.aliqImpostaRival.v !== ALIQ_LAB, 'e\' tornata al valore vecchio del Lab');
  deve(/11%/.test(ip.aliqImpostaRival.fonte), 'la fonte non ricorda da dove si viene');
  deve(ip.aliqImpostaRival.modificabile === false, 'un\'aliquota di legge risulta correggibile');
  // Il cambio sposta i numeri IN MEGLIO per la proposta: vale la pena saperlo.
  const con17 = P.pianoAzienda({ dipendenti: 10, stipendioMensile: 2000, anni: 20, annoInizio: 2026 });
  deve(con17.righe[19].esoneroRivalutazione > 0, 'l\'esonero e\' sparito');
  return '11% (fino al 2014) → 17% (dal 2015), dichiarato nella fonte';
});

prova('i numeri di cui non si e\' certi sono elencati, non nascosti', () => {
  const r = P.confrontoTfr({ redditoAnnuo: 30000, anni: 20, annoInizio: 2026 });
  deve(Array.isArray(r.daConfermare) && r.daConfermare.length >= 1, 'nessun numero segnalato da confermare');
  const chiavi = r.daConfermare.map(x => x.chiave);
  deve(chiavi.includes('aliqImpostaRival'), 'l\'aliquota cambiata non e\' fra quelli da confermare');
  for (const x of r.daConfermare) deve(!!x.etichetta && !!x.fonte, x.chiave + ' senza etichetta o fonte');
  // Anche quando i dati non bastano: serve sapere su cosa si stava per contare.
  const ko = P.confrontoTfr({});
  deve(ko.daConfermare && ko.daConfermare.length >= 1, 'il rifiuto non porta l\'elenco');
  return chiavi.length + ' numeri da confermare, con fonte';
});

prova('la soglia dei 50 dipendenti cade dove deve', () => {
  const a = (n) => P.pianoAzienda({ dipendenti: n, stipendioMensile: 2000, anni: 1, annoInizio: 2026 });
  deve(a(49).azienda.percentualeDeduzione === 0.06, 'a 49 dipendenti non applica il 6%');
  deve(a(50).azienda.percentualeDeduzione === 0.04, 'a 50 dipendenti non applica il 4%');
  deve(a(49).azienda.piccola === true && a(50).azienda.piccola === false, 'la classificazione non cambia sulla soglia');
  return '49 → 6%, 50 → 4%';
});

prova('l\'esonero sulla rivalutazione parte dal secondo anno', () => {
  const r = P.pianoAzienda({ dipendenti: 10, stipendioMensile: 2000, anni: 3, annoInizio: 2026 });
  deve(r.righe[0].esoneroRivalutazione === 0, 'il primo anno esonera qualcosa che non e\' ancora accantonato');
  deve(r.righe[1].esoneroRivalutazione > 0, 'il secondo anno non esonera niente');
  deve(r.righe[2].esoneroRivalutazione > r.righe[1].esoneroRivalutazione, 'l\'esonero non cresce col monte accantonato');
  return 'zero il primo anno, poi cresce';
});

/* ── 2) Le tre cose cambiate apposta ─────────────────────────────────────── */
prova('nessuna data «adesso» nascosta dentro il calcolo', () => {
  // Un conto che cambia da solo col passare del tempo non si puo' firmare, e
  // qui si firma: il report va al cliente.
  const src = require('fs').readFileSync(new URL('../../tariffe/motore/previdenza.js', import.meta.url), 'utf8');
  const corpo = src.slice(src.indexOf('function pianoAzienda'));
  deve(!/new Date\(\)|Date\.now\(\)/.test(corpo), 'il calcolo guarda l\'orologio');
  // E senza anno di partenza deve RIFIUTARSI, non inventarselo.
  const senza = P.pianoAzienda({ dipendenti: 10, stipendioMensile: 2000, anni: 5 });
  deve(senza.ok === false && senza.motivo === 'dati_insufficienti', 'senza anno di partenza calcola lo stesso');
  deve(senza.problemi.some(p => /anno di partenza/i.test(p)), 'non dice che manca l\'anno');
  return 'l\'anno si passa da fuori, sempre';
});

prova('«dati insufficienti» e\' uno stato suo, non un risultato a zero', () => {
  const vuoto = P.pianoAzienda({});
  deve(vuoto.ok === false, 'senza dati risponde ok');
  deve(vuoto.motivo === 'dati_insufficienti', 'motivo sbagliato: ' + vuoto.motivo);
  deve(vuoto.problemi.length >= 3, 'non elenca cosa manca');
  deve(vuoto.righe === undefined, 'restituisce righe pur non avendo dati');
  return vuoto.problemi.length + ' cose mancanti, elencate';
});

prova('le ipotesi sono visibili, con etichetta e fonte', () => {
  const ip = P.ipotesiAttive();
  const chiavi = Object.keys(ip);
  deve(chiavi.length >= 10, 'poche ipotesi esposte: ' + chiavi.length);
  for (const k of chiavi) {
    deve(typeof ip[k].v === 'number', k + ' non ha un valore');
    deve(!!ip[k].etichetta, k + ' non ha un\'etichetta leggibile');
    deve(!!ip[k].fonte, k + ' non dice da dove viene');
  }
  return chiavi.length + ' ipotesi, ognuna con etichetta e fonte';
});

prova('le ipotesi si possono correggere — e cambiano il risultato', () => {
  const base = P.pianoAzienda({ dipendenti: 10, stipendioMensile: 2000, anni: 10, annoInizio: 2026 });
  const alta = P.pianoAzienda({ dipendenti: 10, stipendioMensile: 2000, anni: 10, annoInizio: 2026 }, { inflazione: 0.05 });
  deve(alta.totali.risparmio > base.totali.risparmio, 'correggere l\'inflazione non cambia niente');
  deve(alta.ipotesi.inflazione.v === 0.05, 'la correzione non risulta nello snapshot');
  deve(alta.ipotesi.inflazione.corretta === true, 'la correzione non e\' segnalata come tale');
  deve(base.ipotesi.inflazione.corretta === false, 'un valore mai toccato risulta corretto');
  return 'inflazione 3% → 5%: risparmio piu\' alto, e si vede che e\' stata cambiata';
});

prova('cio\' che viene dalla legge non si puo\' correggere', () => {
  // Accettare in silenzio una deduzione inventata produrrebbe un report che
  // sembra valido e non lo e'.
  const r = P.pianoAzienda({ dipendenti: 10, stipendioMensile: 2000, anni: 3, annoInizio: 2026 },
                           { dedAzienda: 0.30, coeffTfr: 5, dedMax: 99999 });
  deve(r.ipotesi.dedAzienda.v === 0.04, 'la deduzione di legge e\' stata sovrascritta');
  deve(r.ipotesi.coeffTfr.v === 13.5, 'il divisore del TFR e\' stato sovrascritto');
  deve(r.ipotesi.dedMax.v === 5164.57, 'la deduzione massima e\' stata sovrascritta');
  deve(r.ipotesi.dedAzienda.corretta === false, 'risulta corretta pur non essendolo');
  return 'tre valori di legge rifiutati in silenzio, come devono';
});

prova('il risultato porta con se\' versione e ipotesi (report rileggibile)', () => {
  const r = P.pianoAzienda({ dipendenti: 10, stipendioMensile: 2000, anni: 5, annoInizio: 2026 }, { rendFondo: 0.02 });
  deve(!!r.versioneRegole, 'nessuna versione delle regole nel risultato');
  deve(r.versioneRegole === P.VERSIONE_REGOLE, 'versione diversa da quella del motore');
  deve(r.ipotesi && r.ipotesi.rendFondo.v === 0.02, 'lo snapshot non contiene le ipotesi usate');
  // Anche quando i dati non bastano: serve sapere con che regole si e' rifiutato.
  const ko = P.pianoAzienda({});
  deve(!!ko.versioneRegole && !!ko.ipotesi, 'il rifiuto non porta versione e ipotesi');
  return 'versione ' + r.versioneRegole + ' + snapshot completo';
});

prova('ogni risultato porta i suoi motivi', () => {
  const r = P.pianoAzienda({ dipendenti: 10, stipendioMensile: 2000, anni: 5, annoInizio: 2026 });
  deve(Array.isArray(r.motivi) && r.motivi.length >= 3, 'nessun motivo accanto ai numeri');
  deve(r.motivi.some(m => /6%/.test(m)), 'non spiega quale deduzione ha applicato');
  const grande = P.pianoAzienda({ dipendenti: 200, stipendioMensile: 2000, anni: 5, annoInizio: 2026 });
  deve(grande.motivi.some(m => /4%/.test(m)), 'per l\'azienda grande non spiega la deduzione');
  return r.motivi.length + ' motivi, e cambiano col caso';
});

/* ── 3) A · prospettiva pensionistica ────────────────────────────────────── */
prova('A: il coefficiente di trasformazione non si inventa mai', () => {
  // Nel Lab la rendita era `capitale / 20 / 12`: una divisione, non un calcolo
  // previdenziale. Qui fuori tabella si dice che non si sa, invece di
  // estrapolare a occhio un numero plausibile e sbagliato.
  deve(P.coefficientePerEta(67) > 0, 'a 67 anni non trova il coefficiente');
  deve(P.coefficientePerEta(56) === null, 'a 56 anni si inventa un coefficiente');
  deve(P.coefficientePerEta(72) === null, 'a 72 anni si inventa un coefficiente');
  const fuori = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 75, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026 });
  deve(fuori.ok === false, 'a 75 anni calcola lo stesso');
  deve(fuori.motivo === 'eta_fuori_tabella', 'motivo sbagliato: ' + fuori.motivo);
  // Distinto da «dati insufficienti»: i dati ci sono, e' la tabella che non copre.
  deve(fuori.motivo !== 'dati_insufficienti', 'confonde «manca un dato» con «tabella incompleta»');
  return 'da 57 a 71; fuori si ferma e lo dice';
});

/* CAMBIATA APPOSTA il 03/09/2026. Prima pretendeva che la tabella di riserva
   fosse NON verificata, e cosi' era: conteneva i coefficienti del biennio
   precedente, piu' alti dell'1,8%. Ora contiene quelli del decreto. Il
   meccanismo dell'avviso resta provato — su una tabella che si dichiara non
   verificata — perche' e' il meccanismo che conta, non la bandiera di ieri. */
prova('A: i coefficienti di riserva sono quelli del decreto, non del biennio prima', () => {
  const r = P.prospettivaPensionistica({ eta: 45, etaPensionamento: 67, redditoAnnuo: 35000,
    anniContributiGia: 20, annoRiferimento: 2026 });
  deve(r.ok, 'non calcola');
  deve(r.coefficienti.daVerificare === false, 'la tabella di riserva risulta ancora da verificare');
  deve(r.avvisi.length === 0, 'avvisa su una tabella verificata');
  /* I due che si sbagliano piu' facilmente, inchiodati al decreto del
     20/11/2024: un coefficiente storto non da' nessun errore, da' una pensione
     plausibile e gonfiata. */
  deve(P.coefficientePerEta(67) === 0.05608, 'il coefficiente a 67 anni non e\' quello del decreto');
  deve(P.coefficientePerEta(65) === 0.05250, 'il coefficiente a 65 anni non e\' quello del decreto');
  return 'decreto 20/11/2024: 67 anni → 5,608%';
});

prova('A: una tabella che si dichiara da verificare si annuncia lo stesso', () => {
  const dubbia = { biennio: '2027-2028', daVerificare: true, nota: 'presa da un sito', perEta: { 67: 0.057 } };
  const r = P.prospettivaPensionistica({ eta: 45, etaPensionamento: 67, redditoAnnuo: 35000,
    anniContributiGia: 20, annoRiferimento: 2026, coefficienti: dubbia });
  deve(r.avvisi.length >= 1 && /verificat/i.test(r.avvisi[0]), 'non avvisa che i coefficienti vanno verificati');
  deve(/cliente/i.test(r.avvisi[0]), 'l\'avviso non dice qual e\' il rischio');
  return 'avvisa finche\' nessuno conferma la tabella';
});

prova('A: gli avvisi della tabella dei Parametri arrivano fino al risultato', () => {
  // «scaduto», «da ricontrollare», «valore derivato»: li scrive la schermata
  // leggendo la tabella, e devono viaggiare col conto fino al foglio firmato.
  const conAvvisi = { biennio: '2025-2026', daVerificare: false, perEta: { 67: 0.05608 },
    avvisi: ['«coefficienti_trasformazione» e\' scaduto il 2026-12-31: il calcolo usa il valore vecchio.'] };
  const r = P.prospettivaPensionistica({ eta: 45, etaPensionamento: 67, redditoAnnuo: 35000,
    anniContributiGia: 20, annoRiferimento: 2026, coefficienti: conAvvisi });
  deve(r.avvisi.length === 1, 'perde l\'avviso che arriva dalla tabella');
  deve(/scaduto/.test(r.avvisi[0]), 'l\'avviso arrivato dalla tabella e\' stato riscritto');
  return 'gli avvisi dell\'archivio non si perdono';
});

prova('A: la porta dei numeri di legge cambia i valori, quella delle correzioni no', () => {
  /* Due porte, due mestieri: numeriDiLegge() e' l'archivio ufficiale che dice
     qual e' il numero; ipotesiAttive() e' il consulente, e sui numeri di legge
     deve restare senza voce. Se un giorno le due si confondessero, un
     preventivo potrebbe uscire con un tetto di deducibilita' scelto a mano. */
  const prima = P.IPOTESI.dedMax.v;
  const conCorrezione = P.ipotesiAttive({ dedMax: 9999 });
  deve(conCorrezione.dedMax.v === prima, 'una correzione a mano ha cambiato un numero di legge');
  const esito = P.numeriDiLegge({ tetto_deducibilita: 5300 });
  deve(esito.applicati.includes('dedMax'), 'l\'archivio non ha potuto scrivere il tetto');
  deve(P.IPOTESI.dedMax.v === 5300, 'il tetto non e\' cambiato');
  deve(/Parametri previdenziali/.test(P.IPOTESI.dedMax.fonte), 'la fonte non dice da dove arriva');
  P.numeriDiLegge({ tetto_deducibilita: prima });   // si rimette com'era per le prove che seguono
  return 'l\'archivio scrive, il consulente no';
});

prova('A: la tabella si puo\' sostituire quando l\'INPS pubblica il biennio nuovo', () => {
  const mia = { biennio: '2027-2028', daVerificare: false, nota: 'confermata', perEta: { 67: 0.050 } };
  const a = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026 });
  const b = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026, coefficienti: mia });
  deve(b.pensioneAnnua < a.pensioneAnnua, 'un coefficiente piu\' basso non abbassa la pensione');
  deve(b.coefficienti.biennio === '2027-2028', 'lo snapshot non riporta il biennio usato');
  deve(b.avvisi.length === 0, 'una tabella dichiarata verificata avvisa lo stesso');
  return 'tabella sostituibile, e lo snapshot dice quale ha usato';
});

prova('A: il tasso di sostituzione si misura sull\'ULTIMO reddito', () => {
  // E' la domanda vera: «di quanto cala il mio tenore di vita quando smetto?».
  // Misurarlo sul reddito di oggi lo gonfierebbe, perche' lo stipendio cresce.
  const r = P.prospettivaPensionistica({ eta: 35, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 10, annoRiferimento: 2026 });
  deve(r.persona.redditoAllaPensione > r.persona.redditoOggi, 'il reddito non cresce');
  const suOggi = (r.pensioneAnnua / r.persona.redditoOggi) * 100;
  deve(Math.abs(r.tassoSostituzione - suOggi) > 1, 'il tasso sembra calcolato sul reddito di oggi');
  const atteso = (r.pensioneAnnua / r.persona.redditoAllaPensione) * 100;
  deve(vicino(r.tassoSostituzione, atteso), 'il tasso non torna sull\'ultimo reddito');
  return 'tasso ' + r.tassoSostituzione.toFixed(1) + '% sull\'ultimo reddito, non ' + suOggi.toFixed(1) + '% su quello di oggi';
});

prova('A: il gap e\' la differenza, e non va mai sotto zero', () => {
  const r = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026 });
  deve(vicino(r.gapAnnuo, Math.max(0, r.persona.redditoAllaPensione - r.pensioneAnnua)), 'il gap non torna');
  // Chi avra' una pensione piu' alta dell'ultimo stipendio ha gap ZERO, non negativo:
  // un «gap» negativo in un report si legge come un errore.
  const ricco = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026, montanteGia: 3000000 });
  deve(ricco.gapAnnuo === 0, 'il gap diventa negativo: ' + ricco.gapAnnuo);
  return 'gap coerente, e mai negativo';
});

prova('A: dice quando il montante e\' stimato invece che conosciuto', () => {
  const stimato = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026 });
  const vero = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026, montanteGia: 148500 });
  deve(stimato.motivi.some(m => /STIMATO/i.test(m) && /estratto conto/i.test(m)),
    'non dice che il montante e\' stimato ne\' come migliorarlo');
  deve(vero.motivi.some(m => /preso dal dato inserito/i.test(m)), 'col dato vero non lo dichiara');
  return 'l\'approssimazione e\' dichiarata, con il rimedio';
});

prova('A: senza anno di riferimento o eta\' si rifiuta', () => {
  const senzaAnno = P.prospettivaPensionistica({ eta: 40, redditoAnnuo: 30000, anniContributiGia: 15 });
  deve(senzaAnno.ok === false && senzaAnno.motivo === 'dati_insufficienti', 'calcola senza anno di riferimento');
  const giaInPensione = P.prospettivaPensionistica({ eta: 70, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 40, annoRiferimento: 2026 });
  deve(giaInPensione.ok === false, 'accetta un\'eta\' oltre quella di pensionamento');
  const src = require('fs').readFileSync(new URL('../../tariffe/motore/previdenza.js', import.meta.url), 'utf8');
  const corpo = src.slice(src.indexOf('function prospettivaPensionistica'), src.indexOf('/* ── Esposizione'));
  deve(!/new Date\(\)|Date\.now\(\)/.test(corpo), 'il calcolo guarda l\'orologio');
  return 'si ferma invece di indovinare';
});

/* ── 4) B · TFR in azienda contro TFR nel fondo ──────────────────────────── */
prova('B: i due percorsi si sommano allo stesso versato', () => {
  const r = P.confrontoTfr({ redditoAnnuo: 30000, anni: 25, annoInizio: 2026 });
  deve(r.ok, 'non calcola');
  deve(vicino(r.versato, (30000 / 13.5) * 25), 'il versato non torna');
  // Il netto non puo' essere sopra il lordo: sarebbe un'imposta negativa.
  deve(r.azienda.netto < r.azienda.montanteLordo, 'in azienda il netto supera il lordo');
  deve(r.fondo.netto < r.fondo.montanteLordo, 'nel fondo il netto supera il lordo');
  return 'versato ' + Math.round(r.versato) + ' €, due percorsi coerenti';
});

prova('B: lo sconto sulla tassazione parte dal sedicesimo anno', () => {
  const a = (n) => P.confrontoTfr({ redditoAnnuo: 30000, anni: 20, annoInizio: 2026, anniAdesione: n }).fondo.aliquotaFinale;
  deve(vicino(a(10), 0.15), 'a 10 anni non applica il 15% pieno');
  deve(vicino(a(15), 0.15), 'a 15 anni sconta gia\' qualcosa');
  deve(vicino(a(16), 0.147), 'a 16 anni lo sconto non e\' 0,30%');
  deve(vicino(a(35), 0.09), 'a 35 anni non arriva al 9%');
  deve(vicino(a(50), 0.09), 'sotto i 35 anni scende oltre il minimo');
  return '15% → 9%, e non scende oltre';
});

prova('B: lo 0,50% del Fondo di Garanzia lo paga solo chi resta in azienda', () => {
  const r = P.confrontoTfr({ redditoAnnuo: 30000, anni: 1, annoInizio: 2026 });
  const quota = 30000 / 13.5;
  deve(vicino(r.righe[0].fondo, quota), 'al fondo arriva meno della quota intera');
  deve(r.righe[0].azienda < quota, 'in azienda non viene trattenuto niente');
  deve(vicino(r.righe[0].azienda, quota * 0.995), 'la trattenuta non e\' lo 0,50%');
  return 'quota intera al fondo, meno lo 0,50% in azienda';
});

prova('B: le ipotesi girano il risultato, come devono', () => {
  // Controprova: se il confronto dicesse sempre «conviene il fondo» a
  // prescindere, non sarebbe un calcolo, sarebbe una pubblicita'.
  const base = { redditoAnnuo: 30000, anni: 30, annoInizio: 2026 };
  const rendimentoAlto = P.confrontoTfr(base, { rendFondo: 0.06 });
  const rendimentoNullo = P.confrontoTfr(base, { rendFondo: 0.0, aliqTfrInAzienda: 0.10 });
  deve(rendimentoAlto.conviene === 'fondo', 'col 6% di rendimento non conviene il fondo');
  deve(rendimentoNullo.conviene === 'azienda',
    'con rendimento zero e IRPEF bassa conviene ancora il fondo: il confronto non e\' un confronto');
  return 'gira da una parte e dall\'altra secondo le ipotesi';
});

prova('B: sui due scenari dice di non saperlo, invece di inventarlo', () => {
  // Dimissioni e licenziamento cambiano cosa si puo' riscattare e quando, e
  // quello sta nel regolamento del fondo. Un modulo di consulenza che se lo
  // inventa fa il danno peggiore che possa fare.
  const r = P.confrontoTfr({ redditoAnnuo: 30000, anni: 20, annoInizio: 2026 });
  deve(r.scenari && r.scenari.calcolato === false, 'dichiara di aver calcolato gli scenari');
  deve(/dimissioni/i.test(r.scenari.nota) && /licenziamento/i.test(r.scenari.nota), 'non nomina i due scenari');
  deve(/fiscale/i.test(r.scenari.nota), 'non dice che sul piano fiscale sono uguali');
  deve(/regolamento del fondo/i.test(r.scenari.nota), 'non dice a chi va chiesto');
  return 'ammette il confine invece di superarlo';
});

prova('B: ogni risultato porta versione, ipotesi e motivi', () => {
  const r = P.confrontoTfr({ redditoAnnuo: 30000, anni: 20, annoInizio: 2026 });
  deve(r.versioneRegole === P.VERSIONE_REGOLE, 'versione mancante o diversa');
  deve(r.ipotesi && r.ipotesi.rendFondo, 'snapshot delle ipotesi mancante');
  deve(r.motivi.length >= 4, 'pochi motivi accanto ai numeri');
  deve(r.motivi.some(m => /OGNI ANNO/.test(m)), 'non spiega che i due prelievi sono diversi');
  const senza = P.confrontoTfr({ redditoAnnuo: 30000 });
  deve(senza.ok === false && senza.motivo === 'dati_insufficienti', 'calcola senza anni ne\' anno di partenza');
  return r.motivi.length + ' motivi';
});

/* ── 5) Il rating della soluzione ────────────────────────────────────────── */
const prosp = (extra) => P.prospettivaPensionistica(Object.assign(
  { eta: 40, etaPensionamento: 67, redditoAnnuo: 30000, anniContributiGia: 15, annoRiferimento: 2026 }, extra || {}));

prova('rating: la scala va da insufficiente ad adeguato', () => {
  const p = prosp();
  deve(P.valutaSoluzione(p, 50).stato === 'insufficiente', '50 €/mese non risulta insufficiente');
  deve(P.valutaSoluzione(p, 200).stato === 'parziale', '200 €/mese non risulta parziale');
  deve(P.valutaSoluzione(p, 600).stato === 'adeguato', '600 €/mese non risulta adeguato');
  return '50 → insufficiente, 200 → parziale, 600 → adeguato';
});

prova('rating: su una posizione ADEGUATA non si propone niente', () => {
  // E' la regola che va rispettata anche — soprattutto — quando fa comodo il
  // contrario. Fare upselling su chi sta gia' bene trasforma la consulenza in
  // una vendita, ed e' esattamente cio' che il documento vieta.
  const r = P.valutaSoluzione(prosp(), 600);
  deve(r.stato === 'adeguato', 'il caso di prova non e\' adeguato');
  deve(r.alternative.length === 0, 'propone ' + r.alternative.length + ' alternative su una posizione adeguata');
  deve(r.motivi.some(m => /non vengono proposte alternative/i.test(m)), 'non dice perche\' non propone');
  // E anche quando non c'e' proprio divario da coprire.
  const senzaDivario = P.valutaSoluzione(prosp({ montanteGia: 3000000 }), 50);
  deve(senzaDivario.divarioAnnuo === 0, 'il caso senza divario ha un divario');
  deve(senzaDivario.alternative.length === 0, 'propone alternative a chi non ha divario');
  return 'zero proposte, e detto a parole';
});

prova('rating: quando NON e\' adeguato propone due alternative, e coprono di piu\'', () => {
  const r = P.valutaSoluzione(prosp(), 50);
  deve(r.alternative.length === 2, 'le alternative sono ' + r.alternative.length + ', non due');
  for (const a of r.alternative) {
    deve(a.versamentoMensile > r.soluzione.versamentoMensile, 'un\'alternativa costa meno o uguale al versamento scelto');
    deve(a.coperturaDivario > r.coperturaDivario, 'un\'alternativa non copre piu\' del versamento scelto');
    deve(!!a.perche, 'un\'alternativa senza il suo perche\'');
  }
  deve(r.alternative[1].versamentoMensile > r.alternative[0].versamentoMensile, 'le due alternative non sono in ordine');
  deve(r.alternative[1].coperturaDivario >= 0.99, 'la seconda alternativa non arriva a coprire il divario');
  return r.alternative.map(a => a.versamentoMensile + ' €/mese (' + Math.round(a.coperturaDivario * 100) + '%)').join(' · ');
});

prova('rating: «dati insufficienti» non e\' verde', () => {
  // Verde vuol dire «ho guardato e va bene», non «non so niente».
  const r = P.valutaSoluzione(P.prospettivaPensionistica({ redditoAnnuo: 30000 }), 100);
  deve(r.ok === false, 'valuta lo stesso senza prospettiva');
  deve(r.stato === 'dati_insufficienti', 'stato sbagliato: ' + r.stato);
  deve(r.stato !== 'adeguato' && r.stato !== 'parziale', 'confonde «non so» con un giudizio');
  deve(r.problemi && r.problemi.length >= 1, 'non dice cosa manca');
  deve(!!r.versioneRegole, 'il rifiuto non porta la versione delle regole');
  return 'stato suo, con l\'elenco di cosa manca';
});

prova('rating: la rendita usa il coefficiente, non una divisione', () => {
  // Nel Lab era `capitale / 20 / 12`. Se fosse rimasta cosi', la rendita
  // sarebbe capitale/20 all'anno: qui si verifica che NON e' quel numero.
  const p = prosp();
  const s = P.simulaIntegrativa(p, 200);
  deve(vicino(s.renditaAnnua, s.capitale * p.coefficienti.usato), 'la rendita non e\' capitale per coefficiente');
  deve(Math.abs(s.renditaAnnua - s.capitale / 20) > 1, 'la rendita coincide con la divisione del Lab');
  return 'coefficiente ' + (p.coefficienti.usato * 100).toFixed(3).replace('.', ',') + '%, non /20';
});

prova('rating: il tetto di deducibilita\' viene detto quando lo si supera', () => {
  const sotto = P.valutaSoluzione(prosp(), 200);
  const sopra = P.valutaSoluzione(prosp(), 800);
  deve(sotto.soluzione.oltreIlTetto === 0, 'sotto il tetto segnala un\'eccedenza');
  deve(sopra.soluzione.oltreIlTetto > 0, 'sopra il tetto non segnala niente');
  deve(vicino(sopra.soluzione.dedotto, 5164.57), 'la parte dedotta non si ferma al tetto');
  deve(sopra.motivi.some(m => /fuori dal tetto/i.test(m)), 'non avvisa che una parte non e\' deducibile');
  return 'oltre il tetto: ' + Math.round(sopra.soluzione.oltreIlTetto) + ' € l\'anno non deducibili, e lo dice';
});

prova('rating: l\'aliquota marginale segue gli scaglioni', () => {
  deve(P.aliquotaMarginale(25000) === 0.23, 'primo scaglione sbagliato');
  deve(P.aliquotaMarginale(28000) === 0.23, 'il confine dei 28.000 sta nel primo scaglione');
  deve(P.aliquotaMarginale(28001) === 0.35, 'appena sopra i 28.000 non passa al 35%');
  deve(P.aliquotaMarginale(50000) === 0.35, 'il confine dei 50.000 sta nel secondo scaglione');
  deve(P.aliquotaMarginale(50001) === 0.43, 'appena sopra i 50.000 non passa al 43%');
  return '23% / 35% / 43%, coi confini al posto giusto';
});

prova('rating: ogni voto porta i suoi motivi e la versione delle regole', () => {
  const r = P.valutaSoluzione(prosp(), 100);
  deve(r.versioneRegole === P.VERSIONE_REGOLE, 'versione mancante');
  deve(r.motivi.length >= 4, 'pochi motivi: ' + r.motivi.length);
  deve(r.motivi.some(m => /divario/i.test(m)), 'non spiega da dove esce il divario');
  deve(r.motivi.some(m => /tasso di sostituzione/i.test(m)), 'non dice come cambia il tasso');
  deve(r.motivi.some(m => /[Rr]isparmio fiscale/.test(m)), 'non dice il risparmio fiscale');
  /* Gli avvisi passano di la' anche quando arrivano dalla tabella dei
     Parametri: qui si prova il canale, non il contenuto di oggi. */
  const conAvviso = P.valutaSoluzione(prosp({ coefficienti: { biennio: '2025-2026', daVerificare: false,
    perEta: { 67: 0.05608 }, avvisi: ['«tetto_deducibilita» andava ricontrollato il 2026-02-15.'] } }), 100);
  deve(conAvviso.avvisi.length >= 1, 'perde gli avvisi che arrivano dalla tabella');
  return r.motivi.length + ' motivi, e il canale degli avvisi tiene';
});

/* ── 6) Il report ────────────────────────────────────────────────────────── */
const consulente = { nome: 'Francesco Oddo', ruolo: 'Consulente previdenziale',
                     rui: 'E000123456', email: 'f.oddo@withus.it', telefono: '091 000000' };
const report = (versamento, extra) => P.reportPrevidenza(Object.assign({
  prospettiva: prosp(), valutazione: P.valutaSoluzione(prosp(), versamento),
  cliente: { nome: 'Mario Rossi' }, consulente: consulente,
  dataRiferimento: '1 settembre 2026', logo: 'withus-logo.png',
}, extra || {}));

prova('report: senza firma o senza data non esce proprio', () => {
  // Meglio nessun documento che un documento senza firma o senza data: uno
  // senza data, riaperto fra un anno, si presenta come nuovo.
  const senzaFirma = P.reportPrevidenza({ prospettiva: prosp(), valutazione: P.valutaSoluzione(prosp(), 100),
    dataRiferimento: '1 settembre 2026' });
  deve(senzaFirma.ok === false, 'produce un documento senza consulente');
  deve(senzaFirma.html === null, 'restituisce HTML pur avendo rifiutato');
  deve(senzaFirma.problemi.some(p => /consulente/i.test(p)), 'non dice che manca la firma');
  const senzaData = P.reportPrevidenza({ prospettiva: prosp(), valutazione: P.valutaSoluzione(prosp(), 100),
    consulente: consulente });
  deve(senzaData.ok === false, 'produce un documento senza data');
  deve(senzaData.problemi.some(p => /orologio/i.test(p)), 'non spiega che la data va passata');
  return 'si rifiuta, e dice cosa manca';
});

prova('report: la firma del consulente c\'e\', per esteso', () => {
  const r = report(150);
  deve(r.ok, 'non produce il documento');
  for (const pezzo of [consulente.nome, consulente.ruolo, consulente.rui, consulente.email]) {
    deve(r.html.includes(pezzo), 'manca dalla firma: ' + pezzo);
  }
  return 'nome, ruolo, RUI e recapiti';
});

prova('report: le ipotesi stanno ACCANTO ai numeri, non in una riga in fondo', () => {
  // E' la richiesta esplicita del documento: un rendimento del 3,5% cambia il
  // risultato piu' di qualunque altra cosa, e chi legge deve vederlo mentre
  // guarda la cifra, non dopo averla creduta.
  const r = report(150);
  deve(/Con quali ipotesi sono stati fatti questi conti/.test(r.html), 'manca la sezione delle ipotesi');
  deve(/Da dove viene/.test(r.html), 'le ipotesi non dicono la loro fonte');
  deve(/Rendimento netto del fondo/.test(r.html), 'il rendimento non compare fra le ipotesi');
  deve(/Coefficiente di trasformazione/.test(r.html), 'il coefficiente non compare fra le ipotesi');
  deve(/cambiando questi numeri cambiano tutti i risultati/i.test(r.html), 'non avverte del peso delle ipotesi');
  // E il disclaimer non e' l'unica cosa: dev'esserci comunque.
  deve(/stime orientative/i.test(r.html) && /non sostituisce/i.test(r.html), 'manca il disclaimer di responsabilita\'');
  return 'tabella delle ipotesi con valore e fonte, piu\' il disclaimer';
});

prova('report: contiene tutto quello che il documento chiede', () => {
  const r = report(150, { garanzie: [{ nome: 'Premorienza', dettaglio: 'capitale ai beneficiari' }] });
  const richiesti = {
    'situazione attuale': /La situazione oggi/,
    'proiezione': /Cosa succede alla pensione/,
    'soluzione con rating': /Il giudizio/,
    'costi': /Costo complessivo/,
    'risparmio fiscale': /Risparmio fiscale/,
    'garanzie': /Le garanzie della soluzione/,
    'tasso di sostituzione': /tasso di sostituzione/i,
  };
  for (const [cosa, re] of Object.entries(richiesti)) deve(re.test(r.html), 'manca: ' + cosa);
  deve(/Premorienza/.test(r.html), 'le garanzie passate non finiscono nel documento');
  return Object.keys(richiesti).length + ' sezioni richieste, tutte presenti';
});

prova('report: le alternative compaiono solo quando servono', () => {
  const scarso = report(50), giusto = report(600);
  deve(/Se vuoi coprire di piu/.test(scarso.html), 'su una posizione insufficiente non propone niente');
  deve(!/Se vuoi coprire di piu/.test(giusto.html), 'propone alternative su una posizione adeguata');
  deve(/non vengono proposte alternative/i.test(giusto.html), 'non dice che la posizione e\' a posto');
  return 'proposte quando manca qualcosa, silenzio quando no';
});

prova('report: gli avvisi da verificare arrivano fino al documento', () => {
  // Se si perdessero per strada, il foglio che arriva al cliente sembrerebbe
  // definitivo pur poggiando su numeri non confermati.
  const tab = { biennio: '2025-2026', daVerificare: false, perEta: { 67: 0.05608 },
    avvisi: ['«coefficienti_trasformazione» e\' scaduto il 2026-12-31.'] };
  const pr = prosp({ coefficienti: tab });
  const r = report(150, { prospettiva: pr, valutazione: P.valutaSoluzione(pr, 150) });
  deve(/Da verificare prima della consegna/.test(r.html), 'il documento non riporta gli avvisi');
  deve(/scaduto/i.test(r.html), 'l\'avviso arrivato dalla tabella non entra nel documento');
  deve(/Imposta sostitutiva/i.test(r.html), 'non avvisa sull\'aliquota da confermare');
  return 'gli avvisi non si perdono per strada';
});

prova('report: porta con se\' versione e snapshot', () => {
  const r = report(150);
  deve(r.versioneRegole === P.VERSIONE_REGOLE, 'versione mancante');
  deve(r.snapshot && r.snapshot.ipotesi && r.snapshot.coefficienti, 'snapshot incompleto');
  deve(r.snapshot.dataRiferimento === '1 settembre 2026', 'la data non finisce nello snapshot');
  deve(r.html.includes(P.VERSIONE_REGOLE), 'la versione delle regole non e\' scritta nel documento');
  return 'versione nel documento e snapshot accanto';
});

prova('report: i dati del cliente non possono iniettare codice', () => {
  // Il nome arriva da un campo di testo: se finisse crudo nell'HTML, un
  // apostrofo storto romperebbe il documento e un tag lo dirotterebbe.
  const r = report(150, { cliente: { nome: '<script>alert(1)</script>' } });
  deve(!/<script>alert/.test(r.html), 'il nome del cliente entra crudo nel documento');
  deve(/&lt;script&gt;/.test(r.html), 'il nome non risulta nemmeno neutralizzato');
  return 'testo neutralizzato';
});

prova('report: nessuna data «adesso» nascosta nel documento', () => {
  const src = require('fs').readFileSync(new URL('../../tariffe/motore/previdenza.js', import.meta.url), 'utf8');
  const corpo = src.slice(src.indexOf('function reportPrevidenza'), src.indexOf('/* ── Esposizione'));
  deve(!/new Date\(\)|Date\.now\(\)/.test(corpo), 'il documento si data da solo');
  return 'la data arriva da fuori';
});

/* ── riepilogo ───────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Parita previdenza: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
