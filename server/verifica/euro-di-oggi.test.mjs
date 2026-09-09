// ═══════════════════════════════════════════════════════════════════════════
//  EURO DI OGGI, E TASSI CHE NON SI CONTRADDICONO
//
//  Due guasti che si tenevano in piedi a vicenda.
//
//  F-09. I risultati erano in euro del 2060 e il versamento in euro di oggi.
//  «Verso 50 al mese e ottengo 170 al mese» metteva a confronto una cifra che
//  il cliente sente adesso con una che vale 77 di adesso: il beneficio
//  percepito era gonfiato di circa due volte. E «prenderai 2.836 al mese», su
//  uno stipendio di 1.846, faceva concludere che la pensione basta e avanza.
//
//  F-09 bis (la correzione strutturale). Non basta deflazionare: i tassi
//  nominali vanno COSTRUITI come (1 + inflazione) × (1 + reale). Con la
//  crescita del reddito al 2% nominale e l'inflazione al 2%, lo stipendio
//  reale è FERMO — e il modulo lo presentava come una carriera che cresce.
//  È il controllo che apre questo file, ed è quello che deve fallire per primo
//  se qualcuno rimette un tasso nominale scritto a mano.
//
//  F-10. Il coefficiente di trasformazione di oggi veniva usato anche per chi
//  esce nel 2060. È agganciato alla speranza di vita e scende: ogni punto di
//  sovrastima è un punto di divario che sparisce dal foglio.
// ═══════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../../tariffe/motore/previdenza.js');

