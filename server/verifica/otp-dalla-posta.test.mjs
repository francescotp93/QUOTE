// ═══════════════════════════════════════════════════════════════════════════════
//  IL CODICE DI ACCESSO SE LO PRENDE DA SOLO — e non prende nient'altro
//
//  «Non riesci a farlo tu in autonomia?» (Francesco, 12/09/2026), dopo due
//  giorni in cui Groupama chiedeva il codice via email e la sessione restava
//  fuori finché una persona non apriva la posta.
//
//  Il backend la posta dell'agenzia la legge già. Queste prove sorvegliano che
//  il recupero automatico prenda IL codice e NIENTE ALTRO: solo il mittente
//  della compagnia, solo la finestra del login, mai un codice già usato, mai
//  sei cifre che erano un importo o un numero di pratica. E che il codice non
//  finisca nel giornale della macchina, che nessuno cancella mai.
//
//      node server/verifica/otp-dalla-posta.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const qui = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const O = Object.assign({}, await import('../otpPosta.js').catch(() => ({})));
const manca = (c) => { throw new Error('server/otpPosta.js non c\'è o non esporta ' + c); };
for (const f of ['estraiCodice', 'attendiCodice', 'MITTENTI_OTP', '_dimenticaUsati']) if (!O[f]) O[f] = () => manca(f);

