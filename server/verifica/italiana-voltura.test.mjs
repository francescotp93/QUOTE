// ═══════════════════════════════════════════════════════════════════════════════
//  ITALIANA · VOLTURA SENZA CONTRAENTE — si dice subito, non dopo un minuto
//
//  La sera dell'11/09/2026, sul primo preventivo vero passato dal registro
//  degli esiti, Italiana ha risposto «Errore creazione preventivo: anagrafica
//  mancante» dopo 60 secondi. Nella diagnostica: situazione «Voltura al PRA», e
//  cognome, nome e indirizzo di contraente e proprietario tutti vuoti.
//
//  Nel rinnovo l'anagrafica arriva dall'attestato; nella voltura no. Senza
//  codice fiscale il wizard Plurima si ferma sempre allo step «Anagrafiche»:
//  l'esito era deciso in partenza, e il portale è stato disturbato per un
//  minuto per sentirselo dire.
//
//  Queste prove sorvegliano due cose: che non si parta, e che il messaggio
//  dica COSA FARE (regola di casa: «i messaggi d'errore dicono cosa fare»).
//
//      node server/verifica/italiana-voltura.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import http from 'http';

/* Un finto scraper Italiana che CONTA le chiamate: il punto della correzione è
   che in questo caso non debba squillare affatto. */
let chiamateAlloScraper = 0;
const finto = http.createServer((req, res) => {
  chiamateAlloScraper++;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, premio: { premio_annuale: 500, prodotto: 'In Prima Classe' } }));
});
await new Promise(r => finto.listen(0, '127.0.0.1', r));
process.env.ITALIANA_SCRAPER_URL = 'http://127.0.0.1:' + finto.address().port;

const express = (await import('express')).default;
const { motoRouter } = await import('../moto.js');

const app = express();
app.use(express.json());
app.use('/moto', (req, res, next) => { req.user = { id: '11111111-2222-3333-4444-555555555555', email: 'operatore@example.it' }; next(); }, motoRouter);
const srv = http.createServer(app);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

const esiti = [];
const prova = async (nome, fn) => { try { esiti.push([true, nome, (await fn()) || '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };
const chiedi = async (qs) => { const r = await fetch(base + '/moto/premio?' + qs); return { stato: r.status, corpo: await r.json().catch(() => ({})) }; };

await prova('voltura senza codice fiscale: il portale non viene nemmeno disturbato', async () => {
  chiamateAlloScraper = 0;
  const r = await chiedi('targa=AA000AA&situazione=Voltura%20al%20PRA');
  deve(chiamateAlloScraper === 0, 'lo scraper è stato chiamato ' + chiamateAlloScraper + ' volte: sessanta secondi sprecati');
  deve(r.stato === 400, 'ha risposto ' + r.stato + ' invece di 400');
  return r.corpo.error.slice(0, 80) + '…';
});

await prova('il messaggio dice COSA FARE, non solo cosa non va', async () => {
  const r = await chiedi('targa=AA000AA&situazione=Voltura%20al%20PRA');
  const m = String(r.corpo.error || '');
  deve(/contraente/i.test(m), 'non nomina il contraente: ' + m);
  deve(/codice fiscale/i.test(m), 'non dice che serve il codice fiscale: ' + m);
  deve(/ricalcola|riprova|compila/i.test(m), 'non dice che gesto fare: ' + m);
  deve(!/anagrafica mancante/i.test(m), 'ripete il messaggio tecnico del portale invece di spiegarlo');
});

await prova('la Legge Bersani senza contraente si ferma allo stesso modo', async () => {
  chiamateAlloScraper = 0;
  const r = await chiedi('targa=AA000AA&situazione=Rinnovo&bersani=BB111BB');
  deve(chiamateAlloScraper === 0, 'con il bersani lo scraper è stato chiamato lo stesso');
  deve(r.stato === 400 && /contraente/i.test(r.corpo.error || ''), 'risposta inattesa: ' + r.stato + ' ' + r.corpo.error);
});

await prova('con il codice fiscale si quota come sempre', async () => {
  chiamateAlloScraper = 0;
  const r = await chiedi('targa=AA000AA&situazione=Voltura%20al%20PRA&cf=RSSMRA80A01H501U&indirizzo=Via%20Roma%201');
  deve(chiamateAlloScraper === 1, 'lo scraper doveva essere chiamato una volta, invece ' + chiamateAlloScraper);
  deve(r.stato === 200 && r.corpo.ok, 'la quotazione buona non passa più: ' + r.stato + ' ' + JSON.stringify(r.corpo).slice(0, 120));
});

await prova('il rinnovo NON chiede il contraente: l\'anagrafica arriva dall\'attestato', async () => {
  chiamateAlloScraper = 0;
  const r = await chiedi('targa=AA000AA&situazione=Rinnovo');
  deve(chiamateAlloScraper === 1, 'il rinnovo è stato bloccato per sbaglio: chiamate ' + chiamateAlloScraper);
  deve(r.stato === 200, 'il rinnovo risponde ' + r.stato);
});

srv.close(); finto.close();
let ko = 0;
for (const [ok, nome, nota] of esiti) { if (!ok) ko++; console.log((ok ? '  ok  ' : '  KO  ') + nome + (nota ? '  — ' + nota : '')); }
console.log('\nITALIANA VOLTURA: ' + (esiti.length - ko) + ' superate, ' + ko + ' fallite');
process.exit(ko ? 1 : 0);
