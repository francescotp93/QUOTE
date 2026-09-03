// Collaudo della catena di montaggio dell'analisi previdenziale.
// Non tocca ne' server ne' database: analisiPrevidenziale() e' pura.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('./analisi.js').catch(() => ({}));
const manca = (nome) => { throw new Error(`server/analisi.js non esporta ${nome}`); };
const analisiPrevidenziale = M.analisiPrevidenziale || (() => manca('analisiPrevidenziale'));
const aliquotaDellaGestione = M.aliquotaDellaGestione || (() => manca('aliquotaDellaGestione'));
const coefficientePerEta = M.coefficientePerEta || (() => manca('coefficientePerEta'));
const rivalutazioneDiRiserva = M.rivalutazioneDiRiserva || (() => manca('rivalutazioneDiRiserva'));
const GESTIONI = M.GESTIONI || [];
const DA_COMPILARE = M.DA_COMPILARE || [];

// I numeri ufficiali, scritti qui come li scriverebbe la tabella.
const PAR = {
  aliquote_computo: { dipendenti_privati: 0.33, artigiani: 0.24, gs_professionisti: 0.25 },
  coefficienti_trasformazione: { 64: 0.05088, 65: 0.05250, 67: 0.05608, 71: 0.06510 },
  rivalutazione_montante: { 2021: 1, 2022: 1.009973, 2023: 1.023082, 2024: 1.036622, 2025: 1.040445 },
  tetto_deducibilita: 5164.57,
  tassazione_prestazione: { aliquotaBase: 0.15, aliquotaMinima: 0.09, riduzionePerAnno: 0.003, annoDaCuiSiRiduce: 15 },
  massimali: { massimale_contributivo: 122295 },
};
const PERSONA = {
  gestione: 'dipendenti_privati', etaOggi: 37, etaUscita: 67,
  redditoOggi: 30000, montanteIniziale: 40000,
  crescitaAnnua: 0.01, rendimento: 0.03, costiAnnui: 0.012, aliquotaIrpef: 0.35,
};
// NB: extra si sparge PRIMA, altrimenti sovrascrive la persona completa con le
// sole chiavi passate come scorciatoia — ed e' esattamente quello che fece.
const corri = (extra = {}) => analisiPrevidenziale({ ...extra, persona: { ...PERSONA, ...(extra.persona || {}) }, parametri: PAR });

// ── I numeri di legge non si indovinano ──────────────────────────────────────
test('la gestione senza aliquota in tabella dice quali gestioni ci sono', () => {
  assert.throws(() => aliquotaDellaGestione(PAR.aliquote_computo, 'coltivatori'),
    /coltivatori.*Ci sono.*dipendenti_privati/s);
});

test('l\'eta\' fuori dal decreto non viene interpolata: si alza un errore che dice fin dove arriva', () => {
  assert.throws(() => coefficientePerEta(PAR.coefficienti_trasformazione, 75), /da 64 a 71 anni/);
});

test('un\'eta\' che sta nel decreto ma in mezzo a un buco non prende il vicino', () => {
  // 66 non c'e' in questa tabella di prova: prendere il 65 o il 67 sarebbe un
  // coefficiente inventato su un preventivo.
  assert.throws(() => coefficientePerEta(PAR.coefficienti_trasformazione, 66), /coefficiente di trasformazione per 66 anni/);
});

test('il parametro mancante del tutto dice dove si mette', () => {
  assert.throws(() => coefficientePerEta(undefined, 67), /Parametri previdenziali/);
  assert.throws(() => aliquotaDellaGestione(undefined, 'artigiani'), /Parametri previdenziali/);
});

