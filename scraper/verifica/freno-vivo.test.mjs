// ═══════════════════════════════════════════════════════════════════════════════
//  IL FRENO È INNESTATO NEL CODICE CHE GIRA DAVVERO
//
//  Il 02/08/2026 la macchina ha risposto: /opt/withus-backend sta sul ramo
//  claude/vibrant-tesla-o0glfd, commit fc370d7, e autopull insegue quel ramo
//  (deploy/autopull.sh:11 → BR=claude/vibrant-tesla-o0glfd). Il codice
//  fortificato la notte prima stava su un altro ramo e su una versione degli
//  scraper molto più corta: era lavoro giusto sul file sbagliato.
//
//  Qui si sorveglia il file giusto. Dai log veri del server, alle 06:35:
//
//      [keep-alive] sessione caduta → ri-login silenzioso...
//      autoLogin step1: utente= input[type="text"]
//      autoLogin: niente password in pagina → avanzo (login a due schermate)
//      autoLogin: campo password NON comparso (url=https://mfa.allianz.it/...)
//      [keep-alive] ri-login fallito (serve approvazione Duo)
//
//  Ogni tre minuti. Ogni giro arriva su mfa.allianz.it e fa scattare la
//  richiesta di conferma: sono le mail che Francesco riceveva in continuazione.
//
//  Il freno sta DENTRO autoLogin, non ai richiami: allianz ne ha 3, hdi 4
//  (watchdog compreso), italiana 2. Agganciarlo ai richiami avrebbe lasciato
//  aperta la porta che qualcuno dimentica.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const qui = path.dirname(fileURLToPath(import.meta.url));
/* Solo questi tre hanno un keep-alive che rifà il login: sono i soli che
   possono generare notifiche a raffica. Gli altri sette non lo hanno. */
const CON_CICLO = ['allianz', 'hdi', 'italiana'];
const TUTTI = ['allianz', 'assieasy', 'axa', 'groupama', 'hdi', 'italiana', 'kube', 'moto', 'prima', 'quotiamo'];

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };
const leggi = (c) => fs.readFileSync(path.join(qui, '..', c, 'quote-service.mjs'), 'utf8');

function corpoDi(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) return null;
  let liv = 0, j = src.indexOf('{', i);
  const inizio = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') liv++;
    else if (src[j] === '}') { liv--; if (liv === 0) return src.slice(inizio, j + 1); }
  }
  return null;
}

// ── 1. Chi ha il ciclo, ha il freno ──────────────────────────────────────────
for (const c of CON_CICLO) {
  const src = leggi(c);

  prova(c + ': il freno c\'è ed è suo', () => {
    deve(/import \{ creaFreno \} from '\.\.\/comune\/freno\.mjs'/.test(src), 'manca l\'import del freno');
    deve(/const FRENO = creaFreno\(/.test(src), 'il freno non viene creato');
    return 'freno proprio';
  });

  prova(c + ': ogni tentativo di accesso passa dal freno', () => {
    /* La prova che conta. autoLogin() tiene il nome di prima, quindi tutti i
       richiami esistenti sono coperti; quello vero è diventato
       autoLoginGrezzo e deve essere chiamato SOLO dal frenato. */
    const grezzo = (src.match(/async function autoLoginGrezzo\(\)/g) || []).length;
    deve(grezzo === 1, 'autoLoginGrezzo dichiarata ' + grezzo + ' volte');
    const chiamate = (src.match(/autoLoginGrezzo\(\)/g) || []).length;
    deve(chiamate === 2, 'autoLoginGrezzo compare ' + chiamate + ' volte (attese 2: dichiarazione + unica chiamata)');
    const frenato = corpoDi(src, 'async function autoLogin(perche)');
    deve(frenato, 'manca autoLogin frenato');
    deve(/autoLoginGrezzo\(\)/.test(frenato), 'la sola chiamata al login vero non è dentro il frenato');
    return '1 sola porta';
  });

  prova(c + ': il frenato chiede il permesso e registra l\'esito', () => {
    const f = corpoDi(src, 'async function autoLogin(perche)');
    deve(/FRENO\.puoTentare\(/.test(f), 'tenta senza chiedere al freno');
    deve(/return false;/.test(f), 'a freno tirato non si ferma');
    deve(/FRENO\.riuscito\(\)/.test(f), 'non azzera il freno dopo un accesso riuscito');
    deve(/FRENO\.fallito\(/.test(f), 'non conta i fallimenti: non si fermerà mai');
  });

  prova(c + ': anche il keep-alive passa di lì', () => {
    /* Il keep-alive chiama autoLogin() per nome: siccome quel nome ora è il
       frenato, è coperto senza toccare il suo codice. Qui si controlla che non
       sia stato scavalcato con una chiamata diretta al grezzo. */
    const k = corpoDi(src, 'async function keepAlive()');
    deve(k, 'manca keepAlive');
    deve(!/autoLoginGrezzo/.test(k), 'il keep-alive scavalca il freno chiamando il login grezzo');
    deve(/autoLogin\(/.test(k), 'il keep-alive non tenta più il login: comportamento cambiato, da guardare');
  });

  prova(c + ': lo stato del freno esce da /status', () => {
    deve(/freno: FRENO\.stato\(\)/.test(src),
      '/status non dice se il freno è tirato: nel Pannello Fonti non si saprebbe perché è fermo');
  });

  prova(c + ': esiste una via d\'uscita, e la usa una persona', () => {
    /* Un freno senza sblocco è un guasto permanente. allianz e italiana lo
       tolgono da /login; hdi non ha /login e ha una /sblocca dedicata. */
    const n = (src.match(/FRENO\.sblocca\(\)/g) || []).length;
    deve(n === 1, 'sblocca() compare ' + n + ' volte: dovrebbe essere una sola, dal gesto umano');
    const i = src.indexOf('FRENO.sblocca()');
    const attorno = src.slice(Math.max(0, i - 500), i);
    deve(/'\/login'|'\/sblocca'/.test(attorno), 'lo sblocco non è agganciato al gesto umano');
  });
}

// ── 2. Gli altri sette non hanno il ciclo (e quindi non servono) ─────────────
prova('solo tre scraper hanno un keep-alive che rifà il login', () => {
  /* Se un domani un altro scraper prendesse lo stesso ciclo, andrebbe frenato
     anche lui: questa prova diventa rossa e lo dice. */
  const conCiclo = TUTTI.filter(c => /setInterval\(keepAlive/.test(leggi(c)));
  deve(conCiclo.join(',') === CON_CICLO.join(','),
    'gli scraper con il ciclo sono cambiati: ' + conCiclo.join(', ') + ' — vanno frenati anche i nuovi');
  return conCiclo.length + ' su ' + TUTTI.length;
});

prova('il modulo del freno resta senza dipendenze', () => {
  /* Ogni scraper fa npm install per conto suo: un import in più qui
     romperebbe il deploy di dieci servizi. */
  const src = fs.readFileSync(path.join(qui, '..', 'comune', 'freno.mjs'), 'utf8');
  const n = (src.match(/^\s*import\s/gm) || []).length;
  deve(n === 0, 'il freno ha ' + n + ' import: deve restare autonomo');
});

let ko = 0;
console.log('\nFRENO NEL CODICE VIVO — ramo del deploy');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nFRENO VIVO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
