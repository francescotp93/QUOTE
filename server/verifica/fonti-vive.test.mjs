// ═══════════════════════════════════════════════════════════════════════════════
//  LA PROVA DELLA PROVA — fonti-vive.mjs dice il vero?
//
//  fonti-vive.mjs parla con i servizi veri delle compagnie e risponde a una
//  domanda sola: «la realtà corrisponde alla mappa?». È lo strumento con cui si
//  guarda il Pannello Fonti quando qualcosa non va, quindi deve essere lui il
//  primo di cui fidarsi — e uno strumento di misura di cui nessuno ha mai
//  verificato la taratura è peggio di nessuno strumento.
//
//  Qui le dieci compagnie sono finte: dieci servizietti sulle stesse porte, che
//  si possono far rispondere «sono dentro», «sono fuori», «non lo dico», o non
//  rispondere affatto. Così si controlla che:
//    · quando tutto è come previsto dica di sì, e non per caso;
//    · quando una sessione cade se ne accorga;
//    · quando una compagnia ENTRA dove non ce l'aspettavamo se ne accorga
//      lo stesso — perché una mappa vecchia smette di dire qualcosa;
//    · quando i servizi non ci sono NON dia un rosso falso.
//
//  Le porte sono quelle vere (4100-5000): se qui sono occupate, la prova lo
//  dice e si ferma invece di inventare un verdetto.
// ═══════════════════════════════════════════════════════════════════════════════
import http from 'http';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(QUI, 'fonti-vive.mjs');

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/* La stessa mappa che il programma si porta dentro: se cambia là e non qui, la
   prova diventa rossa — ed è giusto, perché vuol dire che qualcuno ha cambiato
   le attese senza guardare chi ci si appoggia. */
const PORTE = {
  '24h': 4100, allianz: 4200, italiana: 4300, hdi: 4400, groupama: 4500,
  prima: 4600, axa: 4700, assieasy: 4800, kube: 4900, quotiamo: 5000,
};

/* Le risposte che il programma si aspetta oggi: italiana dentro, 24h e quotiamo
   che non lo dicono, tutte le altre fuori. */
const NORMALE = {
  '24h': { loggato: null }, quotiamo: { loggato: null },
  italiana: { loggato: true, step: 'loggato' },
  allianz: { loggato: false }, hdi: { loggato: false, step: 'idle' },
  groupama: { loggato: false, step: 'non_loggato', msg: 'Login non riuscito: controlla utente/password.' },
  prima: { loggato: false, step: 'error', msg: 'Prima blocca i server (Cloudflare).' },
  axa: { loggato: false, step: 'pronto' }, assieasy: { loggato: false, step: 'pronto' },
  kube: { loggato: false, step: 'pronto' },
};

const chiuse = [];
function compagniaFinta(porta, dati) {
  return new Promise((risolvi, rifiuta) => {
    const srv = http.createServer((req, res) => {
      const p = req.url.split('?')[0];
      res.setHeader('Content-Type', 'application/json');
      if (p === '/status') {
        return res.end(JSON.stringify({
          loggato: dati.loggato, ha_credenziali: true, ha_totp: !!dati.totp,
          freno: dati.freno || { bloccato: false, tentativi_falliti: 0, prossimo_tentativo: null, motivo: null },
        }));
      }
      if (p === '/loginstate') {
        return res.end(JSON.stringify({ step: dati.step || 'pronto', running: false, msg: dati.msg || '' }));
      }
      if (p === '/accedi') { dati.premuto = (dati.premuto || 0) + 1; return res.end(JSON.stringify({ ok: true, step: 'credenziali' })); }
      res.statusCode = 404; res.end('{}');
    });
    srv.on('error', rifiuta);
    srv.listen(porta, '127.0.0.1', () => { chiuse.push(srv); risolvi(srv); });
  });
}