const esiti = [];
const prova = async (nome, fn) => { try { esiti.push([true, nome, (await fn()) || '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

/* Una casella finta: nessuna rete, nessun IMAP, nessuna posta vera. I messaggi
   si costruiscono qui e si controlla cosa ne esce. */
function postaFinta(messaggi) {
  return {
    caselleDisponibili: () => ['agenzia@example.it'],
    conImap: async (casella, fn) => fn({
      mailbox: { exists: messaggi.length },
      getMailboxLock: async () => ({ release() {} }),
      fetch: async function* () {
        for (let i = 0; i < messaggi.length; i++) {
          const m = messaggi[i];
          yield {
            uid: m.uid != null ? m.uid : i + 1,
            internalDate: m.quando || new Date(),
            source: Buffer.from(
              'From: ' + m.da + '\r\nTo: agenzia@example.it\r\nSubject: ' + (m.oggetto || 'Avviso') +
              '\r\nDate: ' + new Date(m.quando || Date.now()).toUTCString() +
              '\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' + (m.testo || '') + '\r\n'),
          };
        }
      },
    }),
  };
}
const cerca = (messaggi, extra) => O.attendiCodice(Object.assign({
  fonte: 'groupama', dopo: 0, attesaMs: 0, passoMs: 1, deps: postaFinta(messaggi), log: () => {},
}, extra || {}));

// ── 1. Prende il codice giusto ───────────────────────────────────────────────
await prova('trova il codice nell\'email della compagnia', async () => {
  O._dimenticaUsati();
  const t = await cerca([{ da: 'noreply@groupama.it', oggetto: 'Codice di accesso', testo: 'Il tuo codice di verifica è 482913. Scade tra 10 minuti.' }]);
  deve(t && t.codice === '482913', 'codice non trovato: ' + JSON.stringify(t));
  return 'mittente ' + t.mittente;
});

await prova('le sei cifre che NON sono un codice non vengono prese', async () => {
  O._dimenticaUsati();
  /* Un importo e un numero di pratica nella stessa email: prendere il primo
     numero che capita vorrebbe dire mandare al portale la cosa sbagliata e
     bruciare un tentativo. Dopo tre tentativi falliti il freno chiude gli
     accessi, e l'utenza dell'agenzia rischia il blocco: qui si sbaglia per
     difetto, non per eccesso. */
  const t = await cerca([{ da: 'noreply@groupama.it', oggetto: 'Riepilogo', testo: 'Pratica 998877 del 12/09. Importo 250000 euro. Nessun codice qui.' }]);
  deve(t === null, 'ha preso un numero che non era un codice: ' + JSON.stringify(t));
  /* Un'unica sequenza di sei cifre, senza nessuna parola che parli di codice,
     NON basta: su «polizza 445566 emessa» prendeva il numero di polizza. */
  deve(O.estraiCodice('Totale premio 1.234,56 - polizza 445566 emessa') === null,
    'un numero di polizza viene ancora scambiato per un codice');
  deve(O.estraiCodice('123456 è il codice per accedere') === '123456',
    'un codice scritto prima della parola «codice» non viene più riconosciuto');
});

// ── 2. Non guarda quello che non deve ────────────────────────────────────────
await prova('un\'email di un altro mittente non viene nemmeno aperta', async () => {
  O._dimenticaUsati();
  const t = await cerca([{ da: 'amministrazione@altrodominio.it', oggetto: 'Codice', testo: 'Il tuo codice di verifica è 111222' }]);
  deve(t === null, 'ha letto la posta di un mittente qualunque: ' + JSON.stringify(t));
});

await prova('non si pesca un codice arrivato PRIMA del login', async () => {
  O._dimenticaUsati();
  const vecchia = Date.now() - 3 * 60 * 1000;
  const t = await cerca([{ da: 'noreply@groupama.it', testo: 'codice di verifica 333444', quando: new Date(vecchia) }], { dopo: Date.now() - 60 * 1000 });
  deve(t === null, 'ha preso un codice di prima che il login partisse: quello è già stato usato o è scaduto');
});

await prova('un codice troppo vecchio non si usa', async () => {
  O._dimenticaUsati();
  const t = await cerca([{ da: 'noreply@groupama.it', testo: 'codice di verifica 555666', quando: new Date(Date.now() - 30 * 60 * 1000) }]);
  deve(t === null, 'ha preso un codice di mezz\'ora fa: il portale lo rifiuterebbe e brucerebbe un tentativo');
});

await prova('lo stesso codice non si consegna due volte', async () => {
  O._dimenticaUsati();
  const messaggi = [{ da: 'noreply@groupama.it', testo: 'codice di verifica 777111' }];
  const primo = await cerca(messaggi);
  deve(primo && primo.codice === '777111', 'il primo giro doveva trovarlo');
  const secondo = await cerca(messaggi);
  deve(secondo === null, 'ha ripescato lo stesso messaggio: manderebbe al portale un codice già consumato');
});

await prova('fra più email prende la più recente', async () => {
  O._dimenticaUsati();
  const t = await cerca([
    { uid: 1, da: 'noreply@groupama.it', testo: 'codice di verifica 111111', quando: new Date(Date.now() - 4 * 60 * 1000) },
    { uid: 2, da: 'noreply@groupama.it', testo: 'codice di verifica 222222', quando: new Date(Date.now() - 30 * 1000) },
  ]);
  deve(t && t.codice === '222222', 'ha preso il codice vecchio: ' + JSON.stringify(t));
});

// ── 3. Non rompe niente, e non parla troppo ──────────────────────────────────
await prova('senza caselle configurate non si rompe: si torna a chiedere a una persona', async () => {
  O._dimenticaUsati();
  const t = await O.attendiCodice({ fonte: 'groupama', dopo: 0, attesaMs: 0, caselle: [], log: () => {} });
  deve(t === null, 'doveva rinunciare in silenzio, invece: ' + JSON.stringify(t));
});

await prova('una casella che non risponde non ferma il login', async () => {
  O._dimenticaUsati();
  const rotta = { caselleDisponibili: () => ['agenzia@example.it'], conImap: async () => { throw new Error('IMAP non raggiungibile'); } };
  const t = await O.attendiCodice({ fonte: 'groupama', dopo: 0, attesaMs: 0, passoMs: 1, deps: rotta, log: () => {} });
  deve(t === null, 'un guasto della posta deve tradursi in «lo inserisca una persona», non in un\'eccezione');
});

await prova('una compagnia che non manda codici per email non viene nemmeno cercata', async () => {
  O._dimenticaUsati();
  let aperta = false;
  const spia = { caselleDisponibili: () => ['agenzia@example.it'], conImap: async () => { aperta = true; return null; } };
  const t = await O.attendiCodice({ fonte: 'hdi', dopo: 0, attesaMs: 0, deps: spia, log: () => {} });
  deve(t === null && !aperta, 'ha aperto la posta per una compagnia che il codice non lo manda per email');
});

await prova('il codice NON finisce nel giornale', async () => {
  O._dimenticaUsati();
  const righe = [];
  await cerca([{ da: 'noreply@groupama.it', testo: 'Il tuo codice di verifica è 909090' }], { log: (m) => righe.push(m) });
  const tutto = righe.join('\n');
  deve(righe.length, 'non scrive niente: non si saprebbe nemmeno che è arrivato');
  deve(!tutto.includes('909090'), 'il codice è finito nel giornale, che nessuno cancella: ' + tutto);
  deve(/trovato/i.test(tutto), 'non dice che il codice è stato trovato');
  return righe[0].slice(0, 90);
});

// ── 4. L'aggancio nel pannello Fonti ─────────────────────────────────────────
await prova('il pannello avvia la ricerca solo quando il portale chiede il codice', () => {
  const src = fs.readFileSync(path.join(qui, 'fonti.js'), 'utf8');
  deve(/import \{ attendiCodice, MITTENTI_OTP \}/.test(src), 'fonti.js non usa il recupero automatico');
  const i = src.indexOf("const dove = req.query.forza === '1'");
  const blocco = src.slice(i, i + 1500);
  deve(/attesa_otp\|serve_codice/.test(blocco), 'la ricerca parte anche quando il portale non ha chiesto nessun codice');
  deve(/codiceDallaPosta\(/.test(blocco), 'non viene avviata la ricerca del codice');
  deve(/const partito = Date\.now\(\)/.test(blocco) && blocco.indexOf('const partito') < blocco.indexOf('proxyScraper'),
    'il momento di partenza si prende DOPO la chiamata: un\'email arrivata nel frattempo verrebbe scartata');
  /* Non si aspetta: la risposta del login deve tornare subito al pannello, che
     poi polla lo stato. Se si aspettasse, la schermata resterebbe ferma. */
  deve(/codiceDallaPosta\([^)]*\)\.catch/.test(blocco), 'il login aspetta la posta invece di rispondere subito al pannello');
});

await prova('due ricerche insieme non si rubano il codice a vicenda', () => {
  const src = fs.readFileSync(path.join(qui, 'fonti.js'), 'utf8');
  deve(/otpInCorso/.test(src), 'niente guardia: due accessi ravvicinati cercherebbero lo stesso codice, e uno lo consumerebbe per l\'altro');
});

let ko = 0;
for (const [ok, nome, nota] of esiti) { if (!ok) ko++; console.log((ok ? '  ok  ' : '  KO  ') + nome + (nota ? '  — ' + nota : '')); }
console.log('\nCODICE DALLA POSTA: ' + (esiti.length - ko) + ' superate, ' + ko + ' fallite');
process.exit(ko ? 1 : 0);
