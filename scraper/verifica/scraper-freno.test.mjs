// ═══════════════════════════════════════════════════════════════════════════════
//  IL FRENO È INNESTATO DAVVERO
//
//  Le prove di freno.test.mjs dicono che il freno funziona. Queste dicono che
//  gli scraper lo usano — che è un'altra cosa, e l'unica che conta in
//  produzione. Un freno perfetto collegato a niente non ferma niente.
//
//  Gli scraper non si possono avviare qui (servono Playwright, un display
//  virtuale e il portale di una compagnia), quindi si leggono i sorgenti. Il
//  punto sorvegliato è uno solo: esiste UNA sola porta da cui passa un
//  tentativo di accesso, e quella porta ha il freno.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const qui = path.dirname(fileURLToPath(import.meta.url));
const COMPAGNIE = ['allianz', 'italiana'];

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/** Ritaglia il corpo di una funzione contando le graffe. */
function corpoDi(src, nome) {
  const i = src.indexOf('async function ' + nome + '(');
  if (i < 0) return null;
  let liv = 0, j = src.indexOf('{', i);
  const inizio = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') liv++;
    else if (src[j] === '}') { liv--; if (liv === 0) return src.slice(inizio, j + 1); }
  }
  return null;
}

for (const c of COMPAGNIE) {
  const src = fs.readFileSync(path.join(qui, '..', c, 'quote-service.mjs'), 'utf8');

  prova(c + ': il freno è importato e istanziato', () => {
    deve(/import \{ creaFreno \} from '\.\.\/comune\/freno\.mjs'/.test(src), 'manca l\'import del freno');
    deve(/const FRENO = creaFreno\(/.test(src), 'il freno non viene creato');
  });

  prova(c + ': esiste una sola porta per i tentativi di accesso', () => {
    /* La prova che vale davvero. Se qualcuno domani rimette un autoLogin()
       diretto nel keep-alive, il ciclo infinito torna e qui diventa rosso. */
    const chiamate = [...src.matchAll(/await autoLogin\(\)/g)].length;
    deve(chiamate === 1, 'autoLogin() è chiamata ' + chiamate + ' volte: il freno è aggirabile');
    const tenta = corpoDi(src, 'tentaLogin');
    deve(tenta, 'manca tentaLogin');
    deve(/await autoLogin\(\)/.test(tenta), 'l\'unica chiamata ad autoLogin non è dentro tentaLogin');
  });

  prova(c + ': tentaLogin chiede il permesso e registra l\'esito', () => {
    const t = corpoDi(src, 'tentaLogin');
    deve(/FRENO\.puoTentare\(/.test(t), 'tenta l\'accesso senza chiedere al freno');
    deve(/return false;/.test(t), 'quando il freno è tirato non si ferma');
    deve(/FRENO\.riuscito\(\)/.test(t), 'non azzera il freno dopo un accesso riuscito');
    deve(/FRENO\.fallito\(/.test(t), 'non conta i fallimenti: non si fermerà mai');
  });

  prova(c + ': il keep-alive non gira a vuoto a freno tirato', () => {
    const k = corpoDi(src, 'keepAlive');
    deve(k, 'manca keepAlive');
    const primeRighe = k.split('\n').slice(0, 8).join('\n');
    deve(/FRENO\.stato\(\)\.bloccato/.test(primeRighe) && /return;/.test(primeRighe),
      'il keep-alive parte comunque: continuerebbe a bussare al portale');
  });

  prova(c + ': lo stato del freno esce da /status', () => {
    deve(/freno: FRENO\.stato\(\)/.test(src),
      '/status non dice se il freno è tirato: nel Pannello Fonti non si saprebbe perché è fermo');
  });

  prova(c + ': solo una persona può togliere il freno', () => {
    /* /login è il gesto umano: «ho messo un codice nuovo, riprova». Il freno
       non deve togliersi da nessun'altra parte, altrimenti si sblocca da solo. */
    const sblocchi = [...src.matchAll(/FRENO\.sblocca\(\)/g)].length;
    deve(sblocchi === 1, 'sblocca() compare ' + sblocchi + ' volte: dovrebbe essere solo /login');
    const i = src.indexOf('FRENO.sblocca()');
    const attorno = src.slice(Math.max(0, i - 400), i);
    deve(/pathname\.startsWith\('\/login'\)/.test(attorno),
      'lo sblocco non è agganciato a /login ma a qualcos\'altro');
  });
}

prova('il modulo del freno non porta dipendenze sugli scraper', () => {
  /* Ogni scraper fa npm install per conto suo: se il freno importasse
     qualcosa, andrebbe installato tre volte e il deploy si romperebbe. */
  const src = fs.readFileSync(path.join(qui, '..', 'comune', 'freno.mjs'), 'utf8');
  const imports = [...src.matchAll(/^\s*import\s/gm)].length;
  deve(imports === 0, 'il freno ha ' + imports + ' import: deve restare autonomo');
});

let ko = 0;
console.log('\nSCRAPER — il freno è innestato davvero');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nSCRAPER: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
