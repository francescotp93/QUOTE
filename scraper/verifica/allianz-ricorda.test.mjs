// ═══════════════════════════════════════════════════════════════════════════
//  ALLIANZ — «ricorda questo dispositivo», l'unica leva su un 2FA senza seme
//
//  PERCHE' ESISTE
//    Con Duo Mobile e AXA Guardian il seme non esiste: l'app mostra sei cifre e
//    basta. Quindi un accesso non presidiato si puo' ottenere in un modo solo —
//    chiedere al portale di NON richiedere il secondo fattore la prossima volta.
//
//    AXA lo fa da sempre (trustDevice) e infatti la sua sessione dura. Allianz
//    non l'ha mai fatto: ogni caduta di sessione tornava a costare un gesto a
//    una persona, per sempre. Non era una scelta, era una dimenticanza — nel
//    codice il caso «dispositivo ricordato» era perfino previsto e commentato,
//    ma nessuno spuntava mai la casella che lo produce.
//
//    La casella compare in posti diversi (accanto alla password, accanto al
//    codice, o su una schermata SUCCESSIVA alla conferma) e puo' stare dentro
//    un iframe: per questo va ripassata piu' volta, non una.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(RADICE, 'allianz/quote-service.mjs'), 'utf8');

function corpoDi(firma, s = src) {
  const i = s.indexOf(firma); if (i < 0) return null;
  let liv = 0, j = s.indexOf('{', i); const inizio = j;
  for (; j < s.length; j++) { if (s[j] === '{') liv++; else if (s[j] === '}') { liv--; if (liv === 0) return s.slice(inizio, j + 1); } }
  return null;
}

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('la casella dei 30 giorni viene cercata e spuntata', () => {
  const f = corpoDi('async function ricordaDispositivo()');
  deve(f, 'Allianz non chiede di essere ricordata: ogni sessione morta costera\' un gesto a una persona');
  deve(/30\\s\*giorni|30\\s\*days/.test(f) || /30/.test(f), 'non riconosce la dicitura dei 30 giorni');
  deve(/ricorda|remember/i.test(f), 'non riconosce la dicitura «ricorda»');
  deve(/\.click\(\)/.test(f), 'la trova e non la spunta');
  deve(/checked/.test(f), 'la rispunta anche se e\' gia\' spuntata');
  return 'la leva esiste e viene tirata';
});

prova('viene cercata anche dentro gli iframe', () => {
  // Il 2FA di Allianz vive su mfa.allianz.it dentro il guscio del portale: una
  // ricerca sul solo documento principale non troverebbe niente.
  const f = corpoDi('async function ricordaDispositivo()');
  deve(/page\.frames\(\)/.test(f), 'guarda solo la pagina principale e non i frame');
  deve(/mainFrame\(\)/.test(f), 'salta il documento principale');
  return 'nessun frame lasciato fuori';
});

prova('si ripassa DOPO la conferma, non solo prima', () => {
  /* Alcune versioni chiedono «vuoi ricordare questo dispositivo?» su una
     schermata successiva al codice: passare una volta sola, prima, vuol dire
     non prendere mai i 30 giorni. */
  const f = corpoDi('async function inserisciCodiceMonouso(c)');
  const dopo = f.slice(f.indexOf('for (let i = 0; i < 14'));
  deve(/ricordaDispositivo/.test(dopo), 'non ripassa mentre aspetta l\'esito del codice');
  return 'anche la schermata che arriva dopo';
});

prova('vale per tutte e tre le strade d\'ingresso', () => {
  // codice monouso (OSP), passcode Duo, e login automatico: se una sola le
  // dimentica, basta quella a far ricominciare da capo il giro dei codici.
  for (const [nome, firma] of [
    ['codice monouso', 'async function inserisciCodiceMonouso(c)'],
    ['passcode Duo', 'async function enterPasscode(code)'],
    ['login automatico', 'async function autoLoginGrezzo()'],
    ['accesso dal pannello', 'async function doAccediGuidato()'],
  ]) {
    deve(/ricordaDispositivo/.test(corpoDi(firma) || ''), 'la strada «' + nome + '» non chiede i 30 giorni');
  }
  return 'quattro strade, nessuna scorciatoia dimenticata';
});

prova('se la casella non c\'e\', non si rompe niente', () => {
  // Su molte schermate la casella semplicemente non esiste: e' normale, non un
  // guasto, e non deve fermare il login ne' riempire il log di allarmi.
  const f = corpoDi('async function ricordaDispositivo()');
  deve(/catch\(\(\) => 0\)/.test(f), 'un frame che non collabora fa saltare tutto il login');
  deve(/if \(totale\)/.test(f), 'scrive nel log anche quando non c\'e\' niente da dire');
  const chiamate = (src.match(/await ricordaDispositivo\(\)\.catch/g) || []).length;
  deve(chiamate >= 4, 'ci sono chiamate senza rete di sicurezza: ' + chiamate);
  return 'una casella assente e\' un caso normale, non un errore';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Allianz · ricorda questo dispositivo ─────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
