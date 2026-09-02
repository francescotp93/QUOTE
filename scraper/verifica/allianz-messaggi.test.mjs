// ═══════════════════════════════════════════════════════════════════════════
//  ALLIANZ — il messaggio che legge Francesco quando il codice non entra
//
//  PERCHE' ESISTE
//    Il 2 settembre 2026, alle 07:20, il servizio ha scritto dieci volte di
//    fila «ri-login fallito (serve approvazione Duo)». Nessun tentativo era
//    partito: il freno era scattato, e di approvazioni Duo non ne serviva
//    nessuna. Poco dopo, premendo «Accedi» dal pannello, e' comparso «Codice
//    monouso non accettato: se si ripete, il segreto TOTP va rigenerato» —
//    e nessun codice era mai stato provato. Il motivo vero — nel campo del
//    seme c'erano SEI CIFRE, cioe' un codice — era gia' stato calcolato da
//    passcodeDa e buttato via dal chiamante.
//
//    Il difetto non era la logica: era che ogni chiamante si inventava la
//    spiegazione. Queste prove tengono ferme le PAROLE, non solo gli esiti,
//    e controllano che le frasi inventate non tornino.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(RADICE, 'allianz/quote-service.mjs'), 'utf8');

// I pezzi puri si estraggono e si provano da soli: il file vero apre un browser.
const base = src.slice(src.indexOf('const SEME_MIN'), src.indexOf('// ── Generatore TOTP'));
const da = src.indexOf('function esitoCodiceRifiutato');
const frasi = da < 0 ? '' : src.slice(da, src.indexOf('async function inserisciCodiceMonouso'));
/* Se la funzione non c'e' (com'era prima del 2 settembre) le prove devono
   fallire dicendo COSA manca, non esplodere in fase di lettura del file:
   una contro-prova illeggibile non prova niente. */
const fabbrica = new Function('totpCode', base + '\n' + frasi +
  '\nreturn { passcodeDa, semePlausibile, esitoCodiceRifiutato: ' + (da < 0 ? 'null' : 'esitoCodiceRifiutato') + ' };');
const pezzi = fabbrica(() => '000000');
const esitoCodiceRifiutato = pezzi.esitoCodiceRifiutato
  || (() => { throw new Error('esitoCodiceRifiutato non esiste: ogni chiamante si inventa ancora la spiegazione'); });

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const SEME = 'JBSWY3DPEHPK3PXP';

prova('col seme sbagliato NON dice di rigenerarlo', () => {
  // E' il consiglio che il 2 settembre ha fatto perdere tempo a Francesco:
  // rigenerare un seme quando nel campo del seme non c'e' un seme non ripara niente.
  const m = esitoCodiceRifiutato(true, '481920');
  deve(!/va rigenerato/.test(m), 'consiglia ancora di rigenerare: ' + m);
  deve(/non c'è un seme|non c'e' un seme/.test(m), 'non dice che li dentro non c\'e\' un seme: ' + m);
  deve(/QR/.test(m), 'non indica cosa incollare davvero: ' + m);
  return 'manda dalla parte giusta';
});

prova('col seme giusto, invece, rigenerare E\' il consiglio buono', () => {
  const m = esitoCodiceRifiutato(true, SEME);
  deve(/rigenerat/.test(m), 'con un seme valido non suggerisce di rigenerarlo: ' + m);
  deve(/Login non riuscito/.test(m), 'non riporta cosa ha risposto il portale: ' + m);
  return 'il consiglio giusto resta dov\'e\' utile';
});

prova('senza nessun seme non parla di semi', () => {
  // Qui il seme non c'entra: il codice era vecchio o sbagliato, punto.
  const m = esitoCodiceRifiutato(false, '');
  deve(!/seme|TOTP|QR/i.test(m), 'tira in ballo il seme quando non c\'e\': ' + m);
  deve(/scadut|nuovo/i.test(m), 'non dice di prenderne uno nuovo: ' + m);
  return 'parla solo di quello che c\'entra';
});

prova('distingue «il portale ha detto no» da «il portale non si e\' aperto»', () => {
  deve(/Login non riuscito/.test(esitoCodiceRifiutato(true, SEME)), 'non riporta il rifiuto esplicito');
  deve(/non si e|non si è/.test(esitoCodiceRifiutato(false, SEME)), 'confonde il silenzio con un rifiuto');
  return 'due situazioni diverse, due frasi diverse';
});

