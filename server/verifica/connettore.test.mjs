// ═══════════════════════════════════════════════════════════════════════════════
//  CONNETTORE — la porta dove atterrano le catture dell'estensione
//
//  Senza Express: si prova la logica (server/connettore.js) con una cartella
//  temporanea e uno store in memoria. Quattro cose che non devono cedere:
//  la chiave apre solo se e' quella giusta; una cattura fuori forma viene
//  rifiutata col motivo; quello che entra si ritrova nell'indice e si rilegge;
//  un id malfatto non porta fuori dalla cartella.
//
//      node server/verifica/connettore.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import os from 'os';
import path from 'path';
import { creaConnettore, MAX_CHIAMATE } from '../connettore.js';

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'catture-'));
let STORE = {};
const C = creaConnettore({ load: () => JSON.parse(JSON.stringify(STORE)), save: (d) => { STORE = d; return true; }, cartella });
const cattura = (extra) => Object.assign({ portale: 'groupama', caso: 'RC auto, Panda 2019, targa GY263BY', versione: '2.0.0', avvio: 1, fine: 2,
  chiamate: [{ metodo: 'POST', url: 'https://accedi.groupama.it/pda/login', stato: 200 }] }, extra || {});

prova('la chiave nuova apre, una inventata no, e sul disco resta solo l\'impronta', () => {
  const { id, chiave } = C.chiaveNuova('Chrome di Francesco');
  deve(/^wuc_[A-Za-z0-9_-]{40,}$/.test(chiave), 'la chiave non ha la forma attesa: ' + chiave);
  deve(C.verifica(chiave) === id, 'la chiave appena creata non apre');
  deve(C.verifica('wuc_' + 'a'.repeat(43)) === null, 'una chiave inventata apre');
  deve(C.verifica('') === null && C.verifica(null) === null, 'una chiave vuota apre');
  deve(!JSON.stringify(STORE).includes(chiave), 'la chiave in chiaro e\' finita nello store');
  deve(STORE.__connettore.chiavi[0].nome === 'Chrome di Francesco', 'il nome del browser non e\' salvato');
  return 'apre solo quella giusta';
});

prova('la chiave di lettura legge e non deposita; quella di deposito deposita e non legge', () => {
  const dep = C.chiaveNuova('Chrome', 'deposito'), let_ = C.chiaveNuova('Giulia', 'lettura');
  deve(/^wuc_/.test(dep.chiave) && /^wul_/.test(let_.chiave), 'le due chiavi non si distinguono dalla forma');
  deve(C.verifica(dep.chiave, 'deposito') === dep.id && C.verifica(dep.chiave, 'lettura') === null, 'la chiave dell\'estensione apre anche la lettura');
  deve(C.verifica(let_.chiave, 'lettura') === let_.id && C.verifica(let_.chiave, 'deposito') === null, 'la chiave di lettura apre anche il deposito');
  deve(C.verifica(let_.chiave) === null, 'senza dire il ruolo, la chiave di lettura passa per deposito');
  deve(C.chiaveNuova('x', 'admin').ruolo === 'deposito', 'un ruolo inventato non ricade sul piu\' stretto');
  const rp = C.riepilogo();
  deve(rp.chiavi.some(k => k.ruolo === 'lettura' && k.nome === 'Giulia'), 'il riepilogo non dice il ruolo delle chiavi');
  return 'due porte, due chiavi, nessuno scambio';
});

prova('revocare una chiave non tocca le altre', () => {
  const a = C.chiaveNuova('A'), b = C.chiaveNuova('B');
  deve(C.chiaveRevoca(a.id), 'la revoca non riesce');
  deve(C.verifica(a.chiave) === null, 'la chiave revocata apre ancora');
  deve(C.verifica(b.chiave) === b.id, 'la revoca di A ha spento anche B');
  deve(!C.chiaveRevoca('non-esiste'), 'revocare una chiave inesistente dice di averla revocata');
  return 'una alla volta';
});

prova('una cattura fuori forma viene rifiutata col motivo', () => {
  deve(/portale sconosciuto/.test(C.controlla(cattura({ portale: 'assieasy' })) || ''), 'accetta un portale fuori dagli otto');
  deve(/caso/.test(C.controlla(cattura({ caso: '  ' })) || ''), 'accetta una cattura senza caso');
  deve(/chiamate/.test(C.controlla(cattura({ chiamate: 'x' })) || ''), 'accetta chiamate che non sono un elenco');
  deve(/troppe chiamate/.test(C.controlla(cattura({ chiamate: new Array(MAX_CHIAMATE + 1).fill({}) })) || ''), 'accetta piu\' chiamate del massimo');
  deve(/troppo grande/.test(C.controlla(cattura({ chiamate: [{ risposta: 'x'.repeat(9 * 1024 * 1024) }] })) || ''), 'accetta una cattura oltre gli 8 MB');
  deve(C.controlla(cattura()) === null, 'rifiuta una cattura buona: ' + C.controlla(cattura()));
  deve(C.salvaCattura(cattura({ portale: 'x' })).ok === false, 'salva anche quello che ha rifiutato');
  return 'cinque rifiuti motivati, una accettata';
});

prova('quello che entra si ritrova nell\'indice, si rilegge e si cancella', () => {
  const r = C.salvaCattura(cattura(), 'k1');
  deve(r.ok && /^c[a-z0-9]+$/.test(r.id) && r.n === 1, 'salvataggio non riuscito: ' + JSON.stringify(r));
  const e = C.elenco();
  deve(e.length === 1 && e[0].id === r.id && e[0].portale === 'groupama' && e[0].caso.startsWith('RC auto'), 'l\'indice non ha la cattura: ' + JSON.stringify(e));
  const letta = C.leggi(r.id);
  deve(letta && letta.chiamate.length === 1 && letta.da === 'k1', 'la cattura riletta non e\' quella salvata');
  const rp = C.riepilogo();
  deve(rp.catture === 1 && rp.ultima.id === r.id && rp.portali.length === 8, 'il riepilogo non torna: ' + JSON.stringify(rp));
  deve(C.elimina(r.id), 'la cancellazione non riesce');
  deve(C.leggi(r.id) === null && C.elenco().length === 0, 'cancellata ma ancora leggibile');
  return 'indice, lettura, cancellazione';
});

prova('un id malfatto non esce dalla cartella', () => {
  fs.writeFileSync(path.join(cartella, '..', 'fuori-' + path.basename(cartella) + '.json'), '{"segreto":1}');
  deve(C.leggi('../fuori-' + path.basename(cartella)) === null, 'un id con ../ legge fuori dalla cartella');
  deve(C.leggi('indice') === null, 'l\'indice si legge come se fosse una cattura');
  deve(!C.elimina('../indice'), 'un id con ../ cancella fuori dalla cartella');
  return 'solo id di lettere e cifre';
});

fs.rmSync(cartella, { recursive: true, force: true });
let ko = 0;
console.log('\nCONNETTORE — la porta delle catture');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n + (m ? ' — ' + m : '') : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nCONNETTORE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
