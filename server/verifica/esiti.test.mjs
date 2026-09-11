// ═══════════════════════════════════════════════════════════════════════════════
//  IL REGISTRO DEGLI ESITI — ogni compagnia lascia una riga, e dentro non c'è
//  il cliente
//
//  «Crea una mappatura dei preventivi fatti su IAM, dove il risultato di ogni
//  quotazione va in un posto dove tu puoi verificarlo» (Francesco, 11/09/2026).
//  Fino a quel giorno l'esito di uno scraper arrivava al browser e spariva.
//
//  Queste prove sorvegliano le tre cose che rendono utile il registro e non
//  pericoloso: che ogni rotta che produce un premio lo scriva; che dentro non
//  finiscano nome, codice fiscale, data di nascita o indirizzo di nessuno, a
//  nessuna profondità; e che un registro rotto non rompa mai una quotazione.
//
//      node server/verifica/esiti.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const qui = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manca = (cosa) => { throw new Error('server/esiti.js non c\'è o non esporta ' + cosa); };
const E = await import('../esiti.js').catch(() => ({}));
for (const f of ['pulisci', 'richiestaPulita', 'diagnosticaPulita', 'preparaRiga', 'registraEsito', 'classificaErrore', 'numeroPremio', 'validaSegnalazione', 'segnala']) {
  if (!E[f]) E[f] = () => manca(f);
}
/* Sul codice di prima il registro non esiste: la prova deve girare lo stesso e
   dire QUALE comportamento manca, non morire all'import. */
if (!E._perLeProve) E._perLeProve = () => {};