// ── Le frasi inventate dai chiamanti: che non tornino ──────────────────────
prova('il pannello non annuncia un codice rifiutato che nessuno ha provato', () => {
  // doAccediGuidato: quando passcodeDa non produce nulla, il portale sta ancora
  // aspettando. Dire «non accettato» li' e' semplicemente falso.
  const guidato = src.slice(src.indexOf('async function doAccediGuidato'), src.indexOf('async function doCodiceGuidato'));
  deve(!/Codice monouso non accettato\. Se si ripete/.test(guidato), 'la frase inventata e\' ancora li\'');
  deve(/r\.motivo/.test(guidato), 'non usa il motivo vero calcolato da inserisciCodiceMonouso');
  return 'dice quello che sa, non quello che fa comodo';
});

prova('col pannello aperto non brucia un tentativo con un codice vecchio', () => {
  /* Nel flusso guidato c'e' una persona col telefono in mano. Provare da soli
     un codice salvato — vecchio per forza — perde i trenta secondi in cui il
     codice che ha SOTTO GLI OCCHI sarebbe ancora buono, e fa scattare il freno
     per un tentativo che non poteva riuscire. Ci si prova solo con un SEME. */
  const guidato = src.slice(src.indexOf('async function doAccediGuidato'), src.indexOf('async function doCodiceGuidato'));
  const ramo = guidato.slice(guidato.indexOf('schermataCodiceMonouso()'));
  deve(/semePlausibile\(c\.totp\)/.test(ramo), 'ci prova comunque, anche senza un seme che generi un codice valido adesso');
  const i = ramo.indexOf('semePlausibile(c.totp)'), j = ramo.indexOf('inserisciCodiceMonouso');
  deve(i > 0 && i < j, 'tenta prima e controlla dopo');
  deve(/trenta secondi|30 secondi/.test(ramo), 'non dice quanto vive il codice: e\' il motivo per cui va preso adesso');
  return 'si ferma e chiede, invece di sprecare il momento buono';
});

prova('un codice appena digitato non puo\' essere scartato perche\' «vecchio»', () => {
  // Nello store resta il timbro del codice precedente. Senza rimetterlo a
  // «adesso», il controllo sull'eta' poteva buttare via il codice che
  // Francesco ha in mano in quel momento, senza nemmeno provarlo.
  const conf = src.slice(src.indexOf('async function doCodiceGuidato'), src.indexOf('let ok = await loggedIn()'));
  deve(/codice_ts:\s*Date\.now\(\)/.test(conf), 'non marca come fresco il codice appena digitato');
  deve(/totp:\s*''/.test(conf), 'non ignora il seme salvato: comanda il codice in mano a Francesco');
  return 'il codice del momento viene provato davvero';
});

prova('il keep-alive non incolpa Duo per un tentativo mai partito', () => {
  const ka = src.slice(src.indexOf('async function keepAlive'));
  deve(!/ri-login', ok \? 'OK' : 'fallito \(serve approvazione Duo\)'/.test(ka), 'la spiegazione fissa e\' ancora li\'');
  deve(/freno scattato/.test(ka), 'non distingue il freno dal fallimento');
  deve(/passcodeDa\(creds\(\)\)\.motivo/.test(ka), 'non riporta il motivo vero quando fallisce');
  return 'tre situazioni diverse, tre righe di log diverse';
});

prova('lo /status racconta anche lo stato del login guidato', () => {
  // Il backend, quando «loggato» e' incerto, guarda login_step per decidere.
  // Allianz non lo mandava: quel ramo non poteva scattare.
  const st = src.slice(src.indexOf("if (u.pathname.startsWith('/status'))"), src.indexOf("if (u.pathname.startsWith('/loginstate'))"));
  for (const campo of ['login_step', 'login_running', 'login_msg', 'codice_in_attesa']) {
    deve(new RegExp(campo + ':').test(st), 'lo /status non riporta ' + campo);
  }
  deve(/ha_totp: semePlausibile\(c\.totp\)/.test(st), 'ha_totp dice ancora «il campo e\' pieno» invece di «c\'e\' un seme»');
  return 'il pannello puo\' finalmente vedere cosa sta succedendo';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Allianz · i messaggi del login ───────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
