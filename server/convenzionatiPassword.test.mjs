// ═══════════════════════════════════════════════════════════════════════════════
//  LE PASSWORD DEGLI ASSOCIATI
//
//  PERCHE' ESISTE
//    Il 2 settembre 2026 abbiamo provato ad accendere su Supabase il controllo
//    contro le password finite nelle fughe di dati. Non si e' potuto: e'
//    riservato ai piani Pro («Configuring leaked password protection via
//    HaveIBeenPwned.org is available on Pro Plans and up»).
//
//    Quindi quel controllo ce lo facciamo noi. Non copre quella lista — nessuno
//    puo' — ma copre quello che le persone scelgono DAVVERO quando devono
//    inventare una password in fretta: il proprio nome, la propria email, il
//    nome dell'agenzia, o una tastiera premuta in fila.
//
//    E copre la password PROVVISORIA, che e' l'unica che generiamo noi: se
//    quella fosse indovinabile, tutto il resto non conterebbe niente.
// ═══════════════════════════════════════════════════════════════════════════════
import { passwordProvvisoria, passwordDebole } from './convenzionati.js';

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('la password provvisoria non si puo\' indovinare', () => {
  /* Presa da crypto, non da Math.random: una password che si ricava sapendo
     l'ora in cui e' stata creata non e' una password. Mille estrazioni non
     devono ripetersi mai. */
  const viste = new Set();
  for (let i = 0; i < 1000; i++) viste.add(passwordProvvisoria());
  deve(viste.size === 1000, 'su mille ne ha ripetute ' + (1000 - viste.size));
  return 'mille estrazioni, mille password diverse';
});

prova('si puo\' leggere da un\'email e ribattere a mano', () => {
  /* Va letta spesso dal telefono. Chi confonde uno zero con una O pensa che
     l'accesso non funzioni, non che abbia letto male. */
  for (let i = 0; i < 200; i++) {
    const p = passwordProvvisoria();
    deve(!/[0O1lI]/.test(p), 'contiene caratteri che si confondono: ' + p);
    deve(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(p), 'non ha la forma a gruppi: ' + p);
  }
  return 'niente 0/O e 1/l/I, tre gruppi da quattro';
});

prova('la password provvisoria passa il nostro stesso controllo', () => {
  // Sarebbe assurdo generare noi una password che poi rifiutiamo.
  /* Duemila, non venti: la prima versione sbagliava circa una volta ogni
     trecento (usciva di sole lettere) e con poche estrazioni sarebbe passata.
     Una prova che non gira abbastanza da incontrare il caso raro e' una prova
     che dorme. */
  for (let i = 0; i < 2000; i++) {
    const p = passwordProvvisoria();
    deve(passwordDebole(p) === null, 'una password generata da noi viene rifiutata: ' + p + ' — ' + passwordDebole(p));
    deve(/[0-9]/.test(p) && /[A-Z]/.test(p), 'manca una cifra o una lettera: ' + p);
  }
  return 'duemila estrazioni, tutte accettabili';
});

prova('le password piu\' usate al mondo vengono rifiutate', () => {
  for (const p of ['password', 'Password1', '12345678', 'qwertyui', 'abc12345', 'iloveyou1', 'welcome1']) {
    deve(passwordDebole(p) !== null, 'accetta «' + p + '»');
  }
  return 'sette classici, sette rifiuti';
});

prova('non si puo\' usare il proprio nome o la propria email', () => {
  // Sono le prime due cose che prova chi vuole entrare al posto di qualcun altro.
  const chi = { email: 'mario.rossi@esempio.it', nome: 'Mario', cognome: 'Rossi' };
  deve(passwordDebole('Mario2026', chi) !== null, 'accetta il nome');
  deve(passwordDebole('rossi1234', chi) !== null, 'accetta il cognome');
  deve(passwordDebole('mario.rossi9', chi) !== null, 'accetta la parte prima della chiocciola');
  deve(passwordDebole('Kq7vRt2m', chi) === null, 'rifiuta una password che va benissimo');
  return 'nome, cognome ed email fuori';
});

prova('il nome dell\'agenzia non e\' una password', () => {
  for (const p of ['withus2026', 'Assicurazioni1', 'convenzione7']) {
    deve(passwordDebole(p) !== null, 'accetta «' + p + '»');
  }
  return 'la cosa piu\' a portata di mano e\' anche la prima che si prova';
});

prova('ogni rifiuto dice cosa fare, non solo che e\' sbagliata', () => {
  /* Un «password non valida» senza spiegazione fa riprovare a caso. Qui la
     stessa disciplina delle Fonti: il messaggio manda dalla parte giusta. */
  const casi = [
    ['abc', /almeno 8/],
    ['password', /piu.{0,3} usate|scegline/i],
    ['aaaaaaaa', /ripetuto/],
    ['abcdefgh', /sequenza/],
    ['soltantolettere', /numero/],
  ];
  for (const [p, atteso] of casi) {
    const m = passwordDebole(p);
    deve(m && atteso.test(m), 'per «' + p + '» dice: ' + m);
  }
  return 'cinque rifiuti, cinque indicazioni diverse';
});

prova('una password buona passa', () => {
  for (const p of ['Girasole47Blu', 'Kq7vRt2mXz', 'panePer4Gatti']) {
    deve(passwordDebole(p) === null, 'rifiuta «' + p + '»: ' + passwordDebole(p));
  }
  return 'il controllo non e\' un muro: lascia passare quello che va bene';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Le password degli associati ──────────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
