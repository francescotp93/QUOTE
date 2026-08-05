// ═══════════════════════════════════════════════════════════════════════════════
//  PROVE — il motore del rating, copia autorevole
//
//  Il punteggio calcolato qui finisce dentro un PDF che il cliente firma con
//  OTP. Non e' un numero su uno schermo: e' una consulenza scritta, con una
//  firma sotto. Per questo le prove guardano prima di tutto i tre casi in cui
//  un rating puo' MENTIRE.
//
//  E c'e' una quarta prova, che non riguarda il calcolo ma le due copie: la
//  gemella in IAM serve all'anteprima mentre si compila. Se divergessero,
//  l'operatore vedrebbe un numero mentre parla col cliente e il documento ne
//  porterebbe un altro.
// ═══════════════════════════════════════════════════════════════════════════════
import { createHash } from 'node:crypto';
import * as M from './analisiBisogniRating.js';

/* L'impronta delle regole, condivisa con IAM (verifica/analisi-bisogni.test.mjs).
   Si calcola sul CODICE delle funzioni come lo vede il motore JavaScript, non
   sul testo del file: commenti e spaziatura non contano, contano le regole.

   Se questa prova diventa rossa non e' un capriccio. Vuol dire che qualcuno ha
   cambiato le regole: allora vanno cambiate in TUTTI E DUE i file, va alzata
   VERSIONE_REGOLE, e va aggiornato questo valore qui e nella prova gemella. */
const IMPRONTA_ATTESA = 'f378179307977aa8';

