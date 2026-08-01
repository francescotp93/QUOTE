// ═══════════════════════════════════════════════════════════════════════════════
//  PROVE DEL FRENO — il ciclo di accessi deve smettere
//
//  Il difetto che queste prove sorvegliano (01/08/2026): gli scraper Allianz e
//  Italiana rifacevano il login ogni 3 minuti all'infinito quando la sessione
//  era caduta. Con credenziali o codice 2FA non più validi diventavano venti
//  tentativi di accesso all'ora, per giorni: notifiche a raffica a Francesco e
//  il rischio concreto di farsi bloccare l'utenza dalla compagnia.
//
//  L'orologio è finto apposta: le attese si provano in millisecondi, non
//  aspettando davvero un'ora.
// ═══════════════════════════════════════════════════════════════════════════════
import { creaFreno, PREDEFINITI } from '../comune/freno.mjs';

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

const MINUTO = 60 * 1000;

prova('appena creato, si può tentare', () => {
  const f = creaFreno();
  deve(f.puoTentare(0), 'il freno nasce già tirato');
  deve(!f.stato().bloccato, 'nasce bloccato');
});

prova('dopo un fallimento non si ribussa subito', () => {
  const f = creaFreno();
  f.fallito(0, 'codice Duo scaduto');
  deve(!f.puoTentare(0), 'riprova immediatamente: è il difetto di prima');
  deve(!f.puoTentare(14 * MINUTO), 'riprova dopo 14 minuti, troppo presto');
  deve(f.puoTentare(15 * MINUTO), 'non riprova più nemmeno dopo l\'attesa prevista');
});

prova('l\'attesa raddoppia a ogni fallimento', () => {
  const f = creaFreno({ tentativiMax: 5 });
  f.fallito(0);
  const dopoUno = f.stato().prossimo_tentativo;
  f.fallito(dopoUno);
  const dopoDue = f.stato().prossimo_tentativo - dopoUno;
  deve(dopoUno === 15 * MINUTO, 'prima attesa: ' + dopoUno);
  deve(dopoDue === 30 * MINUTO, 'seconda attesa: ' + dopoDue + ', doveva raddoppiare');
});

prova('l\'attesa non supera il tetto di un\'ora', () => {
  const f = creaFreno({ tentativiMax: 99 });
  let ora = 0;
  for (let i = 0; i < 12; i++) { f.fallito(ora); ora = f.stato().prossimo_tentativo; }
  const ultima = f.stato().prossimo_tentativo;
  f.fallito(ultima);
  deve(f.stato().prossimo_tentativo - ultima === PREDEFINITI.attesaMax,
    'l\'attesa è cresciuta oltre il tetto');
});

prova('dopo tre fallimenti di fila SMETTE, e non riprova mai più', () => {
  /* È il cuore della correzione. Prima di oggi questo caso girava per sempre. */
  const f = creaFreno();
  let ora = 0;
  for (let i = 0; i < 3; i++) { f.fallito(ora, 'password rifiutata'); ora += 24 * 60 * MINUTO; }
  deve(f.stato().bloccato, 'non si è fermato dopo tre fallimenti');
  deve(!f.puoTentare(ora), 'riprova comunque');
  deve(!f.puoTentare(ora + 365 * 24 * 60 * MINUTO), 'dopo un anno riprova ancora: non si è fermato davvero');
  deve(f.stato().prossimo_tentativo === null, 'dichiara un prossimo tentativo che non ci sarà');
});

prova('il motivo dell\'ultimo fallimento resta leggibile', () => {
  const f = creaFreno();
  f.fallito(0, 'codice Duo scaduto o già usato');
  deve(/Duo/.test(f.stato().motivo), 'il motivo si è perso: nel pannello non si saprebbe che cosa serve');
});

prova('un accesso riuscito azzera tutto', () => {
  const f = creaFreno();
  f.fallito(0); f.fallito(20 * MINUTO);
  f.riuscito();
  deve(f.puoTentare(20 * MINUTO), 'dopo un accesso riuscito resta frenato');
  deve(f.stato().tentativi_falliti === 0, 'il conteggio non si è azzerato');
  deve(f.stato().motivo === null, 'resta scritto un motivo che non vale più');
});

prova('si riparte solo quando una persona mette un codice nuovo', () => {
  const f = creaFreno();
  let ora = 0;
  for (let i = 0; i < 3; i++) { f.fallito(ora); ora += MINUTO; }
  deve(f.stato().bloccato, 'non si è bloccato');
  f.sblocca();
  deve(f.puoTentare(ora), 'nemmeno con un codice nuovo si riprova');
  deve(!f.stato().bloccato, 'resta bloccato dopo lo sblocco');
});

prova('ogni compagnia ha il suo freno', () => {
  /* Se lo stato fosse condiviso, l'Allianz bloccata fermerebbe anche
     l'Italiana, e sarebbe un guasto peggiore del difetto. */
  const a = creaFreno(), b = creaFreno();
  let ora = 0;
  for (let i = 0; i < 3; i++) { a.fallito(ora); ora += MINUTO; }
  deve(a.stato().bloccato && !b.stato().bloccato, 'i freni si parlano tra loro');
  deve(b.puoTentare(ora), 'la seconda compagnia è stata frenata dalla prima');
});

let ko = 0;
console.log('\nFRENO — il ciclo di accessi deve smettere');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nFRENO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
