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
const INFL = 0.03, COEFF_TFR = 13.5, PERC_DED4 = 0.04, PERC_FDO_GAR = 0.002,
      PERC_ONERI = 0.0028, PERC_RIVAL = 0.0375, ALIQ_IMPOSTA_RIVAL = 0.11;

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

/* ── riepilogo ───────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Parita previdenza: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
