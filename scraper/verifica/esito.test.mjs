// ═══════════════════════════════════════════════════════════════════════════════
//  L'ESITO — «fatto» non si dice a vuoto
//
//  Il caso vero da cui nasce (allianz:297, verificato il 02/08/2026):
//  l'interrogazione ANIA rispondeva ok:true anche quando il campo targa non era
//  stato trovato, cioè quando la ricerca non era mai partita. Chi legge vede
//  una interrogazione riuscita senza risultati e conclude che il veicolo non è
//  assicurato. È una decisione sbagliata presa con calma, ed è peggio di un
//  errore.
// ═══════════════════════════════════════════════════════════════════════════════
import {
  CODICI, ErroreEsito, riuscito, fallito, eEsito, statoHttp, esigi, daEccezione,
} from '../comune/esito.mjs';

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };
const lancia = (fn, msg) => {
  try { fn(); } catch { return true; }
  throw new Error(msg);
};

// ── 1. Il successo non si dichiara a vuoto ───────────────────────────────────
prova('un successo con dei dati si costruisce', () => {
  const e = riuscito({ targa: 'AB123CD', assicurato: true });
  deve(e.ok === true && e.dati.assicurato === true, 'il successo non porta i dati');
});

prova('«è andata bene» senza niente da mostrare non si può dire', () => {
  /* Il cuore del modulo: ok:true non è più una costante scrivibile a mano. */
  lancia(() => riuscito(), 'riuscito() senza argomenti non ha protestato');
  lancia(() => riuscito(null), 'riuscito(null) è passato');
  lancia(() => riuscito({}), 'riuscito({}) è passato: un oggetto vuoto non è un risultato');
  lancia(() => riuscito([]), 'riuscito([]) è passato: un elenco vuoto non è un risultato');
  lancia(() => riuscito('  '), 'riuscito(spazi) è passato');
});

prova('zero e falso restano risultati legittimi', () => {
  /* Un premio di 0 euro o «non assicurato» sono risposte vere: se le
     rifiutassimo, il modulo diventerebbe un ostacolo e verrebbe aggirato. */
  deve(riuscito(0).ok, 'zero rifiutato');
  deve(riuscito(false).ok, 'falso rifiutato');
  deve(riuscito({ assicurato: false }).ok, '«non assicurato» rifiutato');
});

// ── 2. Il fallimento dice perché ─────────────────────────────────────────────
prova('un fallimento porta il motivo e la frase da mostrare', () => {
  const e = fallito(CODICI.NON_LOGGATO, 'Sessione caduta.');
  deve(e.ok === false, 'non è un fallimento');
  deve(e.errore.codice === CODICI.NON_LOGGATO, 'il motivo si è perso');
  deve(/Sessione/.test(e.errore.messaggio), 'la frase si è persa');
});

prova('un motivo inventato diventa «imprevisto», non un motivo finto', () => {
  const e = fallito('qualcosa_che_non_esiste', 'boh');
  deve(e.errore.codice === CODICI.IMPREVISTO, 'ha accettato un codice non previsto: ' + e.errore.codice);
});

// ── 3. Riconoscere un esito ──────────────────────────────────────────────────
prova('un oggetto qualunque non è un esito', () => {
  deve(!eEsito({ ok: true }), '{ok:true} senza dati viene preso per un esito valido');
  deve(!eEsito({ ok: false }), '{ok:false} senza motivo viene preso per un esito valido');
  deve(!eEsito(null) && !eEsito('ciao') && !eEsito({}), 'riconosce esiti dove non ce ne sono');
  deve(eEsito(riuscito({ a: 1 })) && eEsito(fallito(CODICI.OCCUPATO, 'x')), 'non riconosce i suoi');
});

// ── 4. Lo stato HTTP si decide in un posto solo ──────────────────────────────
prova('ogni motivo ha il suo stato HTTP, deciso qui', () => {
  deve(statoHttp(riuscito({ a: 1 })) === 200, 'il successo non è 200');
  deve(statoHttp(fallito(CODICI.RICHIESTA_INCOMPLETA, 'x')) === 400, 'dato mancante non è 400');
  deve(statoHttp(fallito(CODICI.NON_LOGGATO, 'x')) === 409, 'serve un gesto umano ma non è 409');
  deve(statoHttp(fallito(CODICI.FRENO_TIRATO, 'x')) === 409, 'freno tirato non è 409');
  deve(statoHttp(fallito(CODICI.PORTALE_CAMBIATO, 'x')) === 502, 'portale cambiato non è 502');
  deve(statoHttp(fallito(CODICI.MANUTENZIONE, 'x')) === 503, 'manutenzione non è 503');
  deve(statoHttp(fallito(CODICI.PORTALE_NON_RISPONDE, 'x')) === 504, 'tempo scaduto non è 504');
});

prova('quello che non è un esito non diventa mai 200', () => {
  /* Se un giorno una rotta restituisse un oggetto vecchio stile, deve
     comportarsi come un errore, non come un successo. */
  deve(statoHttp({ ok: true }) === 500, '{ok:true} crudo passa come 200');
  deve(statoHttp(null) === 500, 'niente passa come 200');
  deve(statoHttp('fatto') === 500, 'una stringa passa come 200');
});

