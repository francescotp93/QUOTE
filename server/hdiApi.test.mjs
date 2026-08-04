// ═══════════════════════════════════════════════════════════════════════════════
//  HDI · Partner API — prove sul collegamento
//
//  Nessuna chiamata esce verso HDI: il `fetch` e' finto e viene iniettato. Le
//  prove sorvegliano i quattro modi in cui un collegamento OAuth2 si rompe in
//  produzione e non in prova:
//
//   1. il token scaduto usato lo stesso, perche' la cache non tiene margine;
//   2. il segreto che finisce in un messaggio d'errore o in uno stato;
//   3. il 403 (non abilitato) confuso con un guasto, e viceversa;
//   4. il ritentativo su 401 che diventa un ciclo infinito.
// ═══════════════════════════════════════════════════════════════════════════════
import { hdiToken, hdiChiama, hdiScordaToken, hdiConfigurato, hdiAmbiente,
         hdiClientIdCorto, hdiDatiVeicolo } from './hdiApi.js';

const esiti = [];
const prova = async (nome, fn) => {
  try { const m = await fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

const CHIAVE = 'segretissimo-non-deve-uscire-mai';
function conCredenziali() {
  process.env.HDI_CLIENT_ID = 'withus-client';
  process.env.HDI_CLIENT_SECRET = CHIAVE;
}
function senzaCredenziali() {
  delete process.env.HDI_CLIENT_ID;
  delete process.env.HDI_CLIENT_SECRET;
}
/* Un finto HDI: registra cosa gli e' stato chiesto e risponde a comando. */
function finto(risposte) {
  const viste = [];
  const f = async (url, opz) => {
    viste.push({ url, opz });
    const r = risposte.shift();
    if (typeof r === 'function') return r(url, opz);
    return { ok: r.stato < 400, status: r.stato, text: async () => r.corpo || '' };
  };
  f.viste = viste;
  return f;
}
const tokenOk = (durata = 3600) => ({ stato: 200, corpo: JSON.stringify({ access_token: 'tok-' + durata, expires_in: durata }) });

// ── 1. Senza credenziali non si tenta nemmeno ────────────────────────────────
await prova('senza credenziali non si chiama HDI, e si dice perche\'', async () => {
  senzaCredenziali(); hdiScordaToken();
  deve(hdiConfigurato() === false, 'si dichiara configurato senza credenziali');
  const f = finto([tokenOk()]);
  let err = null;
  try { await hdiToken({ fetchImpl: f }); } catch (e) { err = e; }
  deve(err, 'non si e\' fermato');
  deve(err.codice === 'NON_CONFIGURATO', 'motivo sbagliato: ' + err.codice);
  deve(f.viste.length === 0, 'ha chiamato HDI lo stesso: ' + f.viste.length + ' richieste');
  deve(/\.env/.test(err.message), 'non dice dove si mettono le credenziali');
});

// ── 2. Il token si riusa, ma non oltre il margine ────────────────────────────
await prova('un token valido si riusa invece di chiederne un altro', async () => {
  conCredenziali(); hdiScordaToken();
  const f = finto([tokenOk(3600), tokenOk(3600)]);
  const t0 = Date.now();
  const a = await hdiToken({ fetchImpl: f, adesso: t0 });
  const b = await hdiToken({ fetchImpl: f, adesso: t0 + 60_000 });
  deve(a === b, 'ha cambiato token senza motivo');
  deve(f.viste.length === 1, 'ha chiesto ' + f.viste.length + ' token invece di 1');
});

await prova('un token quasi scaduto NON si usa: si chiede prima', async () => {
  /* Il difetto classico: un token che scade fra mezzo secondo e' gia' scaduto
     quando la richiesta arriva dall'altra parte. Senza margine si vede solo in
     produzione, ogni tanto, senza motivo apparente. */
  conCredenziali(); hdiScordaToken();
  const f = finto([tokenOk(3600), tokenOk(3600)]);
  const t0 = Date.now();
  await hdiToken({ fetchImpl: f, adesso: t0 });
  await hdiToken({ fetchImpl: f, adesso: t0 + 3600_000 - 30_000 });   // 30s alla scadenza
  deve(f.viste.length === 2, 'ha riusato un token che stava per scadere');
});

// ── 3. Il segreto non esce mai ───────────────────────────────────────────────
await prova('le credenziali non finiscono nei messaggi d\'errore', async () => {
  conCredenziali(); hdiScordaToken();
  /* Una risposta di errore di HDI puo' contenere l'eco di quello che gli e'
     stato mandato: se finisse nel messaggio, finirebbe nei log. */
  const f = finto([{ stato: 401, corpo: 'invalid_client: ' + CHIAVE }]);
  let err = null;
  try { await hdiToken({ fetchImpl: f }); } catch (e) { err = e; }
  deve(err, 'non si e\' fermato su un 401');
  deve(err.codice === 'CREDENZIALI', 'motivo sbagliato: ' + err.codice);
  deve(!err.message.includes(CHIAVE), 'IL SEGRETO E\' NEL MESSAGGIO: ' + err.message);
});

await prova('lo stato non stampa il segreto, e del client id mostra solo l\'inizio', async () => {
  conCredenziali();
  const c = hdiClientIdCorto();
  deve(c && c.length <= 6, 'il client id esce per intero: ' + c);
  deve(!String(c).includes(CHIAVE), 'nello stato c\'e\' il segreto');
});

await prova('le credenziali viaggiano nell\'intestazione, non nel corpo', async () => {
  /* Nel corpo finirebbero nei log dei proxy che registrano i corpi. */
  conCredenziali(); hdiScordaToken();
  const f = finto([tokenOk()]);
  await hdiToken({ fetchImpl: f });
  const v = f.viste[0];
  deve(/^Basic /.test(v.opz.headers.Authorization), 'non usa l\'intestazione Basic');
  deve(!String(v.opz.body || '').includes(CHIAVE), 'il segreto e\' nel corpo della richiesta');
  deve(/grant_type=client_credentials/.test(v.opz.body), 'non chiede un token client_credentials');
  /* HDI non dichiara nessuno scope: mandarne uno inventato farebbe rifiutare
     la richiesta. */
  deve(!/scope=/.test(v.opz.body), 'manda uno scope che HDI non dichiara');
});

// ── 4. Un 401 a meta' strada si riprova UNA volta ────────────────────────────
await prova('se il token scade nel mezzo si riprova una volta sola', async () => {
  conCredenziali(); hdiScordaToken();
  const f = finto([
    tokenOk(),                                        // primo token
    { stato: 401, corpo: '' },                        // la chiamata lo trova scaduto
    tokenOk(),                                        // token nuovo
    { stato: 200, corpo: '{"targa":"AB123CD"}' },     // e adesso passa
  ]);
  const d = await hdiChiama('/api/v2/road/getCarDataRE?plate=AB123CD', { fetchImpl: f });
  deve(d && d.targa === 'AB123CD', 'non ha restituito i dati');
  deve(f.viste.length === 4, 'ha fatto ' + f.viste.length + ' richieste invece di 4');
});

await prova('un 401 che non passa mai non diventa un martellamento', async () => {
  conCredenziali(); hdiScordaToken();
  const f = finto([tokenOk(), { stato: 401, corpo: '' }, tokenOk(), { stato: 401, corpo: '' },
                   tokenOk(), { stato: 401, corpo: '' }]);
  let err = null;
  try { await hdiChiama('/x', { fetchImpl: f }); } catch (e) { err = e; }
  deve(err, 'non si e\' arreso mai');
  deve(f.viste.length === 4, 'ha insistito: ' + f.viste.length + ' richieste');
});

// ── 5. Il 403 non e' un guasto ───────────────────────────────────────────────
await prova('«non abilitato» si distingue da «rotto»', async () => {
  /* E' la risposta che ci aspettiamo sulle rotte di emissione finche' HDI non
     ce le abilita: confonderla con un guasto manda a cercare nel posto
     sbagliato. */
  conCredenziali(); hdiScordaToken();
  const f = finto([tokenOk(), { stato: 403, corpo: 'forbidden' }]);
  let err = null;
  try { await hdiChiama('/api/v2/road/instances/1/issuance', { fetchImpl: f, method: 'POST' }); } catch (e) { err = e; }
  deve(err && err.codice === 'NON_ABILITATO', 'motivo sbagliato: ' + (err && err.codice));
  deve(/abilitata/i.test(err.message), 'non dice che e\' un permesso mancante');

  hdiScordaToken();
  const f2 = finto([tokenOk(), { stato: 500, corpo: 'boom' }]);
  let err2 = null;
  try { await hdiChiama('/x', { fetchImpl: f2 }); } catch (e) { err2 = e; }
  deve(err2 && err2.codice === 'ERRORE_HDI', 'un 500 non e\' un guasto: ' + (err2 && err2.codice));
});

// ── 6. Collaudo e produzione non si confondono ───────────────────────────────
await prova('si sa sempre se si sta quotando sul collaudo', async () => {
  /* I premi di cert non sono premi veri: scoprirlo dopo averli mostrati a un
     cliente e' il guaio peggiore di tutta questa integrazione. */
  process.env.HDI_API_BASE = 'https://platform-cert.hdia.it';
  deve(hdiAmbiente() === 'collaudo', 'non riconosce il collaudo');
  process.env.HDI_API_BASE = 'https://platform.hdia.it';
  deve(hdiAmbiente() === 'produzione', 'non riconosce la produzione');
  delete process.env.HDI_API_BASE;
});

// ── 7. La prima rotta ────────────────────────────────────────────────────────
await prova('dati veicolo: la targa si ripulisce e non si chiama a vuoto', async () => {
  conCredenziali(); hdiScordaToken();
  let err = null;
  const f0 = finto([]);
  try { await hdiDatiVeicolo('  ', { fetchImpl: f0 }); } catch (e) { err = e; }
  deve(err && err.codice === 'TARGA_MANCANTE', 'una targa vuota parte lo stesso');
  deve(f0.viste.length === 0, 'ha chiamato HDI con la targa vuota');

  hdiScordaToken();
  const f = finto([tokenOk(), { stato: 200, corpo: '{"ok":1}' }]);
  await hdiDatiVeicolo(' ab 123 cd ', { fetchImpl: f });
  const url = f.viste[1].url;
  deve(/plate=AB123CD/.test(url), 'la targa non e\' stata ripulita: ' + url);
  deve(/\/api\/v2\/road\/getCarDataRE/.test(url), 'rotta sbagliata: ' + url);
});

senzaCredenziali();
let ko = 0;
console.log('\nHDI PARTNER API — il collegamento');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nHDI API: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
