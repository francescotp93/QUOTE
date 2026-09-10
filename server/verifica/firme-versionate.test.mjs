// ═══════════════════════════════════════════════════════════════════════════════
//  FIRME VERSIONATE (M2)
//
//  Il flusso di firma con OTP esisteva gia' e funziona. M2 gli aggiunge tre
//  cose che il meccanismo non sapeva dire, e ognuna serve mesi dopo:
//
//    1. A CHI APPARTIENE. iam_mie_firme() — la funzione da cui il
//       collaboratore legge i suoi documenti nell'area riservata — filtra su
//       utente_id. Se la riga nasce senza, quella funzione non tornera' mai
//       niente e la migrazione resta decorativa. Questa e' la prova che se ne
//       accorge.
//
//    2. QUALE VERSIONE. Sostituire il file in doc_url quando cambiano le
//       tabelle provvigionali, lasciando la stessa riga, rende impossibile
//       dimostrare a quali condizioni una provvigione era maturata.
//
//    3. QUALE PRODOTTO, per il POG. Sotto IDD l'obbligo e' per prodotto e per
//       versione: un POG senza le due cose e' una firma che fra un anno non si
//       sa piu' a cosa si riferisca. Si rifiuta in partenza.
//
//  Le due funzioni girano davvero, con un Supabase finto passato come
//  dipendenza. Non si importa firmaCollab.js: quello importa express, che nel
//  repository non e' fra le dipendenze — una prova che lo importasse
//  uscirebbe verde senza provare niente. Per questo la logica sta in
//  firmeDati.js, e l'ultima prova qui sotto controlla che la rotta la chiami
//  davvero: una funzione giusta che nessuno invoca non serve a nulla.
// ═══════════════════════════════════════════════════════════════════════════════

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const esiti = [];
const prova = async (nome, fn) => {
  try { await fn(); esiti.push([true, nome, '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, m) => { if (!c) throw new Error(m); };

/* Il Supabase finto: si passa a chiFirma come dipendenza, ed e' quello che
   rende la funzione provabile senza tirare su niente. Le tre anagrafiche
   sono tre casi veri: un attivo collegato (iam_team con collab_id), un attivo
   storico (senza collegamento, si trova per email) e un candidato (sta solo
   in quote_collaboratori, e puo' non avere ancora un accesso). */
function banco({ collab, utente } = {}) {
  const chieste = [];
  const sbGet = async (path) => {
    chieste.push(path);
    if (path.startsWith('quote_collaboratori')) return collab ? [collab] : [];
    if (path.startsWith('iam_utenti')) return utente ? [utente] : [];
    return [];
  };
  return { sbGet, chieste };
}

const { chiFirma, controllaPog } = await import('../firmeDati.js');

const TEAM_COLLEGATO = { id: 't1', nome: 'Rosalia', cogn: 'Militello', email: 'r.militello@email.it', collab_id: 'c1' };
const COLLAB = { id: 'c1', iam_id: 'u-rosalia', email: 'r.militello@email.it' };

/* ── 1. a chi appartiene ────────────────────────────────────────────────── */

await prova('la firma sa a quale utente IAM appartiene', async () => {
  const b = banco({ collab: COLLAB });
  const chi = await chiFirma(TEAM_COLLEGATO, b.sbGet);
  deve(chi.utente_id === 'u-rosalia',
    'senza utente_id iam_mie_firme() non tornerà mai niente: ' + chi.utente_id);
  deve(chi.collab_id === 'c1', 'la firma non è agganciata alla scheda anagrafica: ' + chi.collab_id);
});

await prova('e per gli attivi storici si ripiega sull\'email', async () => {
  /* Le schede di iam_team create prima che collab_id esistesse non hanno il
     collegamento: e' lo stesso ripiego che usa schedaAnagrafica() in IAM. */
  const senzaLegame = { id: 't2', nome: 'Davide', cogn: 'Ingrassia', email: 'D.Ingrassia@Email.it' };
  const b = banco({ collab: { id: 'c2', iam_id: 'u-davide', email: 'd.ingrassia@email.it' } });
  const chi = await chiFirma(senzaLegame, b.sbGet);
  deve(chi.utente_id === 'u-davide',
    'una scheda senza collab_id non trova più il suo utente: ' + chi.utente_id);
  deve(b.chieste.some(p => p.includes('d.ingrassia%40email.it')),
    'ha cercato con l\'email non normalizzata: ' + b.chieste.join(' | '));
});

await prova('e in ultima istanza sull\'utente IAM con la stessa email', async () => {
  const b = banco({ collab: null, utente: { id: 'u-solo' } });
  const chi = await chiFirma({ id: 't3', email: 'storico@email.it' }, b.sbGet);
  deve(chi.utente_id === 'u-solo', 'l\'ultimo ripiego non funziona: ' + chi.utente_id);
});

await prova('un candidato senza accesso non blocca l\'invio', async () => {
  /* Chi non ha ancora un'utenza non deve impedire la spedizione: le colonne
     restano vuote e la firma si vede dallo staff, come sempre. */
  const b = banco({ collab: { id: 'c9', iam_id: null, email: 'nuovo@email.it' }, utente: null });
  const chi = await chiFirma({ id: 'c9', email: 'nuovo@email.it', _candidato: true, iam_id: null }, b.sbGet);
  deve(!chi.utente_id, 'ha inventato un utente per chi non ce l\'ha: ' + chi.utente_id);
  deve(chi.collab_id === 'c9', 'ha perso anche il collegamento alla scheda');
});

await prova('e se il database non risponde non si tira giù l\'invio', async () => {
  const rotto = async () => { throw new Error('database non raggiungibile'); };
  const chi = await chiFirma(TEAM_COLLEGATO, rotto);
  deve(chi && !chi.utente_id && !chi.collab_id,
    'un errore di lettura fa saltare la spedizione del documento');
});

/* ── 2. il POG ──────────────────────────────────────────────────────────── */

await prova('un POG senza prodotto e versione viene rifiutato', async () => {
  const senza = controllaPog({ tipo: 'pog' });
  deve(senza, 'ha accettato un POG senza prodotto né versione');
  deve(/IDD|prodotto/i.test(senza), 'non dice perché lo rifiuta: ' + senza);
  deve(controllaPog({ tipo: 'pog', prodottoId: 'p1' }),
    'ha accettato un POG senza versione: fra un anno non si saprebbe quale');
  deve(controllaPog({ tipo: 'pog', versione: '2026.1' }),
    'ha accettato un POG senza prodotto');
});

await prova('e uno completo passa', () => {
  deve(controllaPog({ tipo: 'pog', prodottoId: 'p-rcauto', versione: '2026.1' }) === null,
    'ha rifiutato un POG completo');
});

await prova('gli altri documenti non chiedono un prodotto', () => {
  /* Il controllo vale per il POG e basta: un mandato non ha un prodotto, e
     pretenderlo bloccherebbe il plico d'ingresso. */
  for (const tipo of ['mandato', 'privacy_intermediario', 'tabella_provvigionale']) {
    deve(controllaPog({ tipo }) === null, tipo + ' viene rifiutato per mancanza di prodotto');
  }
});

await prova('la rotta usa davvero questi due controlli', () => {
  /* Le funzioni possono essere giuste e non essere chiamate da nessuno. */
  const fs = require('fs');
  const src = fs.readFileSync(new URL('../firmaCollab.js', import.meta.url), 'utf8');
  deve(/from '\.\/firmeDati\.js'/.test(src), 'firmaCollab non importa più firmeDati');
  deve(/controllaPog\(/.test(src), 'il controllo POG non viene chiamato dalla rotta');
  deve(/chiFirma\(c, sbGet\)/.test(src), 'chiFirma non viene chiamata dalla rotta');
  deve(/utente_id: chi\.utente_id/.test(src), 'utente_id non finisce nella riga di iam_firme');
});

/* ── esecuzione ─────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Firme versionate: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
