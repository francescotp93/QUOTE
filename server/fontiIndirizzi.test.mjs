// ═══════════════════════════════════════════════════════════════════════════════
//  Banco di prova — «il pannello vede davvero i servizi che ci sono?»
//
//  PERCHE' ESISTE
//    Il 14 agosto 2026, con dieci scraper accesi e in ascolto sulla loro porta, il
//    Pannello Fonti dava tre compagnie per «senza servizio»: KUBE, quotiamo e
//    Assieasy. Non erano spente: il backend non sapeva a che porta bussare, perche'
//    scraperUrlFor() riconosce le compagnie da un elenco di espressioni scritte a
//    mano (italiana, hdi, groupama, prima, axa) e quelle tre non c'erano. La scheda
//    della fonte non puo' rimediare: il pannello non ha nessun campo per indicare la
//    porta, quindi cfg.scraper_url e' sempre vuoto.
//
//    Seconda cosa provata qui: uno scraper puo' rispondere SENZA dire se e' dentro al
//    portale (24H/Moto risponde solo {url}). Trattare quel silenzio come «sessione
//    scaduta» manda a rifare un login che non serve. «Non lo so» deve restare «non lo so».
//
//  COME SI LEGGE L'ESITO
//    Ogni riga ✅/❌ e' un fatto. Se il file esce con codice diverso da 0, almeno un
//    fatto non regge.
// ═══════════════════════════════════════════════════════════════════════════════
import http from 'http';
import fs from 'fs';
import express from 'express';

// Porte VERE di produzione: la prova serve proprio a verificare che il backend le
// trovi da solo, senza che nessuno gliele configuri (in produzione nessuno lo fa).
const PORTE = { assieasy: 4800, kube: 4900, quotiamo: 5000 };
const PORTA_MUTA = 4811;   // scraper che risponde ma non dice se e' loggato
const PORTA_API = 5098;

function finto(porta, payload) {
  return new Promise((ris, rif) => {
    const s = http.createServer((req, res) => {
      if (req.url.startsWith('/status')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(payload)); }
      else { res.statusCode = 404; res.end('{}'); }
    });
    s.on('error', e => rif(new Error('porta ' + porta + ' occupata: ' + e.code)));
    s.listen(porta, '127.0.0.1', () => ris(s));
  });
}

const STORE = '/tmp/fonti.indirizzi.test.json';
fs.writeFileSync(STORE, JSON.stringify({}));
process.env.FONTI_STORE = STORE;
process.env.SUPER_ADMIN_EMAIL = 'test@test.it';
// Le fonti built-in e le cinque gia' riconosciute le mando su porte morte: qui non
// c'entrano, e cosi' non rischiano di rispondere per caso.
for (const v of ['MOTO_SCRAPER_URL', 'ALLIANZ_SCRAPER_URL', 'ITALIANA_SCRAPER_URL', 'HDI_SCRAPER_URL',
                 'GROUPAMA_SCRAPER_URL', 'PRIMA_SCRAPER_URL', 'AXA_SCRAPER_URL']) {
  process.env[v] = 'http://127.0.0.1:4099';
}

const server = [];
server.push(await finto(PORTE.assieasy, { url: 'https://www.assieasy.it/home', loggato: true, ha_credenziali: true }));
server.push(await finto(PORTE.kube,     { url: 'https://quotazioni.softwarebroker.it/', loggato: true, ha_credenziali: true }));
server.push(await finto(PORTE.quotiamo, { url: 'https://app.quotiamo.it/', loggato: true, ha_credenziali: true }));
// Lo scraper «muto»: risponde, ma del login non dice niente. Come 24H/Moto.
server.push(await finto(PORTA_MUTA, { url: 'https://www.24hassistance.com/' }));

const { fontiRouter } = await import('./fonti.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { email: 'test@test.it' }; next(); });
app.use('/fonti', fontiRouter);
const srv = app.listen(PORTA_API);
const API = 'http://127.0.0.1:' + PORTA_API;

const crea = (nome) => fetch(API + '/fonti', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ nome, username: 'utente', password: 'segreta' }),
}).then(r => r.json());

for (const nome of ['KUBE', 'quotiamo', 'Assieasy']) await crea(nome);
const muta = await crea('Muta');
// La fonte «muta» va indirizzata a mano: e' l'unico modo per provare il caso «lo
// scraper risponde ma non dice se e' loggato» a prescindere dal riconoscimento.
{
  const s = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  s.__custom[muta.id].scraper_url = 'http://127.0.0.1:' + PORTA_MUTA;
  fs.writeFileSync(STORE, JSON.stringify(s, null, 2));
}

const sal = await fetch(API + '/fonti/salute?forza=1').then(r => r.json());
const elenco = await fetch(API + '/fonti').then(r => r.json());
const per = (n) => sal.fonti.find(f => (f.nome || '').toLowerCase() === n.toLowerCase()) || {};
const inElenco = (n) => elenco.fonti.find(f => (f.nome || '').toLowerCase() === n.toLowerCase()) || {};

console.log('\n══ 1) I tre servizi che il pannello non vedeva ══');
for (const [nome, porta] of [['KUBE', PORTE.kube], ['quotiamo', PORTE.quotiamo], ['Assieasy', PORTE.assieasy]]) {
  const f = per(nome);
  console.log('  ' + nome.padEnd(10),
    'servizio_configurato=' + f.servizio_configurato,
    ' porta=' + f.porta_locale,
    ' raggiungibile=' + f.raggiungibile,
    ' (attesa porta ' + porta + ')');
}

console.log('\n══ 2) Lo scraper che non dice se e\' loggato ══');
const m = per('Muta');
console.log('  loggato riportato da /fonti/salute :', JSON.stringify(m.loggato), '(deve essere null, non false)');
console.log('  stato mostrato nell\'elenco         :', JSON.stringify(inElenco('Muta').stato), '(non deve essere "scaduta")');
console.log('  diagnosi                           :', (m.diagnosi || []).map(d => d.codice).join(', ') || '(nessuna)');

const prove = {
  'KUBE ha un servizio': per('KUBE').servizio_configurato === true,
  'KUBE risponde sulla 4900': per('KUBE').porta_locale === String(PORTE.kube) && per('KUBE').raggiungibile === true,
  'quotiamo ha un servizio': per('quotiamo').servizio_configurato === true,
  'quotiamo risponde sulla 5000': per('quotiamo').porta_locale === String(PORTE.quotiamo) && per('quotiamo').raggiungibile === true,
  'Assieasy ha un servizio': per('Assieasy').servizio_configurato === true,
  'Assieasy risponde sulla 4800': per('Assieasy').porta_locale === String(PORTE.assieasy) && per('Assieasy').raggiungibile === true,
  '«non lo so» resta null, non false': m.loggato === null,
  '«non lo so» non diventa «scaduta»': inElenco('Muta').stato !== 'scaduta',
  '«non lo so» viene detto a parole': (m.diagnosi || []).some(d => d.codice === 'stato_non_riportato'),
};

console.log('\n══ ESITI ══');
let ko = 0;
for (const [k, v] of Object.entries(prove)) { console.log((v ? '  ✅ ' : '  ❌ ') + k); if (!v) ko++; }
console.log(ko ? '\n' + ko + ' prove non reggono.' : '\nTutto regge.');

srv.close(); for (const s of server) s.close();
process.exit(ko ? 1 : 0);
