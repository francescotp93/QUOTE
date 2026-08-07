// ═══════════════════════════════════════════════════════════════════════════════
//  Prova della DIAGNOSI ONESTA del Pannello Fonti.
//
//  Il 27 luglio HDI mostrava "Scraper non raggiungibile (servizio in avvio?)".
//  Era falso: il servizio era acceso da due giorni e rispondeva; era la SESSIONE
//  sul portale a essere scaduta il 25 alle 16:54. Il messaggio nasceva da un
//  budget di 90s contro un login che a freddo ne costa ~150.
//
//  Qui verifichiamo che:
//    1. un portale a login guidato venga SEGUITO (e non atteso) fino in fondo;
//    2. se il portale chiede il codice, lo si dica invece di scrivere "non riuscito";
//    3. se il servizio è acceso ma la sessione è morta, si dica proprio questo;
//    4. solo un servizio davvero muto venga chiamato "spento".
// ═══════════════════════════════════════════════════════════════════════════════
import http from 'http';
import fs from 'fs';

const STORE = '/tmp/fonti.loginguidato.test.json';
fs.writeFileSync(STORE, JSON.stringify({ __custom: {} }));
process.env.FONTI_STORE = STORE;

const { _diagnosi } = await import('./fonti.js');
const { perche, seguiLoginGuidato } = _diagnosi;

const esiti = [];
const dai = (t, v) => { esiti.push([t, v]); console.log((v ? '  ✅ ' : '  ❌ ') + t); };

// Scraper finto pilotabile: decide cosa rispondere su /accedi /loginstate /status.
function scraperFinto(porta, copione) {
  return new Promise(r => {
    const s = http.createServer((req, res) => {
      const path = req.url.split('?')[0];
      const risposta = copione(path);
      if (risposta === 'muto') return;                       // non risponde: fa scattare il timeout
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(risposta));
    });
    s.listen(porta, '127.0.0.1', () => r(s));
  });
}

const aperti = [];

console.log('\n══ 1. Portale guidato: rientro seguito fino a "loggato" ══');
{
  let giri = 0;
  const s = await scraperFinto(4931, (p) => {
    if (p === '/accedi' || p === '/login') { giri = 0; return { ok: false, running: true, step: 'avvio', msg: 'Controllo la sessione…' }; }
    if (p === '/loginstate') { giri++; return giri >= 2 ? { running: false, step: 'loggato', msg: 'Accesso eseguito ✅' } : { running: true, step: 'credenziali', msg: 'Rientro in corso…' }; }
    return { loggato: true, ha_credenziali: true };
  });
  aperti.push(s);
  const out = await seguiLoginGuidato('http://127.0.0.1:4931', { attesaMs: 20000, passoMs: 200 });
  console.log('   →', JSON.stringify(out));
  dai('non si ferma al primo "ok:false" del login non bloccante', out.ok === true);
  dai('lo stato finale è "attiva"', out.stato === 'attiva');
}

console.log('\n══ 2. Il portale chiede il codice: lo diciamo ══');
{
  const s = await scraperFinto(4932, (p) => {
    if (p === '/accedi' || p === '/login') return { ok: false, running: true, step: 'avvio' };
    if (p === '/loginstate') return { running: false, step: 'attesa_codice', msg: 'HDI chiede il codice di verifica: scrivilo qui sotto e conferma.' };
    return { loggato: false, ha_credenziali: true };
  });
  aperti.push(s);
  const out = await seguiLoginGuidato('http://127.0.0.1:4932', { attesaMs: 20000, passoMs: 200 });
  console.log('   →', JSON.stringify(out));
  dai('chiede il codice invece di dire "non riuscito"', /codice/i.test(out.error || ''));
  dai('lo stato resta "scaduta" (pallino non verde)', out.stato === 'scaduta');
}