// ── La rivalutazione futura ──────────────────────────────────────────────────
test('la media di riserva e\' geometrica, non aritmetica', () => {
  const r = rivalutazioneDiRiserva({ 2024: 1.10, 2025: 1.20 }, 2);
  // aritmetica darebbe 0.15; la geometrica e' sqrt(1.1*1.2)-1
  assert.ok(Math.abs(r.tasso - (Math.sqrt(1.1 * 1.2) - 1)) < 1e-12);
  assert.ok(r.tasso < 0.15, 'la geometrica sta sotto l\'aritmetica');
});

test('la media di riserva usa gli anni piu\' recenti e li dice', () => {
  const r = rivalutazioneDiRiserva(PAR.rivalutazione_montante, 3);
  assert.deepEqual(r.anni, [2023, 2024, 2025]);
  assert.match(r.comE, /2023.*2025/);
});

test('un anno scritto come percentuale invece che come coefficiente viene respinto', () => {
  // 1,75 invece di 1.0175: sarebbe +75% all'anno, e nessun controllo di
  // plausibilita' lo prenderebbe per un errore se non si guarda l'unita'.
  assert.throws(() => rivalutazioneDiRiserva({ 2025: 0 }, 1), /2025/);
});

test('senza rivalutazione scelta si usa quella di riserva, e l\'analisi lo dichiara', () => {
  const a = corri();
  assert.match(a.comERivalutazione, /scelta di riserva/);
  const r = rivalutazioneDiRiserva(PAR.rivalutazione_montante, 5);
  assert.equal(a.rivalutazioneAttesa, r.tasso);
});

test('con la rivalutazione scelta dall\'operatore vince quella, e si vede', () => {
  const a = corri({ persona: { rivalutazioneAttesa: 0.02 } });
  assert.equal(a.rivalutazioneAttesa, 0.02);
  assert.match(a.comERivalutazione, /operatore/);
});

// ── La catena ────────────────────────────────────────────────────────────────
test('l\'analisi completa restituisce i numeri che servono al foglio', () => {
  const a = corri();
  assert.equal(a.anni, 30);
  assert.ok(a.montante > 0);
  assert.ok(a.pensioneAnnua > 0);
  assert.ok(Math.abs(a.pensioneMensile - a.pensioneAnnua / 13) < 1e-9, 'la mensile e\' su 13 rate');
  assert.ok(a.tassoSostituzione > 0 && a.tassoSostituzione < 1);
  assert.equal(a.coefficiente, 0.05608);
  assert.equal(a.aliquota, 0.33);
});

test('il montante non e\' la somma dei contributi: la rivalutazione si vede a parte', () => {
  const a = corri();
  assert.ok(a.rivalutazioneMaturata > 0);
  assert.ok(Math.abs(a.montante - (a.contributi + a.rivalutazioneMaturata + 40000)) < 1e-6,
    'montante = contributi + rivalutazione + montante iniziale');
});

test('l\'obiettivo di riserva e\' l\'80% dell\'ultimo reddito', () => {
  const a = corri();
  assert.equal(a.obiettivo.tipo, 'percentuale');
  assert.ok(Math.abs(a.obiettivo.annuo - a.ultimoReddito * 0.8) < 1e-9);
});

test('l\'obiettivo in percentuale scritto come 80 invece di 0.8 viene respinto', () => {
  assert.throws(() => corri({ obiettivo: { tipo: 'percentuale', valore: 80 } }), /frazione fra 0 e 1/);
});

test('l\'obiettivo in euro viene preso per quello che e\'', () => {
  const a = corri({ obiettivo: { tipo: 'euro', valore: 24000 } });
  assert.equal(a.obiettivo.annuo, 24000);
  assert.ok(Math.abs(a.gapAnnuo - (24000 - a.pensioneAnnua)) < 1e-9);
});

test('se la pensione basta gia\', il versamento e\' zero e non un numero negativo', () => {
  const a = corri({ obiettivo: { tipo: 'euro', valore: 1 } });
  assert.ok(a.gapAnnuo < 0);
  assert.equal(a.versamento.annuo, 0);
});