const esiti = [];
const prova = async (nome, fn) => { try { esiti.push([true, nome, (await fn()) || '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

/* Il registro finto: raccoglie invece di scrivere su Supabase. */
const righe = [];
const patch = [];
let scriviRompe = false;
E._perLeProve({
  scrivi: async (r) => { if (scriviRompe) throw new Error('Supabase giu\''); righe.push(r); return righe.length; },
  aggiorna: async (id, body) => { patch.push({ id, body }); return id === 7 ? Object.assign({ id }, body) : null; },
});

const CLIENTE = { nome: 'Mario', cognome: 'Rossi', cf: 'RSSMRA80A01H501U', nascita: '01/01/1980', comune: 'Roma', indirizzo: 'Via Roma 1', email: 'mario.rossi@example.it' };

// ── 1. Niente cliente nel registro ───────────────────────────────────────────
await prova('la richiesta tiene guida/massimale/garanzie/bersani e perde nome, CF, nascita, indirizzo', () => {
  const r = E.richiestaPulita(Object.assign({ targa: 'AA000AA', tipoGuida: 'Libera', massimale: 'Minimo', frazionamento: 'Annuale', garanzie: ['incendio'], bersani: 'BB111BB', residenza: { prov: 'RM', comune: 'Roma' } }, CLIENTE));
  const testo = JSON.stringify(r);
  for (const v of ['Mario', 'Rossi', 'RSSMRA', '1980', 'Via Roma', 'example.it', 'Roma']) deve(!testo.includes(v), 'nella richiesta c\'e\' «' + v + '»');
  deve(r.tipoGuida === 'Libera' && r.massimale === 'Minimo' && r.garanzie[0] === 'incendio' && r.bersani === 'BB111BB', 'ha perso i parametri che servono a riprodurre');
  deve(r.targa === undefined, 'la targa sta nella sua colonna, non nella richiesta');
  return Object.keys(r).join(', ');
});

await prova('la diagnostica perde il cliente anche in profondità (anagrafica, contraente, dump, log)', () => {
  const d = E.diagnosticaPulita({ ok: true, premio_annuale_num: 412.5, prodotto: 'X', anagrafica: { data: [CLIENTE] }, veicolo: { marca: 'FIAT', proprietario: CLIENTE }, log: ['pagina con RSSMRA80A01H501U'], dump: '<html>Mario Rossi</html>', segnalazioni: [{ livello: 'INFORMATIVA', testo: 'ok', contraente: CLIENTE }] });
  const testo = JSON.stringify(d);
  for (const v of ['Mario', 'RSSMRA', 'example.it', '<html>']) deve(!testo.includes(v), 'nella diagnostica c\'e\' «' + v + '»');
  deve(d.veicolo.marca === 'FIAT' && d.segnalazioni[0].livello === 'INFORMATIVA' && d.prodotto === 'X', 'ha tolto anche quello che serve');
  deve(d.premio_annuale_num === undefined, 'il premio ha la sua colonna: non si duplica');
  return 'chiavi: ' + Object.keys(d).join(', ');
});

await prova('una diagnostica enorme non entra intera: restano le chiavi', () => {
  const d = E.diagnosticaPulita({ prodotto: 'X', pagina: 'x'.repeat(200 * 1024) });
  deve(d.troncata === true && Array.isArray(d.chiavi) && d.chiavi.includes('pagina'), 'non ha troncato: ' + JSON.stringify(d).slice(0, 80));
});

// ── 2. I campi diagnostici delle tre patch restano interi ────────────────────
await prova('HDI: pacchetto_esclusivo, garanzie_attive/spente/protette, sconto massimo, segnalazioni, valore veicolo restano nella riga', () => {
  const hdi = { ok: true, compagnia: 'HDI Assicurazioni', prodotto: 'RC Auto (In Prima Classe)', via: 'diretta', premio_annuale_num: 512.33, garanzie_attive: 4, garanzie_spente: 3, garanzie_protette: 1, pacchetto_esclusivo: true, pacchetto_motivo: undefined, somma_rischi_num: 512.33, premio_netto_num: 400, imposte_num: 112.33, sconto_max_pct_rca: 20, sconto_max_per_garanzia: [{ codice: '100101', pct_max: 20 }], premio_con_sconto_max_dichiarato_num: 430, sconto_max_parziale: true, valore_veicolo: '12.500,00', segnalazioni: [{ livello: 'AUTORIZZATIVA', testo: 'deroga' }], dettaglio_tecnico: 'quotazione 200', veicolo: { marca: 'FIAT' } };
  const r = E.preparaRiga({ modulo: 'rca', linea: 'auto', compagnia: 'HDI Assicurazioni', targa: 'aa000aa', richiesta: { tipoGuida: 'Libera', nascita: '01/01/1980' }, risposta: hdi, premio: hdi.premio_annuale_num, durata_ms: 1234.6 });
  deve(r.esito === 'ok' && r.premio === 512.33 && r.fonte === 'diretta' && r.durata_ms === 1235 && r.targa === 'AA000AA', 'riga base sbagliata: ' + JSON.stringify(r));
  for (const k of ['pacchetto_esclusivo', 'garanzie_attive', 'garanzie_spente', 'garanzie_protette', 'somma_rischi_num', 'premio_netto_num', 'imposte_num', 'sconto_max_pct_rca', 'sconto_max_per_garanzia', 'premio_con_sconto_max_dichiarato_num', 'sconto_max_parziale', 'valore_veicolo', 'segnalazioni', 'dettaglio_tecnico']) deve(k in r.diagnostica, 'manca ' + k + ' nella diagnostica');
  deve(!('nascita' in r.richiesta), 'la data di nascita e\' entrata nella richiesta');
  return 'prodotto ' + r.prodotto;
});

await prova('Groupama: fonte_premio, dettaglio, avvisi, bloccanti — e i bloccanti fanno «non_quotabile»', () => {
  const grp = { ok: true, compagnia: 'Groupama', prodotto: 'Guidamica Autovetture', premio_annuale_num: 700, fonte_premio: 'mii/summary', dettaglio: { netto: 600, imposte: 100 }, avvisi: ['006730 avviso'], bloccanti: [] };
  const ok = E.preparaRiga({ compagnia: 'Groupama', targa: 'AA000AA', risposta: grp, premio: 700 });
  deve(ok.fonte === 'mii' && ok.diagnostica.dettaglio.netto === 600 && ok.diagnostica.avvisi.length === 1, 'riga Groupama sbagliata: ' + JSON.stringify(ok));
  const no = E.preparaRiga({ compagnia: 'Groupama', targa: 'AA000AA', risposta: { ok: false, error: 'Premio non calcolato', bloccanti: ['006730 deroga 0'] }, errore: 'Premio non calcolato' });
  deve(no.esito === 'non_quotabile' && no.premio === null && no.errore === 'Premio non calcolato', 'un bloccante deve dare non_quotabile: ' + no.esito);
});

await prova('Allianz: pacchetto_base e sconto_area_riservata restano interi', () => {
  const al = { ok: true, compagnia: 'Allianz', premio_annuale: '1.234,56', pacchetto: 'BM — Bonus Malus', pacchetto_base: { esclusivo: true, ard_rimossi: true, infortuni: true, infortuni_31k: true, garanzie_spente: ['2000-'], garanzie_protette: [], garanzie_non_spente: [] }, sconto_area_riservata: { applicato: false, motivo: 'Monte sconti CMC esaurito' } };
  const r = E.preparaRiga({ compagnia: 'Allianz', targa: 'AA000AA', risposta: al, premio: al.premio_annuale, fonte: 'pagina' });
  deve(r.premio === 1234.56, 'il premio all\'italiana non e\' stato letto: ' + r.premio);
  deve(r.diagnostica.pacchetto_base.garanzie_spente[0] === '2000-' && r.diagnostica.sconto_area_riservata.motivo, 'diagnostica Allianz persa');
});

// ── 3. Esiti ─────────────────────────────────────────────────────────────────
await prova('timeout, non quotabile ed errore si distinguono dal messaggio', () => {
  deve(E.classificaErrore('Scraper HDI non raggiungibile o timeout: The operation was aborted') === 'timeout', 'timeout non riconosciuto');
  deve(E.classificaErrore('Il veicolo risulta già assicurato') === 'non_quotabile', 'gia\' assicurato non e\' non_quotabile');
  deve(E.classificaErrore('INVALID_INPUT: CAP 00100 non presente nella tariffa') === 'non_quotabile', 'INVALID_INPUT non e\' non_quotabile');
  deve(E.classificaErrore('Sessione Allianz scaduta: rifai il login') === 'errore', 'una sessione scaduta e\' un errore');
  deve(E.numeroPremio('1.256,77 €') === 1256.77 && E.numeroPremio({ annuale: { totale: 99 } }) === 99 && E.numeroPremio('abc') === null, 'numeroPremio sbaglia');
});

await prova('un registro rotto non rompe la quotazione: torna null e basta', async () => {
  scriviRompe = true;
  const id = await E.registraEsito({ compagnia: 'AXA', targa: 'AA000AA', errore: 'x' });
  scriviRompe = false;
  deve(id === null, 'doveva tornare null, ha tornato ' + id);
  const id2 = await E.registraEsito({ compagnia: 'AXA', targa: 'AA000AA', risposta: { ok: true, premio_annuale_num: 10 }, premio: 10 });
  deve(Number.isInteger(id2) && righe[righe.length - 1].compagnia === 'AXA', 'con il registro sano deve tornare l\'id');
});

// ── 4. La segnalazione dell'operatore ────────────────────────────────────────
await prova('la segnalazione accetta «412,50» e una nota, rifiuta il vuoto e un premio assurdo', async () => {
  deve(E.validaSegnalazione({ premio_portale: '412,50' }).premio_portale === 412.5, 'non legge 412,50');
  deve(E.validaSegnalazione({}).errore, 'una segnalazione vuota deve essere rifiutata');
  deve(E.validaSegnalazione({ premio_portale: 'boh' }).errore, 'un premio non numerico deve essere rifiutato');
  deve(E.validaSegnalazione({ premio_portale: 999999 }).errore, 'un premio assurdo deve essere rifiutato');
  const ok = await E.segnala(7, { premio_portale: '400', nota_operatore: ' il portale dava meno ' }, 'Giulia');
  deve(ok.ok && patch[patch.length - 1].body.segnalato_da === 'Giulia' && patch[patch.length - 1].body.nota_operatore === 'il portale dava meno', 'la segnalazione non e\' arrivata intera: ' + JSON.stringify(ok));
  const no = await E.segnala(8, { premio_portale: '400' }, 'Giulia');
  deve(no.stato === 404, 'una riga inesistente deve dare 404, ha dato ' + no.stato);
  const male = await E.segnala('abc', { premio_portale: '400' }, 'Giulia');
  deve(male.stato === 400, 'un id non numerico deve dare 400');
});

await prova('la rotta POST /esiti/:id/segnalazione risponde con un Express vero, e il nome viene dal token', async () => {
  const express = (await import('express')).default;
  const app = express(); app.use(express.json());
  app.use('/esiti', (req, res, next) => { req.user = { id: '11111111-2222-3333-4444-555555555555', email: 'operatore@example.it' }; next(); }, E.esitiRouter);
  const srv = http.createServer(app); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    const r = await fetch(base + '/esiti/7/segnalazione', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ premio_portale: '380,10', nota_operatore: 'x' }) });
    const j = await r.json();
    deve(r.status === 200 && j.ok && j.esito.premio_portale === 380.1, 'risposta inattesa: ' + r.status + ' ' + JSON.stringify(j));
    const ultima = patch[patch.length - 1];
    deve(ultima.body.segnalato_da === 'operatore@example.it', 'chi segnala deve venire dal token, non dal corpo: ' + ultima.body.segnalato_da);
    const r2 = await fetch(base + '/esiti/7/segnalazione', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    deve(r2.status === 400, 'la segnalazione vuota deve dare 400');
  } finally { srv.close(); }
});

// ── 5. Ogni rotta che produce un premio scrive nel registro ──────────────────
await prova('in moto.js ogni rotta che restituisce un premio chiama il registro (successo E fallimento)', () => {
  const src = fs.readFileSync(path.join(qui, 'moto.js'), 'utf8');
  deve(/import \{ registraEsito \} from '\.\/esiti\.js'/.test(src), 'moto.js non importa il registro');
  const rotte = ["motoRouter.post('/preventivo'", "motoRouter.post('/preventivo24/start'", "motoRouter.post('/preventivoHDI/start'", "motoRouter.get('/premio-casa'", "motoRouter.post('/preventivoCasa/start'", "motoRouter.get('/premio-tcm'", "motoRouter.post('/preventivoGroupama/start'", "motoRouter.post('/preventivoAxa/start'", "motoRouter.get('/allianz-auto'", "motoRouter.post('/preventivoAllianz/start'", "motoRouter.post('/quota-auto'", "motoRouter.get('/premio'"];
  const inizi = rotte.map(r => ({ r, i: src.indexOf(r) }));
  for (const { r, i } of inizi) deve(i > -1, 'non trovo la rotta ' + r);
  const tutti = [...src.matchAll(/motoRouter\.(get|post)\(/g)].map(m => m.index).sort((a, b) => a - b);
  for (const { r, i } of inizi) {
    const fine = tutti.find(x => x > i) || src.length;
    const corpo = src.slice(i, fine);
    const n = (corpo.match(/esito\(req,/g) || []).length;
    deve(n >= 2, r + ' chiama il registro ' + n + ' volte: serve almeno una per il successo e una per il fallimento');
    deve(/esito_id/.test(corpo), r + ' non rimanda esito_id al browser');
  }
  /* Le rotte che NON producono un premio non devono scrivere: il registro e' degli esiti, non delle ricerche. */
  for (const r of ["motoRouter.post('/lookup'", "motoRouter.get('/ania'", "motoRouter.get('/hub-auto'", "motoRouter.get('/hub-veicolo'"]) {
    const i = src.indexOf(r); deve(i > -1, 'non trovo ' + r);
    const fine = tutti.find(x => x > i) || src.length;
    deve(!/esito\(req,/.test(src.slice(i, fine)), r + ' scrive nel registro ma non produce un premio');
  }
  return rotte.length + ' rotte';
});

await prova('l\'API v1 registra una riga per compagnia e rimanda esito_id come campo additivo', async () => {
  const { creaApiQuotazione } = await import('../quoteApi.js');
  const express = (await import('express')).default;
  const raccolte = [];
  const app = express(); app.use(express.json());
  app.use('/api/v1', creaApiQuotazione({
    chiave: 'k', log: () => {},
    esiti: async (e) => { raccolte.push(e); return 42; },
    prodotti: {
      due: { attivo: true, quota: async () => ({ ok: true, risultati: [{ compagnia: 'A', premio_annuo: 10 }, { compagnia: 'B', premio_annuo: 20 }] }) },
      no: { attivo: true, quota: async () => ({ ok: false, errore: 'INVALID_INPUT', messaggio: 'CAP non in tariffa' }) },
    },
  }));
  const srv = http.createServer(app); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/api/v1';
  const H = { 'Content-Type': 'application/json', 'X-Internal-Key': 'k', 'X-Operatore': 'Giulia' };
  const attendi = async (id) => { for (let i = 0; i < 60; i++) { const r = await (await fetch(base + '/quote/' + id, { headers: H })).json(); if (r.stato !== 'in_corso') return r; await new Promise(x => setTimeout(x, 30)); } throw new Error('mai finita'); };
  try {
    const a = await (await fetch(base + '/quote/due', { method: 'POST', headers: H, body: JSON.stringify({ x: 1, nome: 'Mario' }) })).json();
    const fa = await attendi(a.quote_id);
    deve(fa.stato === 'completo' && fa.risultati.length === 2 && fa.risultati.every(r => r.esito_id === 42), 'esito_id non e\' sui risultati: ' + JSON.stringify(fa.risultati));
    deve(raccolte.length === 2 && raccolte.map(r => r.compagnia).join() === 'A,B', 'una riga per compagnia: ' + raccolte.length);
    deve(raccolte[0].utente_nome === 'Giulia' && raccolte[0].modulo === 'api_v1' && raccolte[0].prodotto === 'due', 'operatore/modulo/prodotto sbagliati: ' + JSON.stringify(raccolte[0]));
    for (const k of ['compagnia', 'premio_annuo', 'premio_frazionato', 'frazionamento', 'garanzie', 'note']) deve(k in fa.risultati[0], 'il contratto ha perso ' + k);
    const b = await (await fetch(base + '/quote/no', { method: 'POST', headers: H, body: JSON.stringify({ x: 1 }) })).json();
    const fb = await attendi(b.quote_id);
    deve(fb.stato === 'fallito' && fb.error_code === 'INVALID_INPUT' && fb.esito_id === 42, 'il fallimento deve portare esito_id: ' + JSON.stringify(fb));
    deve(raccolte[2].esito === 'non_quotabile', 'INVALID_INPUT e\' non_quotabile, non ' + raccolte[2].esito);
  } finally { srv.close(); }
});

await prova('index.js monta /esiti dietro il login e passa il registro all\'API v1', () => {
  const idx = fs.readFileSync(path.join(qui, 'index.js'), 'utf8');
  deve(/app\.use\('\/esiti', requireAuth, esitiRouter\)/.test(idx), '/esiti non e\' montata dietro requireAuth');
  deve(/esiti: registraEsito/.test(idx), 'l\'API v1 non riceve il registro');
});

await prova('le card del confronto portano il link «Il premio non torna? Segnala» e l\'id arriva dalle rotte', () => {
  const html = fs.readFileSync(path.join(path.dirname(qui), 'index.html'), 'utf8');
  deve(/function awSegnalaLink\(/.test(html) && /async function esitoSegnala\(/.test(html), 'manca il link o la funzione di segnalazione');
  deve(/\/esiti\/'\+encodeURIComponent\(id\)\+'\/segnalazione'/.test(html), 'la segnalazione non chiama la rotta del backend');
  for (const k of ['italiana', '24h', 'hdi', 'groupama', 'axa', 'allianz']) {
    const n = (html.match(new RegExp("key:'" + k + "'[^\\n]*esitoId:", 'g')) || []).length;
    deve(n >= 2, 'la card ' + k + ' non passa esitoId (successo e fallimento): ' + n);
  }
  deve(/esito_id: pd\.esito_id/.test(html), 'il polling non riporta esito_id dallo stato del lavoro');
  /* Non si tocca quello che c'era: il login, il pulsante Acquista, il Riprova. */
  deve(/function onLogin\(/.test(html) && /Scegli \$\{esc\(cfg\.nome\)\} e acquista/.test(html) && /onclick="\$\{cfg\.retry\}">Riprova<\/button>/.test(html), 'e\' sparito qualcosa dalle card o dal login');
});

// ── Esito ────────────────────────────────────────────────────────────────────
let ko = 0;
for (const [ok, nome, nota] of esiti) { if (!ok) ko++; console.log((ok ? '  ok  ' : '  KO  ') + nome + (nota ? '  — ' + nota : '')); }
console.log('\nREGISTRO ESITI: ' + (esiti.length - ko) + ' superate, ' + ko + ' fallite');
process.exit(ko ? 1 : 0);