// ── 5. Fermarsi dove sta il fatto ────────────────────────────────────────────
prova('esigi() lascia passare quando la condizione è vera', () => {
  deve(esigi(true, CODICI.IMPREVISTO, 'x') === true, 'ferma anche quando va bene');
});

prova('esigi() ferma con l\'esito già pronto', () => {
  /* Questo è il caso di allianz:297 scritto come andava scritto. */
  const filled = false;
  let preso = null;
  try {
    esigi(filled, CODICI.PORTALE_CAMBIATO, 'Il campo targa non esiste più nella pagina ANIA.');
  } catch (e) { preso = e; }
  deve(preso instanceof ErroreEsito, 'non ha lanciato un ErroreEsito');
  deve(preso.esito.errore.codice === CODICI.PORTALE_CAMBIATO, 'il motivo si è perso per strada');
  deve(statoHttp(preso.esito) === 502, 'non arriva allo stato giusto');
});

// ── 6. Dalle eccezioni agli esiti ────────────────────────────────────────────
prova('un ErroreEsito conserva il suo motivo', () => {
  const e = daEccezione(new ErroreEsito(fallito(CODICI.MANUTENZIONE, 'Portale in manutenzione.')));
  deve(e.errore.codice === CODICI.MANUTENZIONE, 'il motivo è stato appiattito su «imprevisto»');
});

prova('un tempo scaduto non diventa «imprevisto»', () => {
  /* È il caso più frequente e merita una frase sua: «riprova» invece di
     «chiama l'assistenza». */
  for (const m of ['Timeout 45000ms exceeded', 'connect ETIMEDOUT', 'ECONNREFUSED 127.0.0.1:4200']) {
    const e = daEccezione(new Error(m));
    deve(e.errore.codice === CODICI.PORTALE_NON_RISPONDE, m + ' → ' + e.errore.codice);
  }
});

prova('un\'eccezione qualunque diventa un esito, non una schermata bianca', () => {
  const e = daEccezione(new TypeError('x is not a function'));
  deve(eEsito(e) && !e.ok, 'non è diventata un esito');
  deve(e.errore.codice === CODICI.IMPREVISTO, 'motivo sbagliato');
  deve(/not a function/.test(e.errore.dettagli || ''), 'il dettaglio tecnico è sparito: non si potrebbe diagnosticare');
});

prova('il dettaglio tecnico non è la frase da mostrare', () => {
  /* Chi guarda il pannello non deve leggere uno stack: la frase e il dettaglio
     sono due campi diversi apposta. */
  const e = daEccezione(new Error('ENOTFOUND portaleagenzie.allianz.it'));
  deve(!/ENOTFOUND/.test(e.errore.messaggio), 'il messaggio tecnico finisce sotto gli occhi di chi lavora');
});

// ── 7. I due «fatto» bugiardi veri sono spariti dal codice ───────────────────
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const qui = path.dirname(fileURLToPath(import.meta.url));
const leggi = (c) => fs.readFileSync(path.join(qui, '..', c, 'quote-service.mjs'), 'utf8');

prova('allianz: una ricerca ANIA che non e\' partita non dice piu\' ok', () => {
  /* Il difetto vero: `const filled = await cercaTarga(targa)` e poi
     `return { ok: true, ..., campo_targa_compilato: filled }` anche con
     filled === false. */
  const src = leggi('allianz');
  const i = src.indexOf('const filled = await cercaTarga(targa)');
  deve(i > 0, 'la ricerca ANIA e\' cambiata: da ricontrollare a mano');
  const dopo = src.slice(i, i + 1200);
  deve(/if \(!filled\)/.test(dopo), 'nessun controllo su filled: torna il «fatto» bugiardo');
  deve(/PORTALE_CAMBIATO/.test(dopo), 'il caso non viene classificato come portale cambiato');
  deve(dopo.indexOf('if (!filled)') < dopo.indexOf('ok: true'),
    'il controllo arriva DOPO aver gia\' detto ok');
});

prova('moto: un veicolo mai letto non dice piu\' ok', () => {
  const src = leggi('moto');
  const i = src.indexOf('const veicolo = await readVeicolo()');
  deve(i > 0, 'la lettura del veicolo e\' cambiata: da ricontrollare a mano');
  const dopo = src.slice(i, i + 1600);
  deve(/if \(!veicolo/.test(dopo), 'nessun controllo sul veicolo letto');
  deve(dopo.indexOf('if (!veicolo') < dopo.indexOf('ok: true'), 'il controllo arriva troppo tardi');
});

prova('moto: il testo della pagina esce ripulito anche fuori dalla fotografia', () => {
  /* Buco della ripulitura di stanotte: _text usciva crudo da /lookup. */
  const src = leggi('moto');
  deve(/const _text = ripulisciTesto\(/.test(src),
    'il testo della pagina esce di nuovo crudo: i dati del cliente arrivano al browser');
});

let ko = 0;
console.log('\nESITO — «fatto» non si dice a vuoto');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nESITO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
