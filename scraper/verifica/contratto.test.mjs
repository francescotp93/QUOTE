// ═══════════════════════════════════════════════════════════════════════════════
//  IL CONTRATTO REGGE
//
//  Il contratto è la parte che deve restare stabile: se cambia forma senza che
//  nessuno se ne accorga, ogni adapter costruito sopra si rompe in silenzio.
//  Qui si prova che l'input si normalizza, che l'input storto viene rifiutato
//  col codice giusto, che l'output riuscito e quello fallito hanno la forma
//  promessa, e che un scenario nuovo (bersani) si aggancia senza toccare il
//  contratto — è la prova che l'astrazione è estendibile, non solo bella.
// ═══════════════════════════════════════════════════════════════════════════════
import {
  SCENARI, SCENARI_ATTIVI, ERRORI, PASSI,
  normalizzaInput, validaInput, esitoOk, esitoErrore, validaEsito, fallimento,
} from '../comune/contratto.mjs';

const esiti = [];
const prova = (nome, fn) => { try { fn(); esiti.push([true, nome, '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

// ── INPUT ────────────────────────────────────────────────────────────────────
prova('un input “sporco” (come gira oggi) diventa la forma del contratto', () => {
  const p = normalizzaInput({
    targa: 'ab123cd', tipoVeicolo: 'Moto',
    contraente: { dataNascita: '1993-07-17', cf: 'rssmra93l17e974p', comune: 'Trapani', cellulare: '333' },
    polizza: { garanzie: ['furto', ' '], frazionamento: 'Semestrale' },
  });
  deve(p.veicolo.targa === 'AB123CD', 'targa non normalizzata: ' + p.veicolo.targa);
  deve(p.veicolo.tipo === 'moto', 'tipo veicolo non normalizzato: ' + p.veicolo.tipo);
  deve(p.cliente.codiceFiscale === 'RSSMRA93L17E974P', 'cf non in maiuscolo');
  deve(p.cliente.telefono === '333', 'cellulare non mappato su telefono');
  deve(p.cliente.indirizzo.comune === 'Trapani', 'comune non mappato nell\'indirizzo');
  deve(p.scenario === 'cambio_compagnia', 'scenario di default sbagliato: ' + p.scenario);
  deve(p.polizza.garanzie.length === 1 && p.polizza.garanzie[0] === 'furto', 'garanzie non ripulite');
  deve(p.polizza.rivalsa === true, 'la rinuncia rivalsa di default deve valere true');
});

prova('l\'input incompleto viene rifiutato col codice giusto', () => {
  const base = () => normalizzaInput({ targa: 'AB123CD', tipoVeicolo: 'auto', contraente: { dataNascita: '1980-01-01' } });
  deve(validaInput(base()).ok, 'un input buono viene rifiutato');

  const senzaTarga = normalizzaInput({ tipoVeicolo: 'auto', contraente: { dataNascita: '1980-01-01' } });
  let r = validaInput(senzaTarga);
  deve(!r.ok && r.error_code === 'INPUT_NON_VALIDO', 'targa mancante non dà INPUT_NON_VALIDO: ' + JSON.stringify(r));

  const senzaNascita = normalizzaInput({ targa: 'AB123CD', tipoVeicolo: 'auto' });
  r = validaInput(senzaNascita);
  deve(!r.ok && r.error_code === 'INPUT_NON_VALIDO', 'data nascita mancante non rifiutata');

  const dataStorta = normalizzaInput({ targa: 'AB123CD', tipoVeicolo: 'auto', contraente: { dataNascita: '17/07/1993' } });
  r = validaInput(dataStorta);
  deve(!r.ok && /YYYY-MM-DD/.test(r.messaggio), 'una data in formato sbagliato passa: ' + JSON.stringify(r));

  const veicoloIgnoto = normalizzaInput({ targa: 'AB123CD', tipoVeicolo: 'astronave', contraente: { dataNascita: '1980-01-01' } });
  deve(!validaInput(veicoloIgnoto).ok, 'un tipo veicolo inventato passa');
});

// ── ESTENDIBILITÀ: bersani/rinnovo si agganciano senza toccare il contratto ──
prova('uno scenario non ancora attivo si rifiuta, ma è già previsto', () => {
  /* bersani e rinnovo sono nella lista degli SCENARI (quindi “conosciuti”) ma
     non fra gli ATTIVI: il contratto li rifiuta con un codice apposito, invece
     di trattarli come input malformato. Il giorno che si implementano, basta
     spostarli in SCENARI_ATTIVI — nessun adapter cambia. */
  deve(SCENARI.includes('bersani_stesso') && SCENARI.includes('rinnovo'), 'gli scenari futuri non sono previsti');
  const p = normalizzaInput({ scenario: 'bersani_stesso', targa: 'AB123CD', tipoVeicolo: 'auto', contraente: { dataNascita: '1980-01-01' } });
  const r = validaInput(p);
  deve(!r.ok && r.error_code === 'SCENARIO_NON_SUPP', 'bersani non dà SCENARIO_NON_SUPP: ' + JSON.stringify(r));
  deve(SCENARI_ATTIVI.length === 1 && SCENARI_ATTIVI[0] === 'cambio_compagnia', 'per ora deve essere attivo solo il cambio compagnia');
});

// ── OUTPUT ───────────────────────────────────────────────────────────────────
prova('un esito riuscito ha la forma promessa e passa la validazione', () => {
  const e = esitoOk('Moto Platinum', {
    prodotto: 'RC Moto', premio_annuo: '588', frazionamento: 'Annuale',
    garanzie_incluse: ['RCA', ' Furto '], opzioni: [{ nome: 'Incendio/Furto', premio_annuo: 120 }],
  });
  deve(e.esito === 'ok', 'esito non ok');
  deve(e.premio.annuo === 588, 'premio annuo non letto: ' + e.premio.annuo);
  deve(e.premio.rate === 1 && e.premio.rata === 588, 'rata/rate di default sbagliati');
  deve(e.garanzie_incluse.length === 2 && e.garanzie_incluse[1] === 'Furto', 'garanzie non ripulite');
  deve(e.opzioni[0].nome === 'Incendio/Furto' && e.opzioni[0].premio_annuo === 120, 'opzione non normalizzata');
  deve(validaEsito(e).ok, 'un esito buono non passa la validazione');
});

prova('un esito “ok” senza premio valido NON passa (niente premi fantasma)', () => {
  const e = esitoOk('X', { premio_annuo: 0 });
  deve(!validaEsito(e).ok, 'un premio 0 spacciato per ok passa la validazione');
  const e2 = esitoOk('X', { premio_annuo: 'boh' });
  deve(!validaEsito(e2).ok, 'un premio non numerico passa la validazione');
});

prova('un esito d\'errore usa solo codici della lista chiusa', () => {
  const e = esitoErrore('HDI', 'TIMEOUT', 'il portale non ha risposto', 'quotazione');
  deve(e.esito === 'errore' && e.error_code === 'TIMEOUT' && e.passo === 'quotazione', 'errore mal costruito');
  deve(validaEsito(e).ok, 'un errore ben formato non passa');
  /* un codice inventato non deve entrare: cade su PROVIDER, non lo si lascia passare. */
  const e2 = esitoErrore('HDI', 'CODICE_A_CASO', 'x', 'quotazione');
  deve(e2.error_code === 'PROVIDER', 'un error_code inventato è passato: ' + e2.error_code);
  deve(ERRORI.includes('RIFIUTO_COMPAGNIA') && ERRORI.includes('SESSIONE'), 'la lista chiusa ha perso dei codici');
});

// ── LOGGING STRUTTURATO ──────────────────────────────────────────────────────
prova('il log di un fallimento ha le quattro cose che servono, e oscura i dati', () => {
  const log = fallimento({
    compagnia: 'Moto Platinum', passo: 'quotazione', error_code: 'RIFIUTO_COMPAGNIA',
    payload: { targa: 'AB123CD', nome: 'MARIO' },
    rispostaGrezza: '{"error":"rischio non assunto"}',
    quando: '2026-08-24T10:00:00Z',
    ripulisci: (x) => JSON.parse(JSON.stringify(x).replace(/AB123CD|MARIO/g, '***')),
  });
  deve(log.passo === 'quotazione', 'manca il passo');
  deve(log.error_code === 'RIFIUTO_COMPAGNIA', 'manca il codice');
  deve(log.quando === '2026-08-24T10:00:00Z', 'manca il timestamp');
  deve(typeof log.risposta === 'string' && /rischio non assunto/.test(log.risposta), 'manca la risposta grezza');
  deve(!/AB123CD/.test(JSON.stringify(log)) && !/MARIO/.test(JSON.stringify(log)), 'i dati personali NON sono stati oscurati nel log');
});

prova('i passi del flusso sono un vocabolario chiuso e condiviso', () => {
  deve(PASSI.includes('sessione') && PASSI.includes('lettura_premio'), 'i passi non coprono inizio e fine del flusso');
});

let ko = 0;
console.log('\nCONTRATTO MOTOR');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nCONTRATTO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
