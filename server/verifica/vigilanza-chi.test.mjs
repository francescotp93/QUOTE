// ═══════════════════════════════════════════════════════════════════════════════
//  CHI VIENE VIGILATO, E CHI NO
//
//  La vigilanza manda una mail quando una fonte cade. Utile — finché non arriva
//  sempre. Prima è murata da Cloudflare sull'indirizzo del nostro server: non è
//  rotta, è irraggiungibile da lì, e nessun accesso automatico può rimediare.
//  Tenerla nell'elenco dei vigilati voleva dire un allarme a ogni giro, per
//  sempre, e una casella che suona sempre smette di essere guardata: il giorno
//  che cade Italiana o HDI, quella mail finisce nel mucchio.
//
//  Qui si prova la regola: chi entra nel giro e chi resta fuori. La regola è una
//  funzione apposta (fontiDaVigilare) proprio perché si potesse provare senza
//  interrogare portali veri.
// ═══════════════════════════════════════════════════════════════════════════════
import { fontiDaVigilare } from '../fontiWatchdog.js';
import { viaBrowser } from '../fonti.js';

const esiti = [];
const prova = (nome, fn) => { try { fn(); esiti.push([true, nome, '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const fonte = (o) => Object.assign({ attiva: true, surl: 'http://127.0.0.1:4600' }, o);

prova('Prima resta fuori dal giro: non è rotta, è murata', () => {
  const dentro = fontiDaVigilare([fonte({ id: 'c-prima', nome: 'Prima', via_browser: true })]);
  deve(dentro.length === 0, 'Prima verrebbe vigilata: una mail «fonte caduta» a ogni giro, per sempre');
});

prova('le altre fonti si vigilano come prima', () => {
  const elenco = [
    fonte({ id: 'italiana', nome: 'Italiana' }),
    fonte({ id: 'hdi', nome: 'HDI' }),
    fonte({ id: 'c-prima', nome: 'Prima', via_browser: true }),
  ];
  const dentro = fontiDaVigilare(elenco).map(f => f.id);
  deve(dentro.includes('italiana') && dentro.includes('hdi'),
    'la regola ha buttato fuori anche le fonti sane: ' + dentro.join(', ') + ' — cosi\' non si accorge piu\' di niente');
  deve(!dentro.includes('c-prima'), 'Prima e\' rientrata: ' + dentro.join(', '));
});

prova('una fonte spenta o senza servizio non si vigila (com\'era)', () => {
  const dentro = fontiDaVigilare([
    fonte({ id: 'spenta', nome: 'Spenta', attiva: false }),
    fonte({ id: 'senzaurl', nome: 'Senza servizio', surl: '' }),
  ]);
  deve(dentro.length === 0, 'vigila fonti spente o senza servizio: ' + dentro.map(f => f.id).join(', '));
});

prova('col proxy configurato Prima torna vigilabile', () => {
  /* Il motivo dell'esclusione e' l'indirizzo in uscita del server. Con un proxy
     l'indirizzo cambia, quindi il motivo cade: se restasse esclusa a vita, il
     giorno che smette di funzionare col proxy non lo saprebbe nessuno. */
  deve(viaBrowser('c-prima', 'Prima') === true, 'Prima non e\' piu\' riconosciuta come fonte da browser');
  const conProxy = fontiDaVigilare([fonte({ id: 'c-prima', nome: 'Prima', via_browser: false })]);
  deve(conProxy.length === 1, 'con un proxy configurato Prima resta comunque fuori dalla vigilanza');
});

prova('il riconoscimento non prende dentro fonti che non c\'entrano', () => {
  /* «prima» e' una parola comune: se la regola fosse larga potrebbe zittire la
     vigilanza su una fonte sana, ed e' il danno peggiore possibile qui. */
  for (const [id, nome] of [['italiana', 'Italiana'], ['hdi', 'HDI Assicurazioni'], ['24h', '24H Assistance'], ['axa', 'AXA']]) {
    deve(viaBrowser(id, nome) === false, nome + ' viene scambiata per Prima e non verrebbe piu\' vigilata');
  }
});

let ko = 0;
console.log('\nVIGILANZA — chi entra nel giro');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nVIGILANZA: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