console.log('\n══ 3. Servizio ACCESO ma sessione morta: niente più "non raggiungibile" ══');
{
  const s = await scraperFinto(4933, (p) => (p === '/status' ? { url: 'https://idm.hdia.it/…', loggato: false, ha_credenziali: true } : 'muto'));
  aperti.push(s);
  const out = await perche('http://127.0.0.1:4933');
  console.log('   →', JSON.stringify(out));
  dai('non dice "spento"', out.stato === 'scaduta');
  dai('spiega che è la sessione a essere scaduta', /sessione/i.test(out.error || ''));
  dai('non usa più la frase fuorviante', !/non raggiungibile/i.test(out.error || ''));
}

console.log('\n══ 4. Credenziali illeggibili (chiave disallineata) ══');
{
  const s = await scraperFinto(4934, () => ({ loggato: false, ha_credenziali: false }));
  aperti.push(s);
  const out = await perche('http://127.0.0.1:4934');
  console.log('   →', JSON.stringify(out));
  dai('dice di reinserire le credenziali', /credenziali/i.test(out.error || ''));
}

console.log('\n══ 5. Servizio davvero muto: "spento" ══');
{
  const out = await perche('http://127.0.0.1:4939');   // porta chiusa
  console.log('   →', JSON.stringify(out));
  dai('lo chiama spento solo quando lo è', out.stato === 'spento');
}

console.log('\n══ 6. Freno tirato: NON è "riprova fra un minuto" ══');
{
  /* `scraper/comune/freno.mjs` smette di riprovare dopo tre accessi falliti di
     fila, per non far bloccare l'utenza dalla compagnia, e riparte solo con un
     codice nuovo messo a mano. La riga «Il rientro è partito, riprova fra un
     minuto» qui è la bugia peggiore che il pannello possa dire: manda ad
     aspettare qualcosa che non arriverà. */
  const s = await scraperFinto(4935, (p) => (p === '/status' ? {
    url: 'https://login.example.invalid', loggato: false, ha_credenziali: true,
    freno: { bloccato: true, tentativi_falliti: 3, prossimo_tentativo: null, motivo: 'accesso rifiutato tre volte' },
  } : 'muto'));
  aperti.push(s);
  const out = await perche('http://127.0.0.1:4935', true);
  console.log('   →', JSON.stringify(out));
  dai('lo chiama bloccata, non scaduta', out.stato === 'bloccata');
  dai('non manda ad aspettare un rientro che non c\'è', !/riprova fra un minuto/i.test(out.error || ''));
  dai('dice qual è il gesto che lo fa ripartire', /codice/i.test(out.error || ''));
  dai('riporta il motivo scritto dallo scraper', /rifiutato/i.test(out.motivo || ''));
}

console.log('\n══ 7. Le due strade per lo stesso stato devono dire la stessa cosa ══');
{
  /* `perche()` (usata da /verifica e dal login guidato) e `statoFonte()` (usata
     da GET /fonti) leggono la STESSA risposta dello scraper per due strade
     diverse. Finché restano due funzioni, possono divergere — ed è così che il
     freno era diventato invisibile da un lato solo. Questa prova le tiene
     insieme sul caso che conta. */
  const { statoFonte } = await import('./confineScraper.js');
  const dati = {
    url: 'https://login.example.invalid', loggato: false, ha_credenziali: true,
    freno: { bloccato: true, tentativi_falliti: 3, prossimo_tentativo: null, motivo: 'accesso rifiutato tre volte' },
  };
  const s = await scraperFinto(4936, (p) => (p === '/status' ? dati : 'muto'));
  aperti.push(s);
  const daPerche = await perche('http://127.0.0.1:4936', true);
  const daStato = statoFonte({ risposta: { ok: true, dati, da: 'rete' }, configurato: true, credenzialiNelloStore: true });
  dai('perche() e statoFonte() danno lo stesso stato', daPerche.stato === daStato.stato);
  dai('e la stessa diagnosi', daPerche.diagnosi === daStato.diagnosi);
}

for (const s of aperti) s.close();
const ko = esiti.filter(e => !e[1]).length;
console.log(ko ? '\n❌ ' + ko + ' controlli falliti\n' : '\n✅ diagnosi onesta\n');
process.exit(ko ? 1 : 0);