/* Alza le dieci compagnie finte, esegue il programma, le abbassa. */
async function conFonti(scostamenti, argomenti = []) {
  const stato = {};
  for (const [id, porta] of Object.entries(PORTE)) {
    stato[id] = { ...(NORMALE[id] || { loggato: false }), ...((scostamenti || {})[id] || {}) };
    if (stato[id].spenta) continue;
    await compagniaFinta(porta, stato[id]);
  }
  try {
    return await new Promise((risolvi) => {
      execFile(process.execPath, [SCRIPT, ...argomenti], { timeout: 240000 },
        (err, out, errout) => risolvi({ uscita: err ? (err.code ?? 1) : 0, testo: String(out) + String(errout), stato }));
    });
  } finally {
    for (const s of chiuse.splice(0)) s.close();
    await new Promise(r => setTimeout(r, 60));
  }
}

// ── 1. Le porte devono essere libere, altrimenti non si prova niente ─────────
prova('le porte delle compagnie sono libere su questa macchina', async () => {
  try { await compagniaFinta(4100, {}); }
  catch (e) {
    throw new Error('la porta 4100 e\' occupata (' + e.code + '): questa prova alza dieci servizi finti sulle porte vere e qui non puo\' farlo');
  }
  for (const s of chiuse.splice(0)) s.close();
});

// ── 2. Tutto come la mappa ──────────────────────────────────────────────────
prova('quando tutto è come previsto, dice di sì', async () => {
  const r = await conFonti(null);
  deve(r.uscita === 0, 'e\' uscito ' + r.uscita + ' invece di 0:\n' + r.testo.slice(0, 900));
  deve(/CORRISPONDE ALLA MAPPA/.test(r.testo), 'non lo dice a parole');
  deve(/italiana/.test(r.testo) && /DENTRO/.test(r.testo), 'non mostra quale e\' dentro');
});

prova('e non dice di sì perché guarda poco: le nomina tutte e dieci', async () => {
  /* Un programma che interroga solo le prime due direbbe «tutto a posto» con la
     stessa faccia. */
  const r = await conFonti(null);
  for (const id of Object.keys(PORTE)) deve(r.testo.includes(id), 'manca ' + id + ' dal quadro');
});

// ── 3. Le cose che devono farlo diventare rosso ─────────────────────────────
prova('se la sessione viva cade, se ne accorge', async () => {
  const r = await conFonti({ italiana: { loggato: false, step: 'non_loggato', msg: 'Sessione scaduta.' } });
  deve(r.uscita === 1, 'e\' uscito ' + r.uscita + ' invece di 1');
  deve(/la sessione è caduta/.test(r.testo), 'non dice cosa e\' successo:\n' + r.testo.slice(0, 700));
  deve(/Sessione scaduta/.test(r.testo), 'non riporta quello che dice il servizio');
});

prova('se un servizio si spegne, se ne accorge', async () => {
  const r = await conFonti({ hdi: { spenta: true } });
  deve(r.uscita === 1, 'e\' uscito ' + r.uscita + ' invece di 1');
  deve(/hdi/.test(r.testo) && /non risponde/.test(r.testo), 'non dice che hdi e\' spenta');
});

prova('se una compagnia ENTRA dove non ce l\'aspettavamo, lo dice lo stesso', async () => {
  /* Questa è la parte controintuitiva, ed è quella che tiene viva la mappa: una
     buona notizia non registrata è una mappa che invecchia in silenzio, e fra
     sei mesi nessuno sa più cosa dovrebbe essere vero. */
  const r = await conFonti({ groupama: { loggato: true, step: 'loggato', msg: 'Login completato.' } });
  deve(r.uscita === 1, 'e\' uscito ' + r.uscita + ': una buona notizia non registrata passa liscia');
  deve(/migliorata/.test(r.testo) && /è entrata/.test(r.testo), 'non dice che e\' migliorata:\n' + r.testo.slice(0, 700));
});

prova('«non lo dice» non viene scambiato per «non è dentro»', async () => {
  /* 24h e quotiamo rispondono ma non dichiarano la sessione. Trattarlo come un
     «fuori» vorrebbe dire un rosso al giorno per una cosa che nessuno può
     sistemare. */
  const r = await conFonti(null);
  deve(r.uscita === 0, 'e\' uscito ' + r.uscita + ': «non lo so» e\' stato preso per un guasto');
  deve(/non lo dice/.test(r.testo), 'non distingue piu\' «non lo so» da «fuori»');
});

