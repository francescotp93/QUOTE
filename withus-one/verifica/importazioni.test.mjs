/* ═══════════════════════════════════════════════════════════════════════════
   IMPORTAZIONI — ogni nome importato deve esistere davvero
   ───────────────────────────────────────────────────────────────────────────
   Perché esiste questa prova: il 30/07/2026 il guscio importava `esc` da
   ui.js, che non lo esporta. Il browser fermava TUTTO il programma con un solo
   messaggio in console — schermata bianca, nessun indizio a schermo. Tutte le
   altre prove erano verdi, perché nessuna di loro caricava il guscio.

   Un errore così non si trova a mano: si trova solo controllando ogni riga di
   importazione contro le esportazioni vere del file citato.
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { esiti, deve, RADICE } from './banco.mjs';

/* dati.js tocca il magazzino del browser appena viene caricato: senza queste
   finte finestre non si potrebbe nemmeno importarlo qui per esaminarlo. */
if (!globalThis.window) globalThis.window = {};

const e = esiti('IMPORTAZIONI — i nomi importati esistono');

const cartelle = ['nucleo', 'moduli'];
const file = cartelle.flatMap(c => {
  const d = path.join(RADICE, c);
  return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.js')).map(f => path.join(c, f)) : [];
});

deve(file.length > 0, 'nessun file da controllare');

for (const rel of file) {
  const src = fs.readFileSync(path.join(RADICE, rel), 'utf8');
  /* Si prendono solo le importazioni da file NOSTRI (che cominciano con «.»):
     quelle da librerie esterne non si possono verificare così. */
  const righe = [...src.matchAll(/^\s*import\s+([^;]+?)\s+from\s+['"](\.[^'"]+)['"]/gm)];

  for (const [, cosa, dove] of righe) {
    const nomi = [...(cosa.match(/\{([^}]*)\}/)?.[1] || '')
      .split(',').map(x => x.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)];
    const vuoleDifetto = /^\s*\w+\s*(,|$)/.test(cosa);
    const bersaglio = path.resolve(path.dirname(path.join(RADICE, rel)), dove);

    await e.provaAsync(`${rel} importa da ${dove}`, async () => {
      deve(fs.existsSync(bersaglio), 'il file importato non esiste: ' + dove);
      const m = await import(bersaglio);
      const mancanti = nomi.filter(n => !(n in m));
      deve(!mancanti.length,
        `${dove} non esporta: ${mancanti.join(', ')} — il browser fermerebbe tutto il programma`);
      if (vuoleDifetto) deve('default' in m, `${dove} non ha un'esportazione per difetto`);
    });
  }
}

/* Il guscio deve poter essere caricato dal primo all'ultimo modulo senza che
   nessuna catena si spezzi: è esattamente ciò che fa il browser all'avvio. */
await e.provaAsync('la catena del guscio regge fino in fondo', async () => {
  await import(path.join(RADICE, 'nucleo', 'router.js'));
  await import(path.join(RADICE, 'nucleo', 'registro.js'));
  await import(path.join(RADICE, 'nucleo', 'ui.js'));
  await import(path.join(RADICE, 'nucleo', 'dati.js'));
});

process.exit(e.stampa() === 0 ? 0 : 1);
