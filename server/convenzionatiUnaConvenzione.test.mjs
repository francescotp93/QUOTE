// ═══════════════════════════════════════════════════════════════════════════════
//  UN ASSOCIATO, UNA CONVENZIONE
//
//  Decisione di Francesco, 5 settembre 2026: un associato appartiene a un ente
//  solo, e vede i prodotti di quell'ente.
//
//  Non era una regola scritta da nessuna parte, ed era gia' costata: chi entra
//  viene riconosciuto solo se le sue righe sono ESATTAMENTE una, mentre la
//  creazione dell'utenza gestiva esplicitamente il caso «la stessa persona e'
//  associata a due convenzioni» e riusava lo stesso accesso. Approvando la
//  seconda iscrizione, quindi, la persona restava chiusa fuori da TUTTE E DUE —
//  e il guasto arrivava in mano a lei, non a chi aveva approvato.
//
//  Adesso la regola si applica dove nasce il doppione: all'approvazione.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8');
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

function corpoDi(firma) {
  const i = src.indexOf(firma);
  if (i < 0) return null;
  let liv = 0, j = src.indexOf('{', i);
  const inizio = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') liv++;
    else if (src[j] === '}') { liv--; if (liv === 0) return src.slice(inizio, j + 1); }
  }
  return null;
}

/* La funzione si ESEGUE, con una lettura finta al posto del database: cosi' si
   prova cosa decide, non come e' scritta. */
function montaControllo(righeFinte) {
  const corpo = corpoDi('async function giaAssociatoAltrove(assoc)');
  if (!corpo) throw new Error('giaAssociatoAltrove() non c\'è: la seconda iscrizione torna approvabile');
  const f = new Function('sb', 'console',
    'return (async function giaAssociatoAltrove(assoc) ' + corpo + ');');
  return f(async () => righeFinte, { warn() {} });
}

const IO = { id: 'a1', email: 'Maria.Bianchi@Example.IT', convenzione_id: 'c1' };

prova('chi è già in un\'altra convenzione viene riconosciuto', async () => {
  const f = montaControllo([
    { id: 'a1', convenzione_id: 'c1', stato: 'in_attesa', quote_convenzioni: { nome: 'Comune di Paceco' } },
    { id: 'a9', convenzione_id: 'c2', stato: 'approvato', quote_convenzioni: { nome: 'Pro Loco Trapani' } },
  ]);
  const r = await f(IO);
  deve(r, 'la seconda convenzione passa: la persona resterebbe chiusa fuori da tutte e due');
  deve(r.convenzione === 'Pro Loco Trapani', 'non dice a quale convenzione è già iscritta: chi approva non sa cosa togliere');
  return 'trovata «' + r.convenzione + '»';
});

prova('la propria riga non conta come doppione', async () => {
  /* IL CASO CHE DEVE FALLIRE. Un controllo scritto senza escludere sé stesso
     bloccherebbe OGNI approvazione — compresa la prima — e nessuno entrerebbe
     più. È l'errore naturale scrivendo questa funzione. */
  const f = montaControllo([{ id: 'a1', convenzione_id: 'c1', stato: 'in_attesa', quote_convenzioni: { nome: 'Comune di Paceco' } }]);
  deve(await f(IO) === null, 'la riga della persona stessa viene scambiata per un doppione');
});

prova('due righe nella STESSA convenzione non sono due convenzioni', async () => {
  /* Un\'iscrizione rifatta perché la prima era rimasta indietro: fastidiosa,
     ma non è il caso che rompe l\'accesso. */
  const f = montaControllo([
    { id: 'a1', convenzione_id: 'c1', stato: 'in_attesa', quote_convenzioni: { nome: 'Comune di Paceco' } },
    { id: 'a7', convenzione_id: 'c1', stato: 'rifiutato', quote_convenzioni: { nome: 'Comune di Paceco' } },
  ]);
  deve(await f(IO) === null, 'blocca l\'approvazione per un doppione nella stessa convenzione');
});

prova('un\'iscrizione rifiutata altrove non blocca', async () => {
  const f = montaControllo([
    { id: 'a9', convenzione_id: 'c2', stato: 'rifiutato', quote_convenzioni: { nome: 'Pro Loco Trapani' } },
  ]);
  deve(await f(IO) === null, 'una richiesta che avevamo rifiutato tiene la persona fuori per sempre');
});

prova('se il database non risponde non si blocca l\'approvazione', async () => {
  /* Un controllo che, non riuscendo a controllare, dice di no fermerebbe il
     lavoro dell\'agenzia per un guasto di rete. Qui il rischio è l\'opposto e
     costa meno: una seconda iscrizione che passa, e che si vede subito. */
  const corpo = corpoDi('async function giaAssociatoAltrove(assoc)');
  const f = new Function('sb', 'console', 'return (async function giaAssociatoAltrove(assoc) ' + corpo + ');')(
    async () => { throw new Error('rete giù'); }, { warn() {} });
  deve(await f(IO) === null, 'un guasto di rete blocca tutte le approvazioni');
});

prova('l\'approvazione lo chiede DAVVERO, e prima di creare l\'utenza', () => {
  const c = corpoDi("convenzionatiRouter.post('/associati/:id/approva'");
  deve(c, 'manca la rotta di approvazione');
  const pulito = senzaCommenti(c);
  deve(/giaAssociatoAltrove\(assoc\)/.test(pulito), 'la rotta non controlla: il doppione si crea lo stesso');
  deve(/una sola convenzione/.test(c), 'non spiega a chi approva perché è stato fermato');
  /* L'ordine conta: dopo `creaOAggiornaUtenza` l'utenza esisterebbe già. */
  deve(pulito.indexOf('giaAssociatoAltrove') < pulito.indexOf('creaOAggiornaUtenza'),
    'controlla dopo aver creato l\'utenza: il danno è già fatto');
  deve(/409/.test(pulito), 'non risponde con un conflitto: il pannello mostrerebbe un errore generico');
});

/* ── esecuzione ────────────────────────────────────────────────────────────
   Le prove qui sono asincrone: `prova` ha messo nell'elenco la Promise che
   restituiscono, e un fallimento dentro una di quelle non passa dal try/catch
   di sopra. Si risolvono qui, una per una, e chi si rompe si vede. */
const finali = [];
for (const [ok, n, d] of esiti) {
  if (d && typeof d.then === 'function') {
    try { finali.push([true, n, (await d) || '']); }
    catch (e) { finali.push([false, n, e.message]); }
  } else finali.push([ok, n, d]);
}
console.log('\n── Un associato, una convenzione ────────────────────────────');
for (const [ok, n, d] of finali) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
const falliti = finali.filter(x => !x[0]);
console.log(falliti.length ? '\n🔴 ' + falliti.length + ' prove fallite su ' + finali.length : '\n🟢 ' + finali.length + '/' + finali.length + ' prove superate');
process.exit(falliti.length ? 1 : 0);
