// ═══════════════════════════════════════════════════════════════════════════
//  ALLIANZ — da dove viene il codice monouso, e cosa dice quando non ce l'ha
//
//  PERCHE' ESISTE
//    Il 2 settembre 2026 l'accesso Allianz falliva e il messaggio diceva «il
//    segreto TOTP va rigenerato». Francesco e' andato a rigenerare un segreto
//    che non era il problema: nel campo del seme c'erano SEI CIFRE, cioe' il
//    codice che si legge sul telefono, incollato nella casella sbagliata.
//    Rigenerare non serviva a niente.
//
//    Un messaggio d'errore che manda dalla parte sbagliata costa piu' di
//    nessun messaggio. Queste prove tengono ferme le parole, non solo la logica.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(RADICE, 'allianz/quote-service.mjs'), 'utf8');

/* Le funzioni vivono dentro un file che apre un browser: si estraggono e si
   provano da sole, con un generatore finto al posto di quello vero. */
const pezzo = src.slice(src.indexOf('const SEME_MIN'), src.indexOf('// ── Generatore TOTP'));
const fabbrica = new Function('totpCode', pezzo + '\nreturn { passcodeDa, semePlausibile, SEME_MIN, SEME_VIVO_MS };');
const { passcodeDa, semePlausibile } = fabbrica((seme) => 'GENERATO:' + seme.slice(0, 4));

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('sei cifre nel campo del seme: non ci prova nemmeno, e dice perche\'', () => {
  const r = passcodeDa({ totp: '481920' });
  deve(!r.codice, 'genera un codice da un finto seme');
  deve(/CODICE, non un seme/.test(r.motivo), 'non dice che e\' un codice: ' + r.motivo);
  deve(/Rigenerarlo non serve/.test(r.motivo), 'non smentisce il consiglio sbagliato di rigenerare');
  deve(/stringa lunga del QR/.test(r.motivo), 'non dice cosa serve davvero');
  return 'lo chiama col suo nome e indica il rimedio giusto';
});

prova('un seme vero viene usato', () => {
  const r = passcodeDa({ totp: 'JBSWY3DPEHPK3PXP' });
  deve(r.da === 'seme', 'non riconosce un seme valido');
  deve(r.codice.startsWith('GENERATO:'), 'non genera il codice dal seme');
  deve(semePlausibile('JBSWY3DPEHPK3PXPKFQXG5DF'), 'un seme di 24 caratteri non passa');
  deve(semePlausibile('jbswy3dpehpk3pxp'), 'il seme minuscolo non passa');
  deve(!semePlausibile('JBSWY3DPEHPK3PX'), 'accetta un seme di 15 caratteri');
  deve(!semePlausibile('JBSWY3DPEHPK3P!!'), 'accetta caratteri fuori base32');
  return 'seme riconosciuto e usato, i casi limite tengono';
});

prova('un codice manuale VECCHIO non viene provato', () => {
  // Chi lo scrive nel pannello lo fa minuti prima: quando il servizio lo usa e'
  // gia' morto. Provarlo comunque fa fallire l'accesso e incolpare il seme.
  const vecchio = passcodeDa({ codice: '123456', codice_ts: Date.now() - 5 * 60 * 1000 });
  deve(!vecchio.codice, 'prova un codice di cinque minuti fa');
  deve(/30/.test(vecchio.motivo), 'non spiega quanto vive un codice monouso');
  deve(/SEME/.test(vecchio.motivo), 'non indirizza verso la soluzione vera');
  const fresco = passcodeDa({ codice: '123456', codice_ts: Date.now() - 5000 });
  deve(fresco.codice === '123456', 'scarta anche un codice appena inserito');
  deve(fresco.da === 'codice manuale', 'non dice da dove viene');
  return 'vecchio scartato con la spiegazione, fresco usato';
});

prova('il seme ha la precedenza sul codice manuale', () => {
  const r = passcodeDa({ totp: 'JBSWY3DPEHPK3PXP', codice: '999999', codice_ts: Date.now() });
  deve(r.da === 'seme', 'preferisce il codice manuale al seme');
  return 'prima il seme: e\' l\'unico che regge un accesso non presidiato';
});

prova('senza niente lo dice chiaramente', () => {
  const r = passcodeDa({});
  deve(!r.codice, 'inventa un codice dal nulla');
  deve(/non c'e' ne' il segreto TOTP/.test(r.motivo), 'il motivo non elenca cosa manca: ' + r.motivo);
  return 'dice cosa manca e dove metterlo';
});

prova('il messaggio di rifiuto non accusa piu\' il seme a caso', () => {
  // Prima diceva SEMPRE «va rigenerato». Adesso lo dice solo se il seme e'
  // davvero della forma giusta; altrimenti indica il vero problema.
  deve(/semePlausibile\(c\.totp\)/.test(src), 'il messaggio di rifiuto non guarda la forma del seme');
  deve(/rigenerarlo non serve/i.test(src), 'manca la smentita per il caso del seme sbagliato');
  return 'la frase cambia col caso';
});

let ok = 0;
for (const [p, n, m] of esiti) { if (p) { ok++; console.log('  ✅ ' + n + (m ? '  — ' + m : '')); } else console.log('  ❌ ' + n + '  — ' + m); }
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Allianz passcode: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
