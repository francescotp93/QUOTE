/* ═══════════════════════════════════════════════════════════════════════════
   COLLABORATORI — le prove
   La più importante del sistema: la scala dei ruoli mostrata a schermo deve
   essere IDENTICA a quella che applica il database (iam_mio_ruolo). Se le due
   divergono, l'interfaccia racconta permessi che non esistono.
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { esiti, deve, uguale, RADICE } from './banco.mjs';
import { ruoloEffettivo, poteri, ruoloIgnoto, nomeDi, filtra, fasceDa } from '../moduli/utenti.js';

const e = esiti('COLLABORATORI — chi vede cosa');

e.prova('la scala dei ruoli è quella del database, parola per parola', () => {
  /* iam_mio_ruolo(): admin/top_master → admin; operatore/master → operatore;
     tutto il resto → collaboratore. */
  uguale(ruoloEffettivo({ ruolo: 'admin' }), 'admin');
  uguale(ruoloEffettivo({ ruolo: 'top_master' }), 'admin');
  uguale(ruoloEffettivo({ ruolo: 'operatore' }), 'operatore');
  uguale(ruoloEffettivo({ ruolo: 'master' }), 'operatore');
  uguale(ruoloEffettivo({ ruolo: 'collaboratore' }), 'collaboratore');
});

e.prova('«operativo» NON è «operatore»: vale come collaboratore', () => {
  /* Sono due parole diverse e nei dati veri ci sono entrambe. Chi ha «operativo»
     non è ufficio, e il database la pensa allo stesso modo. */
  uguale(ruoloEffettivo({ ruolo: 'operativo' }), 'collaboratore');
});

e.prova('un ruolo scritto male non passa in silenzio', () => {
  deve(ruoloIgnoto({ ruolo: 'operativo' }), '«operativo» non è fra quelli riconosciuti: va segnalato');
  deve(ruoloIgnoto({ ruolo: 'Amministratore' }), 'scritto in italiano non viene riconosciuto dal database');
  deve(!ruoloIgnoto({ ruolo: 'top_master' }), 'questo è regolare');
  deve(!ruoloIgnoto({}), 'un ruolo vuoto non è un errore di scrittura');
});

e.prova('a ogni ruolo corrisponde una spiegazione di che cosa vede', () => {
  deve(/tutto/i.test(poteri({ ruolo: 'admin' }).spiega), 'un amministratore vede tutto');
  deve(/tutti/i.test(poteri({ ruolo: 'operatore' }).spiega), 'l\'ufficio vede il lavoro di tutti');
  deve(/propri/i.test(poteri({ ruolo: 'collaboratore' }).spiega), 'un collaboratore vede il proprio');
});

e.prova('il nome si compone anche quando manca', () => {
  uguale(nomeDi({ nome: 'Mario', cognome: 'Rossi' }), 'Mario Rossi');
  uguale(nomeDi({ email: 'mario.rossi@x.it' }), 'mario.rossi');
  uguale(nomeDi({}), '(senza nome)');
});

e.prova('si trovano i sospesi e chi ha poteri di amministratore', () => {
  const righe = [
    { id: 'a', ruolo: 'top_master', attivo: true },
    { id: 'b', ruolo: 'collaboratore', attivo: false },
    { id: 'c', ruolo: 'operativo', attivo: true }
  ];
  uguale(filtra(righe, { gruppo: 'admin' }).map(u => u.id), ['a']);
  uguale(filtra(righe, { gruppo: 'sospesi' }).map(u => u.id), ['b']);
  uguale(filtra(righe, { gruppo: 'strani' }).map(u => u.id), ['c']);
});

e.prova('la fascia dei ruoli scritti male compare solo se ce ne sono', () => {
  const puliti = fasceDa([{ ruolo: 'admin', attivo: true }]);
  deve(!puliti.some(f => f.chiave === 'strani'), 'tutto regolare: niente allarme');
  const sporchi = fasceDa([{ ruolo: 'operativo', attivo: true }]);
  deve(sporchi.some(f => f.chiave === 'strani'), 'c\'è un ruolo non riconosciuto e va visto');
});

/* ── La regola che non si discute ─────────────────────────────────────────── */
e.prova('nessuna password compare da nessuna parte', () => {
  const src = fs.readFileSync(path.join(RADICE, 'moduli', 'utenti.js'), 'utf8');
  const codice = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(r => !/^\s*\/\//.test(r)).join('\n');
  deve(!/password|pwd/i.test(codice),
    'il codice nomina una password: le credenziali non si leggono e non si mostrano mai');
});

e.prova('la scala dei ruoli è la stessa anche in nucleo/dati.js', () => {
  /* Sono due punti che decidono la stessa cosa. Finché restano due, l'unico
     modo per non farli divergere è controllarli insieme. */
  const src = fs.readFileSync(path.join(RADICE, 'nucleo', 'dati.js'), 'utf8');
  deve(/\['admin',\s*'top_master'\]/.test(src), 'in dati.js gli admin non sono admin+top_master');
  deve(/\['operatore',\s*'master'\]/.test(src), 'in dati.js lo staff non è operatore+master');
});

process.exit(e.stampa() === 0 ? 0 : 1);
