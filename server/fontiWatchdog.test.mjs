// Prova della vigilanza automatica: una compagnia cade, il guardiano se ne accorge,
// tenta il rientro, e non insiste all'infinito.
import http from 'http';
import fs from 'fs';

const STORE = '/tmp/fonti.vigilanza.test.json';
// AXA è un "portale compagnia" custom del Pannello Fonti: senza la voce nello store
// la vigilanza non la vedrebbe nemmeno. La password non serve (la decifra lo scraper,
// che qui è finto): per il guardiano conta solo che l'utenza sia censita.
fs.writeFileSync(STORE, JSON.stringify({
  __custom: {
    axa: { nome: 'AXA', username: 'utente.axa', attiva: true },
    // HDI: scraper di NUOVA generazione, /login risponde SUBITO {running:true}.
    // Il guardiano deve seguirlo su /loginstate, non contarlo come fallito.
    hdi: { nome: 'HDI Assicurazioni', username: 'utente.hdi', attiva: true },
  },
}));
process.env.FONTI_STORE = STORE;
/* La memoria della vigilanza vive su disco APPOSTA (un riavvio non deve
   dimenticare quello che ha gia' annunciato). Senza questa riga la prova
   scriveva nella memoria VERA, `server/fontiWatchdog.store.json`, e non la
   ripuliva: girava verde la prima volta su una macchina pulita e rossa tutte
   le volte dopo, perche' AXA risultava gia' annunciata e gia' in quarantena.
   Il difetto era della prova, non della vigilanza — ma nascondeva l'una e
   l'altra. Qui la memoria e' un file temporaneo, buttato alla fine. */
const MEMORIA = '/tmp/fontiWatchdog.prova.' + process.pid + '.json';
process.env.FONTI_VIGILANZA_STORE = MEMORIA;
process.on('exit', () => { try { fs.unlinkSync(MEMORIA); } catch {} });
process.env.SUPER_ADMIN_EMAIL = 'test@test.it';
process.env.FONTI_AUTOLOGIN_PAUSA_MS = '0';      // niente attesa fra tentativi, per la prova
process.env.FONTI_AUTOLOGIN_MAX = '2';
process.env.BREVO_API_KEY = '';                  // nessuna email davvero inviata
process.env.ALLIANZ_SCRAPER_URL = 'http://127.0.0.1:4921';
process.env.AXA_SCRAPER_URL = 'http://127.0.0.1:4922';
process.env.MOTO_SCRAPER_URL = 'http://127.0.0.1:4923';   // spento
process.env.HDI_SCRAPER_URL = 'http://127.0.0.1:4924';    // login guidato (non bloccante)

// Scraper finti pilotabili
const stato = {
  4921: { url: 'https://allianz/x', loggato: true, ha_credenziali: true },
  4922: { url: 'https://axa/login', loggato: false, ha_credenziali: true },   // scaduta → deve rientrare
};
let loginChiamate = { 4921: 0, 4922: 0 };
let rientroRiesce = true;
const srv = [];
for (const p of [4921, 4922]) {
  srv.push(await new Promise(r => {
    const s = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url.startsWith('/login')) {
        loginChiamate[p]++;
        if (rientroRiesce) { stato[p].loggato = true; return res.end(JSON.stringify({ ok: true, url: stato[p].url })); }
        return res.end(JSON.stringify({ ok: false }));
      }
      res.end(JSON.stringify(stato[p]));
    });
    s.listen(p, '127.0.0.1', () => r(s));
  }));
}

// HDI: scraper di nuova generazione. /login NON blocca: risponde subito "sto partendo".
// Chi legge solo quell'ok lo conta sempre come fallito → 4 finti fallimenti → quarantena
// a torto su una compagnia che invece stava rientrando benissimo.
const hdi = { url: 'https://idm.hdia.it/auth', loggato: false, ha_credenziali: true };
let hdiLogin = 0;
srv.push(await new Promise(r => {
  const s = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const p = req.url.split('?')[0];
    if (p === '/login' || p === '/accedi') { hdiLogin++; return res.end(JSON.stringify({ ok: false, running: true, step: 'avvio', msg: 'Controllo la sessione…' })); }
    if (p === '/loginstate') { hdi.loggato = true; return res.end(JSON.stringify({ running: false, step: 'loggato', msg: 'Accesso eseguito ✅' })); }
    res.end(JSON.stringify(hdi));
  });
  s.listen(4924, '127.0.0.1', () => r(s));
}));

const { giroDiControllo } = await import('./fontiWatchdog.js');
const esiti = [];
const dai = (t, v) => { esiti.push([t, v]); console.log((v ? '  ✅ ' : '  ❌ ') + t); };

console.log('\n══ Giro 1: AXA scaduta, rientro automatico ACCESO ══');
const g1 = await giroDiControllo({ conRientro: true });
console.log(JSON.stringify(g1.azioni));
dai('ha tentato il rientro su AXA', loginChiamate[4922] === 1);
dai('AXA risulta rientrata', g1.rientrati.some(x => /axa/i.test(x)));
dai('non ha toccato Allianz (era a posto)', loginChiamate[4921] === 0);
dai('ha bussato anche a HDI (login guidato)', hdiLogin === 1);
dai('segue HDI su /loginstate e la conta rientrata', g1.rientrati.some(x => /hdi/i.test(x)));
dai('non mette HDI in castigo per il suo "ok:false" immediato', hdi.loggato === true);

console.log('\n══ Giro 2: AXA cade di nuovo e il rientro FALLISCE ══');
stato[4922].loggato = false; rientroRiesce = false;
const g2 = await giroDiControllo({ conRientro: true });
const g3 = await giroDiControllo({ conRientro: true });
const g4 = await giroDiControllo({ conRientro: true });   // qui deve essere già in quarantena
console.log('chiamate /login su AXA:', loginChiamate[4922]);
dai('si ferma dopo 2 tentativi (niente utenza bloccata)', loginChiamate[4922] === 3); // 1 riuscito + 2 falliti
dai('segnala che serve un accesso manuale', [...g2.caduti, ...g3.caduti].some(c => /manuale/i.test(c)));

console.log('\n══ Giro 3: rientro automatico SPENTO (default) ══');
const primaDi = loginChiamate[4922];
await giroDiControllo({ conRientro: false });
dai('non tenta nulla se non abilitato', loginChiamate[4922] === primaDi);

console.log('\n══ Fonte con credenziali illeggibili (chiave disallineata) ══');
stato[4922] = { url: 'https://axa/login', loggato: false, ha_credenziali: false };
const primaDi2 = loginChiamate[4922];
const g5 = await giroDiControllo({ conRientro: true });
dai('non tenta il login a vuoto', loginChiamate[4922] === primaDi2);
dai('spiega il motivo (chiave disallineata)', (g5.azioni || []).some(a => /disallineat/i.test(a.motivo || '')));

for (const s of srv) s.close();
const ko = esiti.filter(e => !e[1]).length;
console.log(ko ? '\n❌ ' + ko + ' controlli falliti\n' : '\n✅ vigilanza corretta\n');
process.exit(ko ? 1 : 0);
