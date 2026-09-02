// ═══════════════════════════════════════════════════════════════════════════════
//  CHI STA ENTRANDO NELL'AREA RISERVATA
//
//  PERCHE' ESISTE
//    Il 2 settembre 2026 un associato era dentro — leggeva i suoi dati nel
//    browser — e il nostro server gli rispondeva «Accesso non valido o scaduto:
//    rientra». Il motivo, letto nel log della macchina: la porta a cui
//    chiedevamo «chi e' questo?» (/auth/v1/user) rispondeva 403 a un token
//    validissimo.
//
//    La correzione non e' stata insistere su quella porta: e' stato chiedere al
//    DATABASE, cioe' alla stessa strada che nel browser funzionava gia'. Se la
//    protezione restituisce una riga presentando quel token, due cose sono vere
//    insieme — il token e' valido, e quella riga e' sua.
//
//    Queste prove tengono ferme le tre regole di quel riconoscimento, e la piu'
//    importante e' la terza: con il token di una persona dello STAFF la stessa
//    lettura restituisce molte righe (lo staff le vede tutte). Se passasse,
//    entrerebbe nell'area riservata al posto di un associato.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8');
const pezzo = src.slice(src.indexOf('async function chiEntra'), src.indexOf('// POST /convenzionati/mia-password'));
/* SI GUARDA IL CODICE, NON I COMMENTI. Il commento qui sopra RACCONTA che una
   volta si chiedeva a /auth/v1/user: se la prova leggesse anche quello, si
   accenderebbe sulla spiegazione del difetto invece che sul difetto.
   E' il terzo inciampo dello stesso tipo in un giorno — «token» che compariva
   nella riga che spiegava perche' non si tocca, «Convenzioni» in un commento
   dei sinonimi — quindi qui si toglie di mezzo una volta per tutte. */
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const chiEntra = senzaCommenti(pezzo);

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('senza token non si entra', () => {
  deve(/if \(!tok\)/.test(chiEntra), 'una richiesta senza accesso passa oltre');
  deve(/e\.stato = 401/.test(chiEntra), 'non risponde «serve un accesso»');
  return 'la porta e\' chiusa a chi non bussa';
});

prova('il token si verifica sulla strada che funziona: il database', () => {
  /* Non /auth/v1/user, che il 2 settembre ha risposto 403 a un accesso valido.
     Una porta in meno e' anche una porta in meno che puo' dire di no per conto
     proprio. */
  deve(/rest\/v1\/quote_convenzione_associati/.test(chiEntra), 'non legge la tabella col token della persona');
  deve(!/auth\/v1\/user/.test(chiEntra), 'chiede ancora a /auth/v1/user: e\' la porta che rispondeva 403');
  deve(/SUPABASE_ANON/.test(chiEntra), 'presenta la chiave di servizio invece di quella pubblica: la protezione non scatterebbe');
  return 'un giro solo, e dice anche di chi e\'';
});

prova('UNA riga sola: con un token dello staff non si entra', () => {
  /* La regola che conta. Lo staff vede TUTTI gli associati: presentando il suo
     token, la stessa lettura ne restituisce molte. Chi vede tutti non e' uno di
     loro, e nell'area riservata non deve entrare al posto di nessuno. */
  deve(/limit=2/.test(chiEntra), 'chiede una riga sola: cosi\' non puo\' accorgersi che sono tante');
  deve(/righe\.length !== 1/.test(chiEntra), 'accetta anche quando le righe sono piu\' di una');
  deve(/e\.stato = 403/.test(chiEntra), 'non risponde «non abilitato»');
  return 'chi vede tutti non e\' uno di loro';
});

prova('una richiesta non ancora approvata non e\' un accesso', () => {
  deve(/stato !== 'approvato'/.test(chiEntra), 'lascia entrare anche chi e\' in attesa o rifiutato');
  deve(/non risulta approvata/.test(chiEntra), 'non dice perche\': chi legge pensa a un guasto');
  return 'in attesa vuol dire fuori, e si capisce';
});

prova('quando non riconosce, il motivo VERO finisce nel log', () => {
  /* Senza, un difetto nostro e un accesso davvero scaduto si somigliano troppo:
     e' cosi' che si passa un'ora a far rientrare una persona che era dentro.
     Il 403 di quel giorno l'ha trovato questo log, non un ragionamento. */
  deve(/console\.warn\('\[convenzionati\] accesso non riconosciuto/.test(chiEntra), 'il motivo si perde');
  deve(/await r\.text\(\)/.test(chiEntra), 'scrive solo il numero dell\'errore, non cosa ha risposto il server');
  return 'la prossima volta si legge, non si indovina';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Chi entra nell\'area riservata ────────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