const esiti = [];
const prova = (nome, fn) => { try { esiti.push([true, nome, fn() || '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };
const vicino = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 0.0001 : eps);

const CURVA = { obiettivo: 0.050, etaRiferimento: 67, anno: 2060 };
const caso = (extra) => P.prospettivaPensionistica(Object.assign(
  { eta: 33, etaPensionamento: 67, redditoAnnuo: 24000, anniContributiGia: 9, annoRiferimento: 2026 }, extra || {}));

/* ── IL CONTROLLO CHE DEVE FALLIRE SE LA STRUTTURA NON REGGE ─────────────── */

prova('col default lo stipendio reale sta FERMO, ed è esattamente quello dichiarato', () => {
  /* Il controllo chiesto da Francesco il 04/09/2026 diceva il contrario — che
     lo stipendio reale doveva crescere — perché il default era 1%. Portato a
     zero il 09/09/2026, quello che va protetto è l'altra metà della stessa
     struttura: a crescita reale zero l'ultimo stipendio in euro di oggi deve
     essere IDENTICO a quello dichiarato, non un centesimo meno.
     Non è pignoleria: finché il reddito di riferimento veniva preso all'ultimo
     anno lavorato e poi deflazionato fino alla data di pensione, restava un
     anno di inflazione di scarto — e sul foglio si leggeva «stipendio di oggi
     2.000, ultimo stipendio 1.961», che non si spiega a un cliente. */
  const p = caso();
  deve(vicino(p.reale.redditoAllaPensione, p.persona.redditoOggi, 0.01),
    'a crescita reale zero l\'ultimo stipendio reale non è quello di oggi: ' +
    Math.round(p.reale.redditoAllaPensione) + ' contro ' + Math.round(p.persona.redditoOggi));
  deve(vicino(p.reale.redditoAllaPensioneMensile, p.reale.redditoOggiMensile, 0.01),
    'le due mensili dello stipendio non coincidono a crescita zero');
  return Math.round(p.reale.redditoOggiMensile) + ' € al mese, ieri e all\'uscita';
});

prova('la componente reale è cablata davvero: alzandola lo stipendio cresce di quella', () => {
  // La controprova dell'altro verso: se la struttura regge, la crescita reale
  // deve comparire tutta e sola nell'ultimo stipendio deflazionato.
  const cresce = P.prospettivaPensionistica({ eta: 33, etaPensionamento: 67, redditoAnnuo: 24000,
    anniContributiGia: 9, annoRiferimento: 2026 }, { crescitaRealeReddito: 0.01 });
  const atteso = cresce.persona.redditoOggi * Math.pow(1.01, cresce.persona.anniMancanti);
  deve(vicino(cresce.reale.redditoAllaPensione, atteso, 1),
    'la crescita reale non è quella dichiarata: ' + Math.round(cresce.reale.redditoAllaPensione) +
    ' contro ' + Math.round(atteso));
  deve(cresce.reale.redditoAllaPensione > caso().reale.redditoAllaPensione, 'la componente reale non fa differenza');
  return '24.000 € → ' + Math.round(cresce.reale.redditoAllaPensione) + ' € con l\'1% reale';
});

/* ── I TASSI SI COSTRUISCONO, NON SI SCRIVONO ────────────────────────────── */

prova('la crescita nominale è (1+inflazione)×(1+reale), non la somma', () => {
  const ip = P.ipotesiAttive();
  deve(vicino(ip.crescitaReddito.v, (1 + ip.inflazione.v) * (1 + ip.crescitaRealeReddito.v) - 1),
    'la crescita nominale non è composta: ' + ip.crescitaReddito.v);
  /* Col default a zero somma e prodotto coincidono: la differenza si vede solo
     su una componente reale diversa da zero, ed è lì che va cercata. La somma
     darebbe 0,03 esatto, la composizione dà 0,0302. */
  const con = P.ipotesiAttive({ crescitaRealeReddito: 0.01 });
  deve(vicino(con.crescitaReddito.v, 1.02 * 1.01 - 1), 'con l\'1% reale la nominale non è composta');
  deve(!vicino(con.crescitaReddito.v, con.inflazione.v + con.crescitaRealeReddito.v, 0.0001),
    'sta sommando inflazione e componente reale invece di comporle');
  return (con.crescitaReddito.v * 100).toFixed(2) + '% nominale con l\'1% reale (la somma darebbe 3,00%)';
});

prova('la rivalutazione del montante si costruisce allo stesso modo', () => {
  const ip = P.ipotesiAttive();
  deve(vicino(ip.capitalizzazioneMontante.v, (1 + ip.inflazione.v) * (1 + ip.crescitaRealePIL.v) - 1),
    'la rivalutazione del montante non è composta');
});

prova('la rivalutazione del TFR è calcolata, non più cablata', () => {
  // art. 2120 c.c.: 1,5% fisso + 75% dell'inflazione. Con un valore scritto a
  // mano, cambiare l'inflazione lasciava il TFR fermo — due ipotesi che si
  // contraddicono dentro lo stesso foglio.
  const ip = P.ipotesiAttive();
  deve(vicino(ip.rivalTfr.v, ip.rivalTfrFissa.v + ip.rivalTfrQuotaInflazione.v * ip.inflazione.v),
    'la rivalutazione del TFR non segue la formula dell\'art. 2120 c.c.');
  const alta = P.ipotesiAttive({ inflazione: 0.04 });
  deve(alta.rivalTfr.v > ip.rivalTfr.v, 'alzando l\'inflazione il TFR resta fermo: è ancora cablato');
  deve(vicino(alta.rivalTfr.v, 0.015 + 0.75 * 0.04), 'con inflazione al 4% il TFR non fa 4,5%');
  return (ip.rivalTfr.v * 100).toFixed(2) + '% con inflazione al ' + (ip.inflazione.v * 100).toFixed(0) + '%';
});

prova('il rendimento del fondo resta nominale, e il reale si misura sul NETTO', () => {
  /* Cambiata il 05/09/2026 con F-11. Prima il reale si scorporava dal
     rendimento LORDO: era il modo piu' elegante di raccontarsi che i costi e
     l'imposta non ci sono. Adesso si scende prima al netto — lordo meno ISC,
     poi imposta sulla parte positiva — e il reale si misura su quello.
     IL CASO CHE DEVE FALLIRE: se qualcuno riportasse il reale sul lordo, la
     prima uguaglianza qui sotto salterebbe. */
  const ip = P.ipotesiAttive();
  /* Il 4,5% COVIP dal 05/09/2026: il 3,5% era il numero di quando questa riga
     si chiamava «netto», e tenerlo sul lordo avrebbe abbassato due volte lo
     stesso rendimento. */
  deve(ip.rendFondo.v === 0.045, 'il rendimento lordo non è più il 4,5% COVIP pattuito');
  const netto = P.rendimentoNettoFondo(ip.rendFondo.v, ip.iscComparto.v, ip.tassaRendimentiFondo.v);
  deve(vicino(ip.rendFondoNetto.v, netto), 'il netto non è lordo meno costi meno imposta');
  deve(vicino(ip.rendFondoReale.v, (1 + netto) / (1 + ip.inflazione.v) - 1),
    'il rendimento reale non è scorporato dal NETTO');
  deve(!vicino(ip.rendFondoReale.v, (1 + ip.rendFondo.v) / (1 + ip.inflazione.v) - 1),
    'il reale è tornato a misurarsi sul lordo: costi e imposta sparirebbero dal foglio');
  deve(ip.rendFondoNetto.v < ip.rendFondo.v, 'il netto non è più basso del lordo');
  // Con inflazione alta il rendimento reale diventa negativo, e si deve vedere.
  deve(P.ipotesiAttive({ inflazione: 0.05 }).rendFondoReale.v < 0,
    'con inflazione al 5% un fondo al 4,5% lordo non risulta in perdita reale');
  return (ip.rendFondo.v * 100).toFixed(2) + '% lordo → ' + (netto * 100).toFixed(2) + '% netto = ' +
    (ip.rendFondoReale.v * 100).toFixed(2) + '% reale';
});

prova('cambiando l\'inflazione TUTTO la segue, in un colpo solo', () => {
  const base = P.ipotesiAttive(), alta = P.ipotesiAttive({ inflazione: 0.05 });
  for (const k of ['crescitaReddito', 'capitalizzazioneMontante', 'rivalTfr']) {
    deve(alta[k].v > base[k].v, k + ' non segue l\'inflazione: è rimasto un tasso scritto a mano');
  }
  deve(alta.rendFondoReale.v < base.rendFondoReale.v, 'il rendimento reale non scende con l\'inflazione');
});

prova('le derivate non si correggono a mano', () => {
  /* Se lo fossero, si potrebbe salvare un foglio in cui l'inflazione dice una
     cosa e la rivalutazione del TFR un'altra. */
  for (const k of ['crescitaReddito', 'capitalizzazioneMontante', 'rivalTfr', 'rendFondoReale']) {
    deve(P.IPOTESI[k].modificabile === false, k + ' risulta correggibile a mano');
    deve(!!P.IPOTESI[k].derivata, k + ' non dichiara da cosa deriva');
  }
  const forzata = P.ipotesiAttive({ crescitaReddito: 0.15 });
  deve(!vicino(forzata.crescitaReddito.v, 0.15), 'una correzione a mano ha scavalcato la derivazione');
});

/* ── LA DEFLAZIONE ───────────────────────────────────────────────────────── */

prova('deflaziona riporta indietro di quello che deve', () => {
  deve(vicino(P.deflaziona(1000, 0, 0.02), 1000), 'a zero anni cambia qualcosa');
  deve(vicino(P.deflaziona(1000, 1, 0.02), 1000 / 1.02), 'un anno non torna');
  deve(vicino(P.deflaziona(1000, 10, 0.02), 1000 / Math.pow(1.02, 10)), 'dieci anni non tornano');
  deve(P.deflaziona(1000, 10, 0) === 1000, 'con inflazione zero cambia qualcosa');
});

prova('sul foglio i conti tornano fra loro: divario = stipendio − pensione', () => {
  /* È il motivo della convenzione. Deflazionare ogni voce per gli anni che le
     competono sarebbe più preciso di un anno di inflazione sulla riga dello
     stipendio, ma produrrebbe un foglio in cui il divario non è la differenza
     fra le due righe sopra — e quello, davanti a un cliente, non si difende. */
  const p = caso();
  deve(vicino(p.reale.gapAnnuo, p.reale.redditoAllaPensione - p.reale.pensioneAnnua, 0.01),
    'in euro di oggi il divario non è la differenza fra stipendio e pensione');
  deve(vicino(p.reale.gapMensile, p.reale.gapAnnuo / 13, 0.01), 'il mensile non è l\'annuo su 13');
});

prova('il tasso di sostituzione NON cambia deflazionando', () => {
  /* È il controllo che dice se ho sbagliato: numeratore e denominatore sono
     dello stesso anno, e riportarli indietro entrambi lascia il rapporto dov'è.
     Se questo si muove, da qualche parte sto deflazionando una cosa sola. */
  const p = caso();
  const daiReali = (p.reale.pensioneAnnua / p.reale.redditoAllaPensione) * 100;
  deve(vicino(daiReali, p.tassoSostituzione, 0.01),
    'il tasso di sostituzione cambia coi reali: ' + daiReali.toFixed(2) + ' contro ' + p.tassoSostituzione.toFixed(2));
  return p.tassoSostituzione.toFixed(1) + '% con entrambi';
});

prova('versamento e risparmio fiscale restano euro di oggi', () => {
  // Si versa adesso e si risparmia adesso: deflazionarli sarebbe contarli due
  // volte. A tornare indietro sono capitale e rendita, che arrivano dopo.
  const p = caso();
  const s = P.simulaIntegrativa(p, 50);
  deve(s.versamentoAnnuo === 600, 'il versamento è stato deflazionato');
  deve(s.reale.renditaMensile < s.renditaMensile, 'la rendita non è stata riportata a euro di oggi');
  deve(vicino(s.reale.renditaMensile, P.deflaziona(s.renditaMensile, p.persona.anniMancanti, p.reale.inflazione), 0.01),
    'la rendita reale non torna con la deflazione dichiarata');
  return 'rendita ' + Math.round(s.renditaMensile) + ' € nel ' + p.annoUscita + ' = ' + Math.round(s.reale.renditaMensile) + ' € di oggi';
});

prova('il confronto «verso 50, ottengo X» non mescola più due monete', () => {
  /* Era il guasto peggiore di F-09: 50 € di oggi contro 170 € del 2060. */
  const p = caso();
  const s = P.simulaIntegrativa(p, 50);
  const gonfiatura = s.renditaMensile / s.reale.renditaMensile;
  deve(gonfiatura > 1.5, 'il caso di prova non mostra la differenza');
  deve(s.reale.renditaMensile > 0, 'la rendita reale non c\'è');
  return 'il nominale gonfiava di ' + gonfiatura.toFixed(1) + ' volte';
});

/* ── IL COEFFICIENTE CHE DECADE ──────────────────────────────────────────── */

prova('il coefficiente usato per la pensione pubblica scende col tempo', () => {
  const senza = caso();
  const con = caso({ decadimentoCoefficiente: CURVA });
  deve(con.coefficienti.usato < senza.coefficienti.usato, 'il coefficiente non decade');
  deve(con.coefficienti.oggi === senza.coefficienti.usato, 'non si vede più quello di oggi');
  deve(con.coefficienti.decadimento.applicata === true, 'non dichiara di aver applicato la curva');
  return senza.coefficienti.usato.toFixed(5) + ' → ' + con.coefficienti.usato.toFixed(5);
});

prova('e il divario cresce: l\'argomento è più forte, non più debole', () => {
  const senza = caso(), con = caso({ decadimentoCoefficiente: CURVA });
  deve(con.gapAnnuo > senza.gapAnnuo, 'col coefficiente più basso il divario non cresce');
  deve(con.tassoSostituzione < senza.tassoSostituzione, 'il tasso di sostituzione non scende');
  return senza.tassoSostituzione.toFixed(1) + '% → ' + con.tassoSostituzione.toFixed(1) + '%';
});

prova('decade il RAPPORTO, non il valore assoluto', () => {
  /* Applicare l'obiettivo assoluto a chi esce a 62 anni darebbe un
     coefficiente PIÙ ALTO di quello di oggi alla sua età: il contrario di
     quello che succede. La curva è fissata sull'età di riferimento e il
     fattore che ne esce si applica a tutte le età. */
  const a62 = P.prospettivaPensionistica({ eta: 28, etaPensionamento: 62, redditoAnnuo: 24000,
    anniContributiGia: 5, annoRiferimento: 2026, decadimentoCoefficiente: CURVA });
  deve(a62.coefficienti.usato < a62.coefficienti.oggi, 'a 62 anni il coefficiente non decade');
  deve(a62.coefficienti.usato !== CURVA.obiettivo, 'applica l\'obiettivo dei 67 anni anche a 62');
  deve(a62.coefficienti.usato < CURVA.obiettivo, 'a 62 anni esce un coefficiente più alto dell\'obiettivo a 67');
  return 'a 62 anni: ' + a62.coefficienti.oggi.toFixed(5) + ' → ' + a62.coefficienti.usato.toFixed(5);
});

/* ── IL DECADIMENTO DALLA SPERANZA DI VITA ───────────────────────────────── */

const SERIE = { 2025: 20.1, 2030: 20.6, 2040: 21.5, 2050: 22.3, 2060: 23.0 };
const DA_ISTAT = { metodo: 'speranza_di_vita', annoBase: 2025, eta: 67, speranzaDiVita: SERIE };

prova('il coefficiente scende come si allunga la vita attesa', () => {
  /* coefficiente(anno) = coefficiente(2025) × e67(2025) / e67(anno). Il
     coefficiente converte un capitale in una rendita vitalizia: se la vita
     attesa cresce del 10%, la rendita annua cala di altrettanto. Così il
     numero nasce da una serie ufficiale e non da una curva scelta a mano. */
  const r = P.coefficienteProiettato(0.05608, 2060, 2026, DA_ISTAT, { 67: 0.05608 });
  deve(r.applicata === true, 'non applica il metodo');
  deve(r.metodo === 'speranza_di_vita', 'non dichiara con che metodo ha calcolato');
  deve(vicino(r.usato, 0.05608 * SERIE[2025] / SERIE[2060], 1e-9), 'la formula non è quella dichiarata');
  deve(r.usato < 0.05608, 'il coefficiente non scende');
  return '5,608% → ' + (r.usato * 100).toFixed(3) + '% al 2060';
});

prova('la serie per sesso si pesa con la popolazione, anno per anno', () => {
  /* Né Eurostat né Istat pubblicano un totale nelle proiezioni, ma il
     coefficiente di trasformazione è UNISEX per legge: guidarlo con la vita
     attesa di un solo sesso sarebbe storto. E il peso non può essere fisso —
     la composizione fra uomini e donne a 67 anni cambia nel tempo, e verso il
     2060 si inverte. (Francesco, 04/09/2026) */
  const perSesso = { 2025: { m: 18.2, f: 21.1 }, 2060: { m: 20.9, f: 23.6 } };
  const pesi = { 2025: { m: 0.4773, f: 0.5227 }, 2060: { m: 0.5059, f: 0.4941 } };
  const pesata = P.pesaPerSesso(perSesso, pesi);
  deve(vicino(pesata[2025], 0.4773 * 18.2 + 0.5227 * 21.1, 1e-9), 'la ponderazione del 2025 non torna');
  deve(vicino(pesata[2060], 0.5059 * 20.9 + 0.4941 * 23.6, 1e-9), 'la ponderazione del 2060 non torna');
  /* Controllo di sanità: la e67 ponderata del 2025 deve somigliare al totale
     osservato dalle tavole di mortalità Istat (19,729). Se un giorno divergono
     di molto, la ponderazione è sbagliata da qualche parte. */
  deve(Math.abs(pesata[2025] - 19.729) < 0.2, 'la ponderata del 2025 non somiglia al totale osservato Istat: ' + pesata[2025]);
  return 'e67 ponderata 2025 = ' + pesata[2025].toFixed(3) + ' (Istat osservato: 19,729)';
});

prova('un anno senza peso viene saltato, non pesato a occhio', () => {
  const pesata = P.pesaPerSesso({ 2025: { m: 18, f: 21 }, 2030: { m: 19, f: 22 } }, { 2025: { m: 0.5, f: 0.5 } });
  deve(pesata[2025] !== undefined, 'salta anche l\'anno che il peso ce l\'ha');
  deve(pesata[2030] === undefined, 'ha inventato un peso per il 2030');
});

prova('una serie già totale passa così com\'è', () => {
  const pesata = P.pesaPerSesso({ 2025: 19.7, 2060: 22.2 }, null);
  deve(pesata[2025] === 19.7 && pesata[2060] === 22.2, 'una serie di numeri viene alterata');
});

prova('fra due anni pubblicati si interpola, e lo si dice', () => {
  const r = P.coefficienteProiettato(0.05608, 2035, 2026, DA_ISTAT, { 67: 0.05608 });
  deve(/interpolato fra 2030 e 2040/.test(r.come), 'non dichiara di aver interpolato: ' + r.come);
  deve(r.speranzaUscita > SERIE[2030] && r.speranzaUscita < SERIE[2040], 'l\'interpolazione esce dall\'intervallo');
});

prova('oltre l\'ultimo anno pubblicato NON si estrapola', () => {
  /* Una vita attesa inventata al 2075 è esattamente il tipo di numero che non
     deve finire su un preventivo: si tiene l'ultimo pubblicato, e si dice. */
  const dentro = P.coefficienteProiettato(0.05608, 2060, 2026, DA_ISTAT, { 67: 0.05608 });
  const fuori = P.coefficienteProiettato(0.05608, 2075, 2026, DA_ISTAT, { 67: 0.05608 });
  deve(vicino(fuori.usato, dentro.usato, 1e-9), 'oltre la serie continua a estrapolare');
  deve(/tenuto fermo/.test(fuori.come), 'non dichiara di essersi fermato all\'ultimo anno');
});

prova('una serie per sesso senza il motore che la sa pesare NON passa in silenzio', () => {
  /* Il 04/09/2026 la serie è finita in tabella prima che il motore sapesse
     ponderarla: le voci {m, f} non erano numeri, la serie risultava vuota e il
     coefficiente NON decadeva più — senza che il foglio lo dicesse. Il metodo
     dichiara sempre se ha applicato qualcosa: e' quello che ha fatto trovare
     il guasto in un minuto invece che da un cliente. */
  const perSesso = { 2025: { m: 18.2, f: 21.1 }, 2060: { m: 20.9, f: 23.6 } };
  const senzaPesi = P.coefficienteProiettato(0.05608, 2060, 2026,
    { metodo: 'speranza_di_vita', annoBase: 2025, speranzaDiVita: perSesso }, { 67: 0.05608 });
  deve(senzaPesi.applicata === false, 'dice di aver applicato il metodo su una serie che non sa leggere');
  deve(!!senzaPesi.motivo, 'non dice perché non l\'ha applicato');
  deve(senzaPesi.usato === 0.05608, 'ha inventato un coefficiente');
});

prova('se il metodo è scelto ma la serie manca, non si ripiega in silenzio', () => {
  const r = P.coefficienteProiettato(0.05608, 2060, 2026, { metodo: 'speranza_di_vita' }, { 67: 0.05608 });
  deve(r.applicata === false, 'dice di aver applicato un metodo senza i dati per farlo');
  deve(/serie/.test(r.motivo || ''), 'non dice perché non l\'ha applicato');
  deve(r.usato === 0.05608, 'ha inventato un coefficiente');
});

prova('la curva dichiarata dall\'agenzia resta il ripiego finché la serie non c\'è', () => {
  /* Spegnere il decadimento in attesa della serie vorrebbe dire tornare, in
     silenzio, a una pensione più alta del vero. */
  const r = P.coefficienteProiettato(0.05608, 2060, 2026, CURVA, { 67: 0.05608 });
  deve(r.applicata === true && r.metodo === 'lineare', 'il ripiego non funziona più');
  deve(r.usato < 0.05608, 'il ripiego non fa decadere niente');
});

prova('senza curva non si inventa nessun decadimento', () => {
  const p = caso();
  deve(p.coefficienti.usato === p.coefficienti.oggi, 'decade anche senza una curva da applicare');
  deve(p.coefficienti.decadimento.applicata === false, 'dichiara di aver applicato una curva che non ha');
});

prova('oltre l\'anno obiettivo non si scende all\'infinito', () => {
  const lontano = P.coefficienteProiettato(0.05608, 2090, 2026, CURVA, { 67: 0.05608 });
  const arrivo = P.coefficienteProiettato(0.05608, 2060, 2026, CURVA, { 67: 0.05608 });
  deve(vicino(lontano.usato, arrivo.usato), 'dopo il 2060 il coefficiente continua a scendere');
});

prova('la rendita del fondo non usa il coefficiente INPS, né quello di oggi né quello decaduto', () => {
  /* F-11, 05/09/2026. Il coefficiente di legge converte il montante PUBBLICO.
     La rendita del fondo si converte con quello della convenzione assicurativa
     del fondo, piu' basso di circa un quarto, e non decade con la speranza di
     vita perche' sta in un contratto privato, non in un decreto.
     IL CASO CHE DEVE FALLIRE: se qualcuno riagganciasse i due — con `oggi` o
     con `usato` — una delle due disuguaglianze qui sotto salterebbe. */
  const p = caso({ decadimentoCoefficiente: CURVA });
  const s = P.simulaIntegrativa(p, 50);
  const usato = s.renditaAnnua / s.capitale;
  const ip = P.ipotesiAttive();
  deve(vicino(usato, ip.coeffRenditaFondo.v), 'la rendita non usa il coefficiente della convenzione del fondo');
  deve(!vicino(usato, p.coefficienti.oggi), 'la rendita è ancora agganciata al coefficiente INPS di oggi');
  deve(!vicino(usato, p.coefficienti.usato), 'la rendita è ancora agganciata al coefficiente INPS decaduto');
  deve(usato < p.coefficienti.oggi, 'il coefficiente del fondo non è più basso di quello di legge');
  return 'fondo ' + usato.toFixed(5) + ', pensione pubblica ' + p.coefficienti.usato.toFixed(5);
});

/* ── IL REQUISITO DI ETÀ ─────────────────────────────────────────────────── */

prova('«67a3m» sono 67 anni e 3 mesi, non un NaN', () => {
  /* È così che la Ragioneria pubblica i requisiti, ed è così che vanno letti:
     Number('67a3m') è NaN, e un NaN nel confronto con l'età lo rende sempre
     falso — l'avviso non sarebbe mai scattato, e nessuno se ne sarebbe accorto
     perché il silenzio è anche la risposta giusta quando il requisito non si
     conosce. (04/09/2026) */
  deve(P.anniEMesi('67a3m') === 67.25, '67a3m non fa 67,25');
  deve(P.anniEMesi('69a9m') === 69.75, '69a9m non fa 69,75');
  deve(P.anniEMesi('67a0m') === 67, '67a0m non fa 67');
  deve(P.anniEMesi(69) === 69, 'un numero non passa così com\'è');
  deve(P.anniEMesi('boh') === null, 'un valore illeggibile non viene respinto');
  const p = caso({ requisitiProiettati: { 2060: '69a9m' } });
  deve(p.requisito.sotto === true, 'con «69a9m» non si accorge che 67 è sotto');
  deve(p.avvisi.some(a => /69 anni e 9 mesi/.test(a)), 'il requisito non è scritto in italiano sul foglio');
  return '67a3m → 67,25 · 69a9m → 69,75';
});

prova('un requisito illeggibile vale come requisito sconosciuto', () => {
  // Meglio tacere che confrontare l'età con qualcosa che non si sa leggere.
  const p = caso({ requisitiProiettati: { 2060: 'boh' } });
  deve(p.requisito.noto === false, 'dichiara di conoscere un requisito che non sa leggere');
  deve(!p.avvisi.some(x => /requisito di vecchiaia/.test(x)), 'avvisa su un valore illeggibile');
});

prova('se l\'età scelta è sotto il requisito proiettato, lo dice', () => {
  const p = caso({ requisitiProiettati: { 2060: 69 } });
  deve(p.requisito.noto === true && p.requisito.sotto === true, 'non si accorge che 67 è sotto 69');
  deve(p.avvisi.some(a => /requisito di vecchiaia proiettato/.test(a)), 'non avvisa');
  deve(p.avvisi.some(a => /69/.test(a)), 'l\'avviso non dice quale sarebbe il requisito');
});

prova('se il requisito per quell\'anno non si conosce, si tace', () => {
  /* Inventare un requisito e avvisare su un numero inventato è peggio del
     silenzio: il consulente si fiderebbe di una cosa che non sappiamo. */
  const p = caso({ requisitiProiettati: {} });
  deve(p.requisito.noto === false, 'dichiara di conoscere un requisito che non ha');
  deve(!p.avvisi.some(a => /requisito/.test(a)), 'avvisa su un requisito che non conosce');
  deve(p.requisito.anno === 2060, 'non dice nemmeno di quale anno si tratta');
});

prova('e lo dichiara anche nello step delle ipotesi', () => {
  const fs2 = require('fs');
  const path2 = require('path');
  const src = fs2.readFileSync(path2.join(process.cwd(), 'index.html'), 'utf8');
  const f = src.slice(src.indexOf('function prevIpotesi'), src.indexOf('function prevCorreggi'));
  deve(/Verifica del requisito di età non attiva/.test(f), 'lo step 4 non dichiara il controllo mancante');
  deve(/PREV\.requisitiProiettati/.test(f), 'non guarda se la tabella è popolata');
});

prova('con l\'età pari o sopra il requisito non avvisa', () => {
  const p = caso({ etaPensionamento: 70, requisitiProiettati: { 2063: 69 } });
  deve(p.requisito.sotto === false, 'segnala un problema che non c\'è');
  deve(!p.avvisi.some(a => /requisito/.test(a)), 'avvisa lo stesso');
});

/* ── IL FOGLIO ───────────────────────────────────────────────────────────── */

const foglio = (extra) => {
  const p = caso(extra);
  return P.reportPrevidenza({ prospettiva: p, valutazione: P.valutaSoluzione(p, 50),
    cliente: { nome: 'Prova' }, consulente: { nome: 'F. Oddo', ruolo: 'Intermediario', rui: 'X', email: 'a@b.it', telefono: '1' },
    dataRiferimento: '4 settembre 2026' });
};

prova('il foglio dichiara in testa che gli importi sono in euro di oggi', () => {
  const h = foglio().html;
  deve(/EURO DI OGGI/.test(h), 'non lo dichiara');
  deve(/potere d.acquisto/.test(h), 'non spiega cosa vuol dire');
});

prova('il foglio mostra gli importi in euro di oggi, non quelli del 2060', () => {
  const p = caso();
  const h = foglio().html;
  const oggi = Math.round(p.reale.pensioneMensile);
  const nel2060 = Math.round(p.pensioneMensile);
  deve(oggi < nel2060, 'il caso di prova non distingue i due');
  // La cifra nominale può comparire SOLO nella riga tecnica, non nel corpo.
  const corpo = h.slice(0, h.indexOf('Riferimenti tecnici'));
  deve(corpo.indexOf(String(oggi)) >= 0, 'nel corpo non c\'è la pensione in euro di oggi');
  deve(corpo.indexOf(String(nel2060)) < 0, 'nel corpo c\'è ancora la cifra nominale del 2060');
  return oggi + ' € nel corpo, ' + nel2060 + ' € solo nella riga tecnica';
});

prova('quando il controllo sul requisito NON è attivo, il foglio lo dichiara', () => {
  /* Il silenzio è giusto — il requisito del 2060 non lo conosciamo — ma deve
     essere VISIBILE. Un collaboratore deve sapere che quel controllo non c'è,
     non scoprirlo da un cliente che gli fa notare che nel 2060 a 67 anni non
     ci si va. (chiesto da Francesco il 04/09/2026) */
  const vuota = foglio({ requisitiProiettati: {} }).html;
  deve(/Verifica del requisito di età non attiva/.test(vuota), 'il foglio tace sul controllo che non c\'è');
  deve(/non ancora popolata/.test(vuota), 'non dice perché');
  const piena = foglio({ requisitiProiettati: { 2060: 69 } }).html;
  deve(!/non attiva/.test(piena), 'lo dichiara anche quando il controllo c\'è');
});

prova('il foglio dice con che metodo il coefficiente è stato proiettato', () => {
  /* I coefficienti di legge incorporano anche un tasso di sconto e la
     reversibilità: la proporzionalità alla sola speranza di vita è
     un'approssimazione DICHIARATA, non il metodo del decreto. */
  const curva = { metodo: 'speranza_di_vita', annoBase: 2025, eta: 67, fonteSerie: 'Eurostat EUROPOP2025',
    speranzaDiVita: { 2025: { m: 18.2, f: 21.1 }, 2060: { m: 20.9, f: 23.6 } },
    pesi: { 2025: { m: 0.4773, f: 0.5227 }, 2060: { m: 0.5059, f: 0.4941 } } };
  const h = foglio({ decadimentoCoefficiente: curva }).html;
  const riga = h.slice(h.indexOf('Riferimenti tecnici'));
  deve(/Eurostat EUROPOP2025/.test(riga), 'non dice da quale serie viene la speranza di vita');
  deve(/ponderata su popolazione Istat/.test(riga), 'non dice come è stata ponderata');
  deve(/metodo proporzionale, approssimazione della tabella di legge/.test(riga),
    'non dichiara che è un\'approssimazione: i coefficienti di legge hanno anche sconto e reversibilità');
  deve(/Vita attesa a 67 anni/.test(riga), 'non riporta i due valori di vita attesa usati');
  return 'metodo, fonte e avvertenza sul foglio';
});

prova('la riga tecnica porta nominale, inflazione e versione', () => {
  /* Serve a ricostruire il conto fra due anni e a distinguere i fogli già
     consegnati: stessi dati, regole diverse, numeri molto diversi. */
  const h = foglio({ decadimentoCoefficiente: CURVA }).html;
  const riga = h.slice(h.indexOf('Riferimenti tecnici'));
  deve(/euro correnti/.test(riga), 'non riporta gli importi nominali');
  deve(/2060/.test(riga), 'non dice a che anno si riferiscono');
  deve(/2,00%/.test(riga), 'non dice con che inflazione ha deflazionato');
  deve(/34 anni/.test(riga), 'non dice su quanti anni');
  deve(new RegExp(P.VERSIONE_REGOLE).test(riga), 'non porta la versione delle regole');
  deve(/curva dichiarata fino al/.test(riga), 'non dice che il coefficiente è stato fatto decadere');
});

prova('la versione delle regole è cambiata: i fogli vecchi si riconoscono', () => {
  deve(P.VERSIONE_REGOLE === '2026-09-09',
    'la versione non è stata aggiornata: un foglio di ieri e uno di oggi sembrerebbero uguali');
});

/* ── LA SCHERMATA (F-12, 09/09/2026) ─────────────────────────────────────────
   Il guasto trovato da Francesco: il foglio stampato era stato sistemato con
   F-09, la SCHERMATA no. Due documenti sullo stesso cliente che dicevano cifre
   diverse, e nessuna prova che li tenesse insieme. Da qui in avanti la
   schermata si controlla come si controlla il foglio. */

const schermata = (() => {
  const fs2 = require('fs');
  const path2 = require('path');
  const src = fs2.readFileSync(path2.join(process.cwd(), 'index.html'), 'utf8');
  const da = src.indexOf("prevBox('La pensione pubblica'");
  const a = src.indexOf('prevMotivi(v)', da);
  deve(da > 0 && a > da, 'il blocco della schermata previdenziale non si trova più in index.html');
  return src.slice(da, a);
})();

prova('la schermata mostra la rendita in euro di oggi, come il foglio', () => {
  /* La riga colpevole. Mostrava il nominale sotto un cappello che dichiara
     «tutti gli importi sono in euro di oggi»: 233 € al mese dove il divario
     coperto, calcolato bene, ne dichiarava 113. Il beneficio del versamento
     usciva quasi doppio, ed è esattamente il numero su cui il cliente firma. */
  deve(/Rendita aggiuntiva[^\]]*soluzione\.reale \|\| v\.soluzione/.test(schermata),
    'la schermata è tornata a stampare la rendita NOMINALE sotto il cappello «euro di oggi»');
});

prova('la schermata mostra lo stipendio su cui misura tasso e divario', () => {
  /* Senza questa riga il cliente che ha dichiarato 2.000 € legge «pensione
     1.651, ti mancano 866» e non torna: l'866 è calcolato su un numero che
     non ha mai visto. Tre cifre inconciliabili davanti a chi deve firmare. */
  deve(/Stipendio di oggi/.test(schermata), 'la schermata non dice più quanto guadagna oggi');
  deve(/Ultimo stipendio prima della pensione/.test(schermata),
    'la schermata non mostra il metro su cui sono calcolati tasso e divario');
});

prova('sulla schermata i tre numeri tornano fra loro', () => {
  /* La prova che il cliente fa a mente, e che deve tornare: stipendio meno
     pensione uguale a quanto manca. */
  const p = caso();
  deve(vicino(p.reale.redditoAllaPensioneMensile - p.reale.pensioneMensile, p.reale.gapMensile, 0.01),
    'sulla schermata «quanto manca» non è la differenza fra le due righe sopra');
  return Math.round(p.reale.redditoAllaPensioneMensile) + ' − ' + Math.round(p.reale.pensioneMensile) +
    ' = ' + Math.round(p.reale.gapMensile) + ' € al mese';
});

prova('rendita mostrata e divario coperto raccontano lo stesso numero', () => {
  /* Il controllo che avrebbe fatto cadere il bug il primo giorno: la rendita
     stampata, divisa per il divario stampato, deve dare la percentuale
     stampata. Con il nominale contro il reale usciva il doppio.
     Lo scarto ammesso è il tredicesimo: la rendita del fondo si eroga in
     dodici rate, la pensione pubblica in tredici. */
  const p = caso();
  const v = P.valutaSoluzione(p, 100);
  const mostrata = (v.soluzione.reale || v.soluzione).renditaMensile;
  const daFoglio = (mostrata * 12) / p.reale.gapAnnuo;
  deve(Math.abs(daFoglio - v.coperturaDivario) < 0.02,
    'la rendita mostrata non regge il confronto col divario coperto: ' +
    (daFoglio * 100).toFixed(1) + '% contro ' + (v.coperturaDivario * 100).toFixed(1) + '%');
  return Math.round(mostrata) + ' €/mese = ' + Math.round(v.coperturaDivario * 100) + '% del divario';
});

prova('anche il motivo scritto in italiano porta la cifra di oggi', () => {
  const p = caso();
  const v = P.valutaSoluzione(p, 100);
  const reale = Math.round((v.soluzione.reale || v.soluzione).renditaMensile);
  const riga = v.motivi.filter(m => /rendita aggiuntiva stimata/.test(m))[0] || '';
  deve(riga.indexOf(reale + ' € al mese') >= 0,
    'il motivo racconta una rendita diversa da quella mostrata: ' + riga);
  deve(/euro di oggi/.test(riga), 'il motivo non dichiara in che moneta è la cifra');
});

/* ── PIL E REDDITI SI MUOVONO INSIEME (F-12 bis) ─────────────────────────── */

prova('il tasso di sostituzione non dipende dal LIVELLO della crescita reale', () => {
  /* È la struttura del contributivo: il montante si rivaluta col PIL nominale
     e il metro è lo stipendio. Se le due componenti reali si muovono insieme,
     il rapporto fra pensione e ultimo stipendio non si sposta. Se questa prova
     salta, da qualche parte una delle due è rimasta indietro. */
  const fermo = caso();
  const cresce = P.prospettivaPensionistica({ eta: 33, etaPensionamento: 67, redditoAnnuo: 24000,
    anniContributiGia: 9, annoRiferimento: 2026 }, { crescitaRealeReddito: 0.01, crescitaRealePIL: 0.01 });
  deve(Math.abs(fermo.tassoSostituzione - cresce.tassoSostituzione) < 1.5,
    'alzando insieme PIL e redditi il tasso di sostituzione si muove di ' +
    Math.abs(fermo.tassoSostituzione - cresce.tassoSostituzione).toFixed(1) + ' punti');
  return fermo.tassoSostituzione.toFixed(1) + '% a zero, ' + cresce.tassoSostituzione.toFixed(1) + '% all\'1%';
});

prova('se PIL e redditi vengono separati, il foglio lo dice invece di gonfiare la pensione', () => {
  /* La trappola: col PIL all'1% e i redditi fermi si ipotizza che per
     trent'anni la produttività cresca e in busta paga non arrivi niente. Il
     montante corre più degli stipendi, un 33enne esce con un tasso di
     sostituzione del 96% e il modulo gli dice che non ha bisogno di niente.
     La RGS colloca i dipendenti privati intorno al 70-75%. */
  const storto = P.prospettivaPensionistica({ eta: 33, etaPensionamento: 67, redditoAnnuo: 24000,
    anniContributiGia: 9, annoRiferimento: 2026 }, { crescitaRealePIL: 0.01 });
  deve(storto.tassoSostituzione > 90, 'il caso di prova non mostra più la gonfiatura');
  deve(storto.avvisi.some(a => /disallineate/.test(a)), 'il foglio non avvisa del disallineamento');
  deve(storto.avvisi.some(a => /sottostimato/.test(a)), 'l\'avviso non dice da che parte sbaglia');
  deve(!caso().avvisi.some(a => /disallineate/.test(a)), 'avvisa anche quando le due ipotesi sono allineate');
  return 'col PIL staccato: ' + storto.tassoSostituzione.toFixed(1) + '%, e il foglio lo segnala';
});

/* ── esecuzione ──────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Euro di oggi: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
