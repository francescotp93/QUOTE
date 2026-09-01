// ═══════════════════════════════════════════════════════════════════════════════
//  «NON C'È» E «NON L'HO CHIESTO» SONO DUE FRASI DIVERSE
//
//  Perché questa prova esiste. Il 1 settembre 2026 il motore sulla VPS non
//  rispondeva. Sul preventivatore Motor la schermata diceva: «Cliente non
//  presente nella banca dati Italiana — compila i dati a mano». Falso, e
//  dannoso: il cliente c'era eccome — entrando a mano su Plurima i dati si
//  vedevano — ma noi non avevamo chiesto niente a nessuno, perché il nostro
//  servizio di collegamento era giù. La frase accusava la compagnia di un
//  nostro guasto e mandava a cercare nel posto sbagliato.
//
//  È la stessa malattia trovata nel Pannello Fonti («non lo so» mostrato come
//  «sessione scaduta») e nella cifratura («non si decifra» letto come «vuoto»):
//  un'assenza di risposta tradotta in una risposta negativa.
//
//  Cosa sorveglia. Che quando le fonti non rispondono per un guasto NOSTRO
//  (fetch che esplode, oppure 502/503/504 dal nostro backend) lo stato del
//  recupero sia «irraggiungibile» e non «vuoto», e che il messaggio a video non
//  dica che il cliente non c'è.
//
//  Come funziona. Estrae le funzioni VERE da index.html e le esegue con le
//  dipendenze finte: nessuna copia del codice, quindi la prova non può
//  divergere da ciò che gira davvero.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const src = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8');

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, msg) => { if (!c) throw new Error(msg); };