// ── Il massimale contributivo ────────────────────────────────────────────────
test('il reddito alto viene tagliato al massimale, e il montante ne tiene conto', () => {
  const ricco = { redditoOggi: 200000 };
  const conTetto = corri({ persona: ricco });
  const senzaTetto = corri({ persona: { ...ricco, soggettoAlMassimale: false } });
  assert.ok(conTetto.montante < senzaTetto.montante, 'senza massimale il montante e\' piu\' alto');
  assert.ok(conTetto.massimaleApplicato > 0);
});

test('il reddito sotto il massimale non viene toccato', () => {
  const a = corri();
  const b = corri({ persona: { soggettoAlMassimale: false } });
  assert.ok(Math.abs(a.montante - b.montante) < 1e-6);
});

// ── Le scelte di modello ─────────────────────────────────────────────────────
test('l\'ordine italiano da\' un montante piu\' basso di quello del fondo', () => {
  const it = corri();
  const fondo = corri({ scelte: { ordine: 'contribuisci-poi-rivaluta' } });
  assert.ok(fondo.montante > it.montante);
  assert.equal(it.ordine, 'rivaluta-poi-contribuisci');
});

// ── Il fisco ─────────────────────────────────────────────────────────────────
test('quello che supera il tetto di deducibilita\' si vede come eccedenza, non sparisce', () => {
  // Un buco grosso porta il versamento sopra il tetto.
  const a = corri({ obiettivo: { tipo: 'euro', valore: 200000 } });
  assert.ok(a.versamento.annuo > 5164.57);
  assert.ok(a.fisco.eccedenza > 0);
  assert.ok(Math.abs(a.fisco.dedotto - 5164.57) < 1e-9, 'si deduce fino al tetto e non oltre');
  assert.ok(Math.abs(a.fisco.risparmio - 5164.57 * 0.35) < 1e-6);
});

test('l\'aliquota della prestazione scende con gli anni di permanenza', () => {
  const a = corri();                                   // 30 anni
  const b = corri({ persona: { etaOggi: 57 } });       // 10 anni
  assert.ok(a.aliquotaFinale < b.aliquotaFinale);
  assert.equal(b.aliquotaFinale, 0.15, 'sotto i 15 anni non c\'e\' sconto');
});

// ── Quello che non si calcola ────────────────────────────────────────────────
test('chi e\' gia\' oltre l\'eta\' di uscita riceve una spiegazione, non un conto', () => {
  assert.throws(() => corri({ persona: { etaOggi: 67 } }), /non resta nessun anno/);
  assert.throws(() => corri({ persona: { etaOggi: 70 } }), /non resta nessun anno/);
});

test('i dati mancanti vengono elencati con l\'etichetta, non con la chiave', () => {
  assert.throws(
    () => analisiPrevidenziale({ persona: { gestione: 'artigiani', etaOggi: 40 }, parametri: PAR }),
    /Età di uscita prevista.*Reddito annuo lordo di oggi/s
  );
});

test('il montante iniziale e\' facoltativo: senza, il conto parte da zero', () => {
  const a = corri({ persona: { montanteIniziale: '' } });
  assert.ok(a.montante > 0);
  assert.ok(a.montante < corri().montante);
});

test('le ipotesi commerciali non hanno un valore di riserva nel codice', () => {
  const obbligatorie = M.IPOTESI_OBBLIGATORIE || [];
  // Senza questa riga il controllo passerebbe a vuoto su un elenco vuoto: un
  // collaudo che non gira non e' un collaudo verde, e' un collaudo assente.
  assert.equal(obbligatorie.length, 4, 'le ipotesi commerciali obbligatorie sono quattro');
  for (const k of obbligatorie) {
    assert.throws(() => corri({ persona: { [k]: '' } }), new RegExp('Mancano dei dati'),
      `${k} deve essere obbligatoria: e' un'ipotesi commerciale, non la puo' scegliere il programmatore`);
  }
});