// ── 4. Dove NON deve diventare rosso ────────────────────────────────────────
prova('senza i servizi non dà un rosso falso, dice che qui non si può', async () => {
  /* Su un computer di lavoro i dieci servizi non ci sono. Se rispondesse
     «rosso» chi legge andrebbe a cercare un guasto che non esiste, e dopo due
     volte smetterebbe di guardare questa prova per sempre. */
  const r = await new Promise((risolvi) => {
    execFile(process.execPath, [SCRIPT], { timeout: 60000, env: { ...process.env, FONTI_BASE: 'http://127.0.0.1' } },
      (err, out, errout) => risolvi({ uscita: err ? (err.code ?? 1) : 0, testo: String(out) + String(errout) }));
  });
  deve(r.uscita === 2, 'e\' uscito ' + r.uscita + ' invece di 2');
  deve(/gira sulla VPS/.test(r.testo), 'non spiega perche\' non si puo\' eseguire qui');
});

// ── 5. I portali non si toccano se non glielo si chiede ─────────────────────
prova('la diagnosi non preme Accedi su nessuno', async () => {
  const r = await conFonti(null);
  for (const [id, s] of Object.entries(r.stato)) {
    deve(!s.premuto, 'ha avviato un accesso su ' + id + ' senza che nessuno lo chiedesse');
  }
});

prova('con --accedi preme, ma solo su quella che gli è stata detta', async () => {
  const r = await conFonti({ groupama: { step: 'non_loggato', msg: 'Login non riuscito.' } }, ['--accedi', 'groupama']);
  deve(r.stato.groupama.premuto === 1, 'non ha premuto Accedi su groupama (' + r.stato.groupama.premuto + ')');
  for (const [id, s] of Object.entries(r.stato)) {
    if (id !== 'groupama') deve(!s.premuto, 'ha premuto anche su ' + id);
  }
  deve(/NON RIUSCITO/.test(r.testo), 'non riporta com\'e\' andata:\n' + r.testo.slice(-600));
});

prova('col freno tirato non insiste', async () => {
  /* Dopo tre tentativi falliti il freno blocca la compagnia. Insistere lì è il
     modo di farsi bloccare l'utenza dell'agenzia, che si sblocca solo
     telefonando: il programma deve fermarsi da solo, non fidarsi di chi
     digita. */
  const r = await conFonti({
    axa: { freno: { bloccato: true, tentativi_falliti: 3, prossimo_tentativo: Date.now() + 900000, motivo: 'tre tentativi falliti' } },
  }, ['--accedi', 'axa']);
  deve(!r.stato.axa.premuto, 'ha premuto Accedi col freno tirato');
  deve(/freno è tirato/.test(r.testo), 'non spiega perche\' si e\' fermato:\n' + r.testo.slice(-500));
});

prova('quando serve il codice, dice come si consegna', async () => {
  const r = await conFonti({ axa: { step: 'attesa_otp', msg: 'Inserisci il codice AXA Guardian.' } }, ['--accedi', 'axa']);
  deve(/SERVE IL CODICE/.test(r.testo), 'non dice che serve il codice:\n' + r.testo.slice(-600));
  deve(/codice=NNNNNN/.test(r.testo), 'non dice come si consegna il codice');
});

prova('una fonte che non esiste non fa finta di esistere', async () => {
  const r = await conFonti(null, ['--accedi', 'generali']);
  deve(/non è una fonte che conosco/.test(r.testo), 'non dice che «generali» non c\'e\'');
  deve(r.uscita === 0, 'ha cambiato verdetto per un nome sbagliato');
});

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nFONTI DAL VIVO — la prova della prova');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + e.message); }
}
for (const s of chiuse.splice(0)) s.close();
console.log(`\nFONTI DAL VIVO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