const esiti = [];
const prova = (nome, fn) => {
  try { fn(); esiti.push([true, nome, '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

const oggi = new Date('2026-08-05T12:00:00Z');
const base = () => ({
  anagrafica: { nascita: '1984-06-14' },
  famiglia: 'figli', dipendenzaReddito: 'totale', casa: 'mutuo',
  patrimonio: ['prima_casa'], coperture: [], copertureConfermate: true, interessi: [],
});
const cat = (d, k) => M.calcolaNecessita(d, { dataRiferimento: oggi }).find(n => n.chiave === k);

// ── I tre modi in cui un punteggio può mentire ─────────────────────────────
prova('senza risposte è grigio, mai verde', () => {
  /* Il verde è un'affermazione: «ho guardato e va bene». Su un questionario
     vuoto nessuno ha guardato niente, e un punteggio basso vuol dire solo che
     non c'è ancora nulla che lo alzi. */
  const r = M.calcolaNecessita({ anagrafica: {}, coperture: [], interessi: [] }, { dataRiferimento: oggi });
  deve(r.every(n => n.colore !== 'verde'), 'un questionario vuoto ha prodotto un verde');
  deve(r.filter(n => n.colore === 'grigio').length >= 4, 'troppe categorie si esprimono senza dati');
});

prova('un prodotto dichiarato è blu, mai verde', () => {
  /* «Ho la polizza casa» non è «sono coperto»: massimali, esclusioni e
     franchigie non le ha lette nessuno. Il verde chiuderebbe l'area proprio
     dove servirebbe aprirla. */
  for (const [cop, chiave] of [['casa','casa'],['tcm','famiglia'],['salute','salute'],['previdenza','previdenza'],['rcfam','responsabilita']]) {
    const d = base(); d.coperture = [cop];
    const r = cat(d, chiave);
    deve(r.colore === 'blu', cop + ' non produce blu su ' + chiave + ': dà ' + r.colore);
    deve(r.punteggio > 0, chiave + ' in blu ha perso il punteggio');
  }
});

prova('l\'indice non pesa le categorie grigie', () => {
  /* Farle entrare col loro punteggio basso abbasserebbe l'indice come se
     fosse una buona notizia, mentre vuol dire solo che non sappiamo niente. */
  const con = M.calcolaIndiceComplessivo([
    { punteggio: 100, colore: 'rosso' }, { punteggio: 50, colore: 'ambra' }, { punteggio: 10, colore: 'grigio' }]);
  const senza = M.calcolaIndiceComplessivo([
    { punteggio: 100, colore: 'rosso' }, { punteggio: 50, colore: 'ambra' }]);
  deve(con === senza, 'la grigia sposta l\'indice: ' + con + ' invece di ' + senza);
  deve(M.calcolaIndiceComplessivo([{ punteggio: 40, colore: 'grigio' }]) === null,
    'con sole grigie stampa un numero invece di tacere');
});

// ── Che sia lo stesso calcolo, sempre ──────────────────────────────────────
prova('stesse risposte, stesso risultato', () => {
  /* Un rating che cambia da solo non si può firmare. Nessun caso, nessuna
     data «adesso» nascosta dentro: la data di riferimento arriva da fuori. */
  const a = M.creaSnapshotRating(base(), { dataRiferimento: oggi });
  const b = M.creaSnapshotRating(base(), { dataRiferimento: oggi });
  deve(JSON.stringify(a) === JSON.stringify(b), 'due calcoli identici danno risultati diversi');
  deve(a.generatoIl === oggi.toISOString(), 'lo snapshot non porta la data di riferimento');
  deve(a.versioneRegole === M.VERSIONE_REGOLE, 'lo snapshot non porta la versione delle regole');
});

prova('ogni categoria porta i suoi perché', () => {
  for (const n of M.calcolaNecessita(base(), { dataRiferimento: oggi })) {
    deve(Array.isArray(n.motivi) && n.motivi.length, 'categoria senza motivi: ' + n.chiave);
    deve(n.prossimoPasso && n.prossimoPasso.length > 10, 'categoria senza prossimo passo: ' + n.chiave);
    deve(n.versioneRegole === M.VERSIONE_REGOLE, 'categoria senza versione: ' + n.chiave);
  }
});

prova('l\'età si calcola in UTC e non sbaglia il compleanno', () => {
  /* Sull'ora locale il compleanno si sposta di un giorno a cavallo di
     mezzanotte, e chi compie 45 anni finirebbe in una fascia di punteggio
     diversa a seconda di che ore sono. */
  const vigilia = { anagrafica: { nascita: '1981-08-06' }, coperture: [], interessi: [], famiglia: 'solo', dipendenzaReddito: 'bassa', casa: 'affitto', patrimonio: [], copertureConfermate: true };
  const compleanno = { ...vigilia, anagrafica: { nascita: '1981-08-05' } };
  /* 44 anni prende gia' il bonus della fascia 35+ (12), 45 anni prende quello
     della fascia 45+ (22): il salto vale la DIFFERENZA, 10. La prima volta
     avevo scritto 22 e la prova e' diventata rossa su codice corretto. */
  const a = cat(vigilia, 'previdenza').punteggio;      // 44 anni: 15 + 12 = 27
  const b = cat(compleanno, 'previdenza').punteggio;   // 45 compiuti oggi: 15 + 22 = 37
  deve(a === 27 && b === 37, 'le fasce di età non danno i punteggi attesi: ' + a + ' → ' + b);
  deve(b > a, 'il compleanno non sposta la fascia');
});

// ── Le due copie ───────────────────────────────────────────────────────────
prova('le regole sono identiche a quelle di IAM', () => {
  const pezzi = [
    M.VERSIONE_REGOLE, M.VERSIONE_QUESTIONARIO, JSON.stringify(M.META_CATEGORIE),
    M.calcolaNecessita.toString(), M.calcolaIndiceComplessivo.toString(), M.creaSnapshotRating.toString(),
  ].join(' ');
  const impronta = createHash('sha256').update(pezzi.replace(/\s+/g, ' ')).digest('hex').slice(0, 16);
  deve(impronta === IMPRONTA_ATTESA,
    'le regole del motore sono cambiate (impronta ' + impronta + ' invece di ' + IMPRONTA_ATTESA + '). '
    + 'Se è voluto: cambia anche IAM, alza VERSIONE_REGOLE e aggiorna il valore in tutte e due le prove.');
});

let ko = 0;
console.log('\nANALISI DEI BISOGNI — motore del rating');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nRATING: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