// ── L'elenco e la tabella devono combaciare ──────────────────────────────────
test('ogni gestione dell\'elenco ha un\'aliquota nella tabella vera', () => {
  // Le chiavi dell'elenco sono quelle con cui il parametro e' scritto in
  // tabella: se qualcuno rinomina una delle due, questo controllo lo dice.
  const vere = { dipendenti_privati: 1, dipendenti_pubblici: 1, artigiani: 1, commercianti: 1,
    gs_professionisti: 1, gs_collaboratori: 1, gs_con_altra_copertura: 1 };
  assert.ok(GESTIONI.length >= 7);
  for (const g of GESTIONI) {
    assert.ok(vere[g.k], `la gestione «${g.k}» non esiste fra le chiavi di aliquote_computo`);
    assert.ok(g.l && g.l.length > 3, `la gestione «${g.k}» non ha un'etichetta leggibile`);
  }
});

test('ogni voce da compilare ha etichetta e tipo', () => {
  assert.ok(DA_COMPILARE.length >= 9);
  for (const c of DA_COMPILARE) {
    assert.ok(c.k && c.l && c.tipo, 'voce incompleta: ' + JSON.stringify(c));
  }
});

test('nessun numero di legge e\' scritto dentro analisi.js', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('./analisi.js', import.meta.url), 'utf8')
    .split('\n').filter(r => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');
  for (const n of ['5164', '0.33', '0.05608', '122295', '0.15']) {
    assert.ok(!src.includes(n), `il numero ${n} e' scritto dentro analisi.js: i numeri di legge stanno in tabella`);
  }
});

// ── Gli avvisi sui parametri usati ───────────────────────────────────────────
const avvisiSuiParametri = M.avvisiSuiParametri || (() => manca('avvisiSuiParametri'));
const OGGI = new Date('2026-09-03T10:00:00Z');
const SCHEDE = {
  buono:   { chiave: 'buono',   scade_il: '2027-12-31', ricontrolla_il: '2027-11-15' },
  scaduto: { chiave: 'scaduto', scade_il: '2026-06-30' },
  vecchio: { chiave: 'vecchio', ricontrolla_il: '2026-02-15' },
  ricavato:{ chiave: 'ricavato', derivato: true },
};

test('un parametro in corso non genera avvisi', () => {
  assert.deepEqual(avvisiSuiParametri(SCHEDE, ['buono'], OGGI), []);
});

test('un parametro scaduto lo dice, con la data', () => {
  const a = avvisiSuiParametri(SCHEDE, ['scaduto'], OGGI);
  assert.equal(a.length, 1);
  assert.equal(a[0].come, 'scaduto');
  assert.match(a[0].testo, /2026-06-30/);
});

test('un parametro da ricontrollare e\' un avviso piu\' leggero dello scaduto', () => {
  assert.equal(avvisiSuiParametri(SCHEDE, ['vecchio'], OGGI)[0].come, 'da_ricontrollare');
});

test('un valore derivato viene segnalato ogni volta che si usa', () => {
  const a = avvisiSuiParametri(SCHEDE, ['ricavato'], OGGI);
  assert.equal(a[0].come, 'derivato');
  assert.match(a[0].testo, /commercialista/);
});

test('un parametro che non c\'e\' in tabella e\' un avviso, non un silenzio', () => {
  const a = avvisiSuiParametri(SCHEDE, ['sparito'], OGGI);
  assert.equal(a[0].come, 'manca');
});

test('il calcolo non si blocca per un parametro scaduto: l\'avviso viaggia col risultato', () => {
  // Se l'ISTAT pubblica in ritardo, l'agenzia deve poter lavorare. Ma il foglio
  // deve dire con che numeri e' stato fatto il conto.
  const a = avvisiSuiParametri(SCHEDE, ['scaduto', 'buono'], OGGI);
  assert.equal(a.length, 1, 'solo quello scaduto');
});
