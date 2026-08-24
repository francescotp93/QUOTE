// ═══════════════════════════════════════════════════════════════════════════════
//  TUTTE LE PROVE DI PRIMA, IN UN COMANDO, CON UN ESITO SOLO
//
//  Francesco lavora dal telefono: l'esito dev'essere binario. Qui girano tutte
//  le prove dell'estensione una dopo l'altra e alla fine c'è una riga sola —
//  VA BENE oppure l'elenco di quel che non va. Codice di uscita 0 o 1.
//
//      node prima-extension/verifica/tutte.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const SUITE = [
  ['prezzo.test.mjs', 'la lettura del premio (aritmetica, senza browser)'],
  ['montaggio.test.mjs', 'i file dell\'estensione sono montati bene'],
  ['pacchetto.test.mjs', 'il pacchetto da scaricare è aggiornato'],
  ['ponte-quoto.test.mjs', 'il protocollo fra QUOTO e l\'estensione'],
  ['catena-completa.test.mjs', 'la catena intera in un Chrome vero'],
];

function esegui(file) {
  return new Promise((r) => {
    const p = spawn(process.execPath, [path.join(QUI, file)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => r({ code, out }));
  });
}

const rotte = [];
for (const [file, cosa] of SUITE) {
  const { code, out } = await esegui(file);
  const riga = (out.match(/^[A-ZÀ-Ù ↔·]+: \d+ superate, \d+ fallite$/m) || [])[0] || '(nessun riepilogo)';
  console.log((code === 0 ? '  ok  ' : '  X   ') + cosa + '\n        ' + riga);
  if (code !== 0) {
    rotte.push(file);
    /* Le righe rosse si riportano qui: chi lancia il comando non deve poi
       andare a rilanciare la singola prova per sapere che cosa e' successo. */
    for (const l of out.split('\n')) if (/^\s*X\s/.test(l)) console.log('        ' + l.trim());
  }
}

console.log('');
if (rotte.length) { console.log('PRIMA: NON VA — ' + rotte.join(', ')); process.exit(1); }
console.log('PRIMA: VA BENE — tutte le prove superate.');
