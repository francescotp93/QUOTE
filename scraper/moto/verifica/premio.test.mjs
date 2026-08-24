// ═══════════════════════════════════════════════════════════════════════════════
//  REGRESSIONE MOTO/24H — il premio mostrato è il PREMIO, non il valore del veicolo
//
//  È la rete di sicurezza che il Brief 2 chiede: «se un test di regressione su
//  MotoPlatinum non passa, fermati». Blocca la parte che, se si rompe in un
//  refactor, mostra il numero sbagliato: la scelta di QUALE totale è il premio
//  RCA. I candidati hanno la forma che readPremio24() estrae dal DOM del nuovo
//  layout /mp/options (totali con nome prodotto, il valore veicolo, l'opzione
//  incendio/furto).
//
//  Se un domani la scelta cambia (es. torna a prendere il prezzo più basso in
//  assoluto, valore del veicolo compreso), queste prove diventano rosse.
// ═══════════════════════════════════════════════════════════════════════════════
import { scegliPremioRca, num } from '../premio.mjs';

const esiti = [];
const prova = (nome, fn) => { try { fn(); esiti.push([true, nome, '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('fra due prodotti, il premio RCA è il totale reale più basso', () => {
  const totali = [
    { prezzo: '601,53', prodotto: 'Motoplatinum WeRepair' },
    { prezzo: '462,90', prodotto: 'MOTO.APP' },
  ];
  const r = scegliPremioRca([], totali);
  deve(r.premio_rca === '462,90', 'ha scelto ' + r.premio_rca + ' invece di 462,90');
  deve(r.premio_rca_num === 462.9, 'num sbagliato: ' + r.premio_rca_num);
});

prova('il VALORE DEL VEICOLO non viene mai scambiato per il premio', () => {
  /* Il caso peggiore: nel layout compare anche il valore assicurato del veicolo
     (grande), e in fondo alla lista dei prezzi c'e' un totale piccolo. Se la
     scelta prendesse «il prezzo più basso in assoluto» o si facesse ingannare
     dal valore, mostrerebbe il numero sbagliato. */
  const totali = [
    { prezzo: '8.000,00', prodotto: 'Valore assicurato del veicolo' }, // NON è un premio
    { prezzo: '588,00', prodotto: 'Motoplatinum WeRepair' },
  ];
  const r = scegliPremioRca([], totali);
  deve(r.premio_rca === '588,00', 'ha scelto ' + r.premio_rca + ' invece del premio 588,00');
  deve(num('8.000,00') === 8000, 'il parser dei numeri all\'italiana è rotto');
});

prova('senza totali con nome prodotto, ripiega sui totali grezzi (non sul valore)', () => {
  /* Se nessun totale ha il nome prodotto, si usano comunque i totali trovati —
     ma il vero valore del test è che quando i nomi ci sono, i «valore/massimale»
     restano esclusi. */
  const totali = [{ prezzo: '450,00', prodotto: '' }, { prezzo: '470,00', prodotto: '' }];
  const r = scegliPremioRca([], totali);
  deve(r.premio_rca === '450,00', 'ripiego sbagliato: ' + r.premio_rca);
});

prova('l\'opzione incendio/furto si legge dalla sua etichetta, a parte dal premio', () => {
  const out = [
    { prezzo: '588,00', ctx: 'Assicurazione RCA completa' },
    { prezzo: '120,00', ctx: 'Incendio e furto' },
  ];
  const totali = [{ prezzo: '588,00', prodotto: 'Motoplatinum' }];
  const r = scegliPremioRca(out, totali);
  deve(r.premio_rca === '588,00', 'premio sbagliato');
  deve(r.opzione_incendio_furto === '120,00', 'opzione incendio/furto non letta: ' + r.opzione_incendio_furto);
});

prova('se non c\'è niente di quotabile, torna null (non un numero a caso)', () => {
  const r = scegliPremioRca([], []);
  deve(r.premio_rca === null && r.premio_rca_num === null, 'ha inventato un premio dal nulla');
});

prova('CONTROPROVA: la scelta ingenua «il più basso di TUTTI i prezzi» sbaglia', () => {
  /* Prova che il test morde: la logica sbagliata piu' comune (prendere il
     prezzo minimo senza escludere il valore del veicolo) darebbe un numero
     diverso. Qui il valore veicolo e' piccolo apposta, cosi' una scelta ingenua
     lo prenderebbe. */
  const totali = [
    { prezzo: '90,00', prodotto: 'Valore assicurato' }, // esca: piccolo ma NON un premio
    { prezzo: '588,00', prodotto: 'Motoplatinum WeRepair' },
  ];
  const giusto = scegliPremioRca([], totali);
  deve(giusto.premio_rca === '588,00', 'la scelta giusta non esclude il valore veicolo: ' + giusto.premio_rca);
  // la scelta ingenua avrebbe preso 90,00 → e sarebbe stato l'errore
  const ingenuoMin = totali.reduce((a, b) => num(b.prezzo) < num(a.prezzo) ? b : a).prezzo;
  deve(ingenuoMin === '90,00' && giusto.premio_rca !== ingenuoMin, 'il test non distingue la scelta giusta da quella ingenua');
});

let ko = 0;
console.log('\nREGRESSIONE MOTO — il premio è il premio');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nREGRESSIONE MOTO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
