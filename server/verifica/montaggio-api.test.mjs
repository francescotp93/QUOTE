// ═══════════════════════════════════════════════════════════════════════════════
//  L'API v1 E' MONTATA SUL BACKEND CHE GIRA DAVVERO
//
//  Nel repository ci sono DUE backend: server/index.js (quello che la VPS avvia
//  come withus-backend, e che monta /moto, /fonti, /pay) e un server.js alla
//  radice con routes/ che non e' avviato da nessuno. Il secondo sembra il posto
//  naturale per un'API /api/v1 — e implementarla li' darebbe un endpoint che
//  non risponde mai, senza nessun errore a dirlo.
//
//  Questa prova esiste perche' quello sbaglio si fa una volta sola.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const qui = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const idx = fs.readFileSync(path.join(qui, 'index.js'), 'utf8');
const moto = fs.readFileSync(path.join(qui, 'moto.js'), 'utf8');
const prod = fs.readFileSync(path.join(qui, 'prodottiApi.js'), 'utf8');

const esiti = [];
const prova = (n, f) => { try { f(); esiti.push([true, n, '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('l\'API e\' montata sul backend avviato dalla VPS', () => {
  deve(/app\.use\('\/api\/v1'/.test(idx), 'server/index.js non monta /api/v1: l\'endpoint non risponderebbe mai');
  deve(/creaApiQuotazione/.test(idx), 'non usa il router del contratto');
});

prova('la chiave interna non e\' scritta nel codice, da nessuna parte', () => {
  /* Questa prova chiedeva «la chiave arriva da process.env». Era il MEZZO, non
     il FINE: dal 20/08/2026 la chiave nasce dentro Supabase e i due lati del
     ponte la leggono da li' — cosi' nessuno la digita e nessuno la incolla —
     e la prova e' diventata rossa su codice piu' sicuro di prima.
     Il fine e' uno solo: nel repository non ci deve finire mai. */
  const cond = fs.readFileSync(path.join(qui, 'chiaveCondivisa.js'), 'utf8');
  for (const [nome, testo] of [['index.js', idx], ['chiaveCondivisa.js', cond]]) {
    deve(!/INTERNAL_API_KEY\s*\|\|\s*['"][^'"]{6,}/.test(testo),
      nome + ': c\'e\' una chiave di ripiego scritta nel codice');
    deve(!/[a-f0-9]{40,}/.test(testo.replace(/https?:\/\/\S+/g, '')),
      nome + ': c\'e\' una stringa che sembra un segreto scritto a mano');
  }
  /* La via di fuga resta: se un giorno Supabase non risponde, si riapre il
     ponte mettendo la chiave nel .env. */
  deve(/process\.env\.INTERNAL_API_KEY/.test(cond),
    'e\' sparita la via di fuga a mano: senza, un guasto a Supabase chiude il ponte e non si puo\' riaprire');
  deve(/ponte_segreti/.test(cond), 'non legge piu\' la chiave dal posto concordato');
});

prova('la chiave non finisce nel registro, nemmeno per sbaglio', () => {
  /* Un console.log con dentro il valore basta a spargere il segreto su tutti i
     giornali della macchina, che nessuno cancella mai. Si registra solo
     l'impronta, che serve a confrontare i due lati e non torna indietro. */
  const cond = fs.readFileSync(path.join(qui, 'chiaveCondivisa.js'), 'utf8');
  const righeLog = cond.split('\n').filter(r => /log\(\{/.test(r));
  deve(righeLog.length >= 2, 'non registra piu' + '\' niente: un ponte che non si apre e non lo dice');
  for (const r of righeLog) {
    deve(!/valore|:\s*v\b|chiave:\s*v/.test(r), 'una riga di registro porta con se\' il valore: ' + r.trim().slice(0, 90));
  }
  deve(/impronta/.test(cond), 'non si registra nemmeno l\'impronta: due copie diverse non si scoprirebbero');
});

prova('non passa da requireAuth (e\' una chiamata fra server)', () => {
  const riga = idx.split('\n').find(r => r.includes("app.use('/api/v1'"));
  deve(riga && !/requireAuth/.test(riga),
    'l\'API v1 e\' sotto requireAuth: IAM dovrebbe girare il token dell\'utente, che e\' il legame che stiamo togliendo');
});

prova('le rotte esistenti restano dove sono', () => {
  /* /api/v1 e' un prefisso nuovo e non si sovrappone a niente, ma se qualcuno
     lo montasse prima di /moto o /fonti cambierebbe l'ordine di risoluzione. */
  for (const r of ['/moto', '/fonti', '/pay', '/preventivi']) {
    deve(idx.includes("app.use('" + r + "'"), 'la rotta ' + r + ' non e\' piu\' montata');
  }
  const posApi = idx.indexOf("app.use('/api/v1'");
  const posMoto = idx.indexOf("app.use('/moto'");
  deve(posApi < posMoto || posMoto < 0, 'ordine di montaggio inatteso');
});

prova('anche le Fonti sono montate sul backend avviato dalla VPS', () => {
  deve(/app\.use\('\/api\/v1\/fonti'/.test(idx), 'server/index.js non monta /api/v1/fonti');
  deve(/creaApiFonti/.test(idx), 'non usa lo strato v1 delle Fonti');
  const riga = idx.split('\n').find(r => r.includes("app.use('/api/v1/fonti'"));
  deve(riga && !/requireAuth/.test(riga),
    'le Fonti v1 sono sotto requireAuth: IAM dovrebbe girare il token dell\'utente');
});

prova('le Fonti v1 sono montate PRIMA della quotazione v1', () => {
  /* app.use('/api/v1', ...) e' montata su un PREFISSO: se venisse prima, ogni
     chiamata alle Fonti le passerebbe davanti — nessun danno visibile, ma due
     righe di registro per ogni chiamata e la prima che non porta a niente.
     E' lo stesso inciampo di /fonti/vigilanza dentro /fonti/:id. */
  const posFonti = idx.indexOf("app.use('/api/v1/fonti'");
  const posQuote = idx.indexOf("app.use('/api/v1'");
  deve(posFonti > 0 && posQuote > 0, 'una delle due non e\' montata');
  deve(posFonti < posQuote, 'la quotazione v1 e\' montata prima delle Fonti v1');
});

prova('l\'involucro e la porta d\'ingresso stanno in un posto solo', () => {
  /* Due copie della lista errori divergono al primo codice aggiunto, e IAM si
     trova davanti due dialetti dello stesso contratto. */
  const comune = fs.readFileSync(path.join(qui, 'apiComune.js'), 'utf8');
  const quote = fs.readFileSync(path.join(qui, 'quoteApi.js'), 'utf8');
  const fonti = fs.readFileSync(path.join(qui, 'fontiApi.js'), 'utf8');
  deve(/export const ERRORI/.test(comune), 'la lista errori non sta in apiComune.js');
  for (const [nome, testo] of [['quoteApi.js', quote], ['fontiApi.js', fonti]]) {
    deve(/from '\.\/apiComune\.js'/.test(testo), nome + ' non usa l\'involucro condiviso');
    deve(!/const ERRORI\s*=\s*\[/.test(testo), nome + ' ha una copia sua della lista errori');
    deve(!/timingSafeEqual/.test(testo), nome + ' ha una copia sua del controllo della chiave');
  }
});

prova('la scrittura delle credenziali non si apre per distrazione', () => {
  /* Deciso il 20/08/2026: la chiave interna dice «sono IAM», non dice «e' stato
     Tizio». Se questo cancello sparisce, chiunque abbia la chiave puo' scrivere
     una password nel Pannello Fonti senza lasciare un nome. */
  const fonti = fs.readFileSync(path.join(qui, 'fontiApi.js'), 'utf8');
  const elenco = fonti.slice(fonti.indexOf('const SCRITTURE'), fonti.indexOf('function eScrittura'));
  deve(/x-operatore/i.test(fonti), 'X-Operatore non e\' piu\' richiesto');
  deve(/FORBIDDEN/.test(fonti), 'la scrittura senza operatore non risponde piu\' FORBIDDEN');
  deve(/credenziali/.test(elenco), 'le rotte delle credenziali non sono piu\' fra le scritture protette');
});

prova('l\'elenco dei campi Casa non e\' duplicato', () => {
  /* Due copie divergono al primo campo aggiunto, e il preventivo esce senza
     quel dato senza che nessuno se ne accorga. */
  deve(/export const CASA_KEYS/.test(moto), 'CASA_KEYS non e\' esportata da moto.js');
  deve(/import \{ CASA_KEYS \} from '\.\/moto\.js'/.test(prod), 'l\'adattatore non riusa CASA_KEYS');
  deve(!/const CASA_KEYS\s*=\s*\[/.test(prod), 'l\'adattatore ha una copia sua dei campi Casa');
});

prova('l\'adattatore non calcola premi: li chiede e basta', () => {
  /* La regola non negoziabile e' che le costanti di calcolo vivano in un posto
     solo. Un adattatore che comincia a moltiplicare coefficienti e' un secondo
     posto. */
  deve(!/COEFF|DED_MAX|REND_FONDO|tariffa\s*\[/i.test(prod), 'l\'adattatore contiene costanti di calcolo');
  deve(/fetch\(HDI/.test(prod), 'l\'adattatore non chiede il premio al provider');
});

prova('gli adattatori non arrotondano il premio', () => {
  /* Deciso il 17/08/2026: il premio esce grezzo perche' e' IAM che lo stampa.
     Se arrotondasse QUOTO, IAM riceverebbe un numero gia' tagliato e non
     potrebbe piu' fare rate e frazionamenti senza trascinarsi dietro l'errore.
     Un Math.round di troppo qui dentro cambierebbe il premio in silenzio. */
  const righe = prod.split('\n').filter(r => /premio_annuo\s*:/.test(r));
  deve(righe.length > 0, 'nessun adattatore restituisce un premio');
  for (const r of righe) {
    deve(!/Math\.(round|floor|ceil)|toFixed/.test(r),
      'un adattatore arrotonda il premio: ' + r.trim().slice(0, 70));
  }
  return righe.length + ' premi, nessuno arrotondato';
});

let ko = 0;
console.log('\nMONTAGGIO API v1');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n : '  X   ' + n + ' — ' + m); if (!ok) ko++; }
console.log(`\nMONTAGGIO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
