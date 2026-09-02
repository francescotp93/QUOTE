// ═══════════════════════════════════════════════════════════════════════════
//  TIENI SVEGLIA — un keep-alive che non naviga non tiene sveglio niente
//
//  PERCHE' ESISTE
//    Il censimento del 2 settembre 2026: quattro scraper su dieci avevano un
//    keep-alive che girava regolarmente e non serviva a niente.
//      · prima     → chiamava solo ensurePage(): non navigava MAI;
//      · assieasy  → navigava solo se l'indirizzo non conteneva "assieasy";
//      · kube      → navigava solo se l'indirizzo non conteneva il suo host;
//                    dopo il primo giro la condizione e' falsa per sempre;
//      · moto      → navigava, ma non guardava mai l'esito.
//    Lo stesso errore, riscritto quattro volte. Queste prove tengono ferme le
//    tre cose che un keep-alive deve fare — e la prova finale va a guardare
//    negli scraper veri che nessuno se lo sia riscritto da capo sbagliando.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { creaGiro } from '../comune/tieniSveglia.mjs';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esiti = [];
const prova = async (n, f) => { try { esiti.push([true, n, (await f()) || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };
const subito = async () => {};   // niente attese vere nelle prove

await prova('naviga SEMPRE, non solo quando l\'indirizzo e\' cambiato', async () => {
  // E' il difetto di assieasy e kube: la condizione diventa falsa dopo il primo
  // giro e non si naviga mai piu'. Qui la visita non ha condizioni: si fa.
  let visite = 0;
  const giro = creaGiro({ visita: async () => { visite++; }, dentro: async () => true, aspetta: subito });
  await giro(); await giro(); await giro();
  deve(visite === 3, 'ha navigato ' + visite + ' volte su 3: qualcuno decide di saltare il giro');
  return 'tre giri, tre navigazioni';
});

await prova('senza `visita` non si accende nemmeno', async () => {
  let errore = '';
  try { creaGiro({ dentro: async () => true }); } catch (e) { errore = e.message; }
  deve(/non naviga/.test(errore), 'accetta un keep-alive che non naviga: ' + errore);
  try { creaGiro({ visita: subito }); } catch (e) { errore = e.message; }
  deve(/primo preventivo/.test(errore), 'accetta un keep-alive che non guarda l\'esito: ' + errore);
  return 'i due pezzi indispensabili sono obbligatori';
});

await prova('guarda com\'e\' andata, e lo dice a chi tiene lo stato', async () => {
  // Il difetto di moto: navigava e non controllava. La sessione morta la
  // scopriva il primo preventivo, cioe' un cliente che aspetta.
  const visti = [];
  const giro = creaGiro({ visita: subito, dentro: async () => true, segnala: v => visti.push(v), aspetta: subito });
  deve(await giro() === 'dentro', 'non riconosce una sessione viva');
  deve(visti[0] === true, 'non aggiorna lo stato interno quando e\' dentro');
  return 'la sessione morta non aspetta piu\' un cliente per farsi notare';
});

await prova('se e\' caduta prova a rientrare da sola', async () => {
  let rientri = 0;
  const giro = creaGiro({
    visita: subito, dentro: async () => false, fuori: async () => true,
    rientra: async () => { rientri++; return true; }, aspetta: subito,
  });
  deve(await giro() === 'rientrato', 'non prova a rientrare');
  deve(rientri === 1, 'ha provato ' + rientri + ' volte');
  return 'nessuno viene disturbato per quello che si puo\' fare da soli';
});

await prova('«non lo so» non diventa «sei fuori»', async () => {
  /* Se la pagina non si e' pronunciata, dichiarare la sessione caduta vuol dire
     rifare un login che magari non serviva — e su un 2FA senza seme costa un
     codice a una persona. */
  const visti = [];
  const giro = creaGiro({
    visita: subito, dentro: async () => false, fuori: async () => false,
    rientra: async () => { throw new Error('non doveva rientrare'); },
    segnala: v => visti.push(v), aspetta: subito, tentativi: 4,
  });
  deve(await giro() === 'incerto', 'conclude «fuori» su un silenzio');
  deve(visti.length === 0, 'ha marcato lo stato pur non sapendo niente');
  return 'il silenzio resta silenzio';
});

await prova('molla la pagina se arriva un preventivo', async () => {
  // Competere con la navigazione di un preventivo e' gia' costato preventivi
  // falliti per una corsa fra due pezzi di codice sulla stessa scheda.
  let occupato = false, visite = 0;
  const giro = creaGiro({
    visita: async () => { visite++; occupato = true; },   // il preventivo parte durante la visita
    dentro: async () => false, fuori: async () => true,
    rientra: async () => { throw new Error('non doveva rientrare col preventivo in corso'); },
    occupato: () => occupato, aspetta: subito,
  });
  deve(await giro() === 'occupato', 'tira dritto mentre c\'e\' un preventivo in corso');
  occupato = true;
  deve(await giro() === 'occupato', 'naviga mentre c\'e\' un preventivo in corso');
  deve(visite === 1, 'ha navigato anche a preventivo gia\' avviato');
  return 'il preventivo ha la precedenza sulla pagina';
});

await prova('un motivo che non cambia non si ripete ogni tre minuti', async () => {
  /* Il 2 settembre il log di Allianz aveva dieci righe identiche in mezz'ora, e
     in mezzo non si vedeva piu' niente di utile. */
  const righe = [];
  const giro = creaGiro({
    visita: subito, dentro: async () => false, fuori: async () => true,
    log: r => righe.push(r), aspetta: subito, tentativi: 5,
  });
  await giro(); await giro(); await giro();
  const uguali = righe.filter(r => /non posso rientrare/.test(r));
  deve(uguali.length === 1, 'ha ripetuto lo stesso motivo ' + uguali.length + ' volte');
  deve(/Pannello Fonti/.test(uguali[0]), 'non dice dove si rimedia: ' + uguali[0]);
  return 'lo dice una volta, e si capisce';
});

await prova('un errore non spegne il ciclo', async () => {
  let visite = 0;
  const giro = creaGiro({
    visita: async () => { visite++; if (visite === 1) throw new Error('rete giu\''); },
    dentro: async () => true, aspetta: subito,
  });
  deve(await giro() === 'errore', 'l\'errore non viene classificato');
  deve(await giro() === 'dentro', 'dopo un errore il ciclo non riprende');
  return 'un intoppo non lascia la sessione a morire';
});

// ── E adesso gli scraper veri ──────────────────────────────────────────────
await prova('i quattro scraper rotti ora usano il pezzo comune', async () => {
  for (const c of ['prima', 'assieasy', 'kube', 'moto']) {
    const src = fs.readFileSync(path.join(RADICE, c, 'quote-service.mjs'), 'utf8');
    deve(/tieniSveglia/.test(src), c + ' non usa il keep-alive comune: se lo riscrive da capo');
  }
  return 'quattro volte lo stesso errore, una volta sola la soluzione';
});

await prova('nessuno «naviga solo se l\'indirizzo e\' diverso»', async () => {
  /* La forma esatta del difetto: `if (!page.url().includes(...)) goto(...)`.
     Dopo il primo giro l'indirizzo corrisponde gia', la condizione e' falsa per
     sempre, e il keep-alive gira a vuoto per mesi senza che nessuno lo noti. */
  const colpevoli = [];
  for (const c of fs.readdirSync(RADICE).filter(d => !d.startsWith('_') && !['comune', 'verifica'].includes(d))) {
    const f = path.join(RADICE, c, 'quote-service.mjs');
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const riga of src.split('\n')) {
      if (!/goto\(/.test(riga)) continue;
      if (/if\s*\(\s*!\s*\/[^/]*\/i?\.test\(page\.url\(\)/.test(riga) || /!\s*\(page\.url\(\)[^)]*\)\.includes\(/.test(riga)) colpevoli.push(c);
    }
  }
  deve(colpevoli.length === 0, 'navigano solo a indirizzo diverso: ' + [...new Set(colpevoli)].join(', '));
  return 'nessuno salta il giro guardandosi l\'indirizzo in mano';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Tieni sveglia ────────────────────────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
