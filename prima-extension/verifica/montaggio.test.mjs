// ═══════════════════════════════════════════════════════════════════════════════
//  L'ESTENSIONE È MONTATA COME DEVE
//
//  La lettura del premio è stata messa in un file suo (prezzo.js) perché è
//  l'unico pezzo che si può provare senza il portale. Ma un file provato che
//  nessuno carica non serve a niente: qui si controlla che sia davvero
//  agganciato, e che il calcolo a mano — quello che prendeva la prima opzione
//  di pagamento e la chiamava «annuale» — non torni.
//
//  È una prova sul FILE, non sul comportamento: l'estensione gira in Chrome, in
//  tre mondi diversi, e non si esegue qui. Ma il difetto ERA esattamente «il
//  premio si calcola nel posto sbagliato», quindi è la cosa giusta da guardare.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const leggi = (f) => fs.readFileSync(path.join(QUI, f), 'utf8');
const manifest = JSON.parse(leggi('manifest.json'));
const hook = leggi('page-hook.js');

const esiti = [];
const prova = (nome, fn) => { try { fn(); esiti.push([true, nome, '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('prezzo.js viene caricato, e PRIMA di chi lo usa', () => {
  /* Nel mondo principale i file si eseguono nell'ordine dichiarato: se
     page-hook partisse per primo, window.__QP_PREZZO non esisterebbe ancora. */
  const mondo = (manifest.content_scripts || []).find(c => (c.js || []).includes('page-hook.js'));
  deve(mondo, 'page-hook.js non e\' piu\' dichiarato nel manifest');
  deve((mondo.js || []).includes('prezzo.js'), 'prezzo.js non e\' caricato: il premio non si potrebbe leggere');
  deve(mondo.js.indexOf('prezzo.js') < mondo.js.indexOf('page-hook.js'),
    'prezzo.js e\' caricato DOPO page-hook: quando serve non c\'e\' ancora');
  deve(mondo.world === 'MAIN', 'il hook non gira piu\' nel mondo della pagina: non vedrebbe la sessione');
});

prova('tutti i file dichiarati esistono davvero', () => {
  const dichiarati = new Set();
  for (const c of manifest.content_scripts || []) for (const f of c.js || []) dichiarati.add(f);
  if (manifest.background && manifest.background.service_worker) dichiarati.add(manifest.background.service_worker);
  if (manifest.action && manifest.action.default_popup) dichiarati.add(manifest.action.default_popup);
  for (const f of dichiarati) {
    deve(fs.existsSync(path.join(QUI, f)), 'il manifest dichiara ' + f + ', che non esiste: Chrome rifiuta l\'estensione');
  }
});

prova('il premio lo legge prezzo.js, non un calcolo a mano', () => {
  deve(/__QP_PREZZO/.test(hook), 'page-hook non usa piu\' la lettura provata del premio');
  deve(/leggiPremio\(/.test(hook), 'non chiama piu\' leggiPremio');
});

prova('il calcolo vecchio non è tornato', () => {
  /* La firma del difetto: prendere installments[0] e sommarci dentro. */
  deve(!/installments\[0\]\.guarantees/.test(hook),
    'e\' tornato a prendere la prima opzione di pagamento: se e\' la mensile, mostra una rata come premio dell\'anno');
  const sommeAMano = (hook.match(/tot \+= /g) || []).length;
  deve(sommeAMano === 0, 'c\'e\' di nuovo una somma dei premi dentro page-hook (' + sommeAMano + '): il conto deve stare in un posto solo');
});

prova('la query chiede anche COME si paga', () => {
  /* Senza installmentConfiguration non si sa a quale frazionamento
     appartengono gli importi, e un numero di cui non si sa a cosa si
     riferisce non e' un premio. */
  deve(/installmentConfiguration/.test(hook),
    'la query non chiede il frazionamento: gli importi tornerebbero senza sapere a cosa si riferiscono');
  deve(/labels|count/.test(hook), 'non chiede ne\' il numero di rate ne\' l\'etichetta');
});

prova('il frazionamento scelto in QUOTO arriva fino alla lettura', () => {
  /* Prima veniva mandato dall'estensione e poi ignorato del tutto. */
  deve(/leggiPremio\([^)]*D\.frazionamento/.test(hook.replace(/\s+/g, ' ')),
    'il frazionamento richiesto non viene passato alla lettura: l\'operatore sceglie e non cambia niente');
});

prova('se prezzo.js manca, lo dice invece di consegnare un numero', () => {
  deve(/prezzo\.js non caricato/.test(hook),
    'senza prezzo.js proseguirebbe in silenzio: meglio fermarsi che consegnare un premio da chissa\' dove');
});

prova('l\'estensione parla solo con Prima e con noi', () => {
  const host = manifest.host_permissions || [];
  deve(host.length > 0, 'nessun host dichiarato');
  for (const h of host) {
    deve(/prima\.it/.test(h), 'l\'estensione chiede accesso a ' + h + ', che non c\'entra con Prima');
  }
  for (const c of manifest.content_scripts || []) {
    for (const m of c.matches || []) {
      deve(/prima\.it|withusassicurazioni\.it/.test(m), 'gira anche su ' + m + ', che non e\' ne\' Prima ne\' nostro');
    }
  }
});

let ko = 0;
console.log('\nESTENSIONE PRIMA — montaggio');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nMONTAGGIO ESTENSIONE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