// Estrae `function nome(...) { … }` contando le graffe: si ferma alla chiusura
// giusta anche se dentro ci sono oggetti, stringhe con graffe o funzioni annidate.
function estrai(nome) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + nome + '\\s*\\(');
  const m = re.exec(src);
  deve(m, 'funzione ' + nome + ' non trovata in index.html');
  let i = src.indexOf('{', m.index + m[0].length - 1);
  deve(i > 0, 'corpo di ' + nome + ' non trovato');
  let liv = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') liv++;
    else if (src[j] === '}') { liv--; if (liv === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('graffe non bilanciate in ' + nome);
}

// Sul codice PRECEDENTE questi due pezzi non esistono. La prova non deve morire
// all'avvio: deve girare lo stesso e mostrare il comportamento sbagliato — altrimenti
// la controprova direbbe solo «il codice nuovo non c'e'», che non e' una prova.
const AW_STATI_GIU = (/const AW_STATI_GIU = (\[[^\]]*\])/.exec(src) || [])[1] || '[]';
const HA_SEGNALE = /function awFonteGiu\(/.test(src);

// Banco: le funzioni vere, le dipendenze finte.
function banco(opz = {}) {
  const AUTO_DATA = Object.assign({ tipoPreventivo: 'Rinnovo' }, opz.dati || {});
  const registro = [];
  const ctx = {
    AUTO_DATA, AUTO_STEP: 1,
    rcaLog: (ev, d) => registro.push({ ev, d }),
    awSituazioneLabel: () => 'Rinnovo',
    awAggiornaBannerRecupero: () => {},
    awApplyAniaContraente: async () => false,
    awAnagFromCF: async () => ({}),
    awConsolidaCliente: async () => {},
    quotoToast: () => {},
    esc: s => String(s),
    document: { getElementById: () => null },
  };
  const finzioneSegnale = HA_SEGNALE ? estrai('awFonteGiu')
    : 'function awFonteGiu(m) { AUTO_DATA._fonteGiu = m || true; }';   // non esiste ancora: la simulo
  const codice = AW_STATI_GIU_DECL + '\n' + finzioneSegnale + '\n' + estrai('awPrefillAnagrafica') + '\n'
    + estrai('awBannerRecuperoHTML') + '\n'
    + 'return { awFonteGiu, awPrefillAnagrafica, awBannerRecuperoHTML, AUTO_DATA, registro };';
  const nomi = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  return new Function(...nomi, 'registro', codice)(...nomi.map(n => ctx[n]), registro);
}
const AW_STATI_GIU_DECL = 'const AW_STATI_GIU = ' + AW_STATI_GIU + ';';

// ── 1. Il guasto nostro non diventa «il cliente non c'è» ─────────────────────
prova('fonte giù → stato «irraggiungibile», non «vuoto»', async () => {
  const b = banco();
  b.awFonteGiu('Failed to fetch');           // come quando il backend non risponde
  await b.awPrefillAnagrafica(Promise.resolve({ ok: false }));
  deve(b.AUTO_DATA.recuperoStato === 'irraggiungibile',
    'stato atteso «irraggiungibile», trovato «' + b.AUTO_DATA.recuperoStato + '»');
});

prova('il messaggio NON dice che il cliente non c\'è', async () => {
  const b = banco();
  b.awFonteGiu('http 502');
  await b.awPrefillAnagrafica(Promise.resolve({ ok: false }));
  const html = b.awBannerRecuperoHTML();
  deve(!/non presente nella banca dati/i.test(html),
    'il messaggio accusa ancora la banca dati della compagnia');
  deve(/non ho potuto interrogare/i.test(html),
    'il messaggio non dice che non siamo riusciti a chiedere');
});

// ── 2. Quando invece la fonte RISPONDE «non ce l'ho», il messaggio resta quello ──
prova('fonte che risponde «non c\'è» → resta «vuoto»', async () => {
  const b = banco();
  await b.awPrefillAnagrafica(Promise.resolve({ ok: true, proprietario: null }));
  deve(b.AUTO_DATA.recuperoStato === 'vuoto',
    'stato atteso «vuoto», trovato «' + b.AUTO_DATA.recuperoStato + '»');
  deve(/non presente nella banca dati/i.test(b.awBannerRecuperoHTML()),
    'quando la compagnia risponde davvero «non ce l\'ho», va detto');
});

// ── 3. Il segnale del PRIMO tentativo non va perso ───────────────────────────
// awHubRecupera parte per prima e puo' gia' accorgersi che la fonte e' giu'.
// Se qualcuno azzerasse la bandierina dentro awPrefillAnagrafica, quel segnale
// sparirebbe e si tornerebbe a dire «il cliente non c'e'».
prova('la bandierina non viene azzerata dentro awPrefillAnagrafica', () => {
  const corpo = estrai('awPrefillAnagrafica');
  deve(!/_fonteGiu\s*=\s*(false|null|0)/.test(corpo),
    'awPrefillAnagrafica azzera _fonteGiu: cancella il guasto visto dal primo tentativo');
});
prova('la bandierina viene azzerata prima del primo tentativo', () => {
  const i = src.indexOf('AUTO_DATA._fonteGiu = false');
  const j = src.indexOf('await awHubRecupera(');
  deve(i > 0 && j > 0 && i < j, 'l\'azzeramento non precede la prima chiamata');
});

// ── 4. Tutte e tre le strade segnalano il guasto ─────────────────────────────
prova('hub-auto, hub-veicolo e ANIA segnalano tutte il guasto', () => {
  deve(HA_SEGNALE, 'awFonteGiu non esiste: nessuna strada segnala il guasto');
  for (const f of ['awHubRecupera', 'awHubVeicolo', 'awAniaLookup']) {
    const corpo = estrai(f);
    const quante = (corpo.match(/awFonteGiu\(/g) || []).length;
    deve(quante >= 2, f + ' segnala il guasto in ' + quante + ' punti: servono sia il catch sia lo stato http');
  }
});

// ── Esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
for (const e of esiti) {
  try { await e.fn(); console.log('  ✅ ' + e.nome); }
  catch (err) { ko++; console.log('  ❌ ' + e.nome + '\n       ' + err.message); }
}
console.log(ko ? '\n' + ko + ' prove non reggono.' : '\nTutto regge.');
process.exit(ko ? 1 : 0);
