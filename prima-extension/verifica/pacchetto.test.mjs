// ═══════════════════════════════════════════════════════════════════════════════
//  IL PACCHETTO DA SCARICARE È QUELLO DI ADESSO
//
//  quoto-prima.zip sta nel repo perché GitHub Pages lo pubblica: dal pannello
//  Fonti si scarica con un clic. Comodo, ma un file compilato dentro un repo ha
//  un difetto noto — si dimentica. Si corregge un sorgente, si spinge, e chi
//  scarica continua a installare la versione di tre settimane fa: il difetto è
//  «corretto» ovunque tranne che nel browser di chi lavora.
//
//  Qui il pacchetto si apre e si confronta byte per byte con i file veri. Se
//  qualcuno tocca un sorgente e non rifà il pacchetto, questa prova diventa
//  rossa e dice come rimediare.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const QUI = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ZIP = path.join(QUI, 'quoto-prima.zip');

const esiti = [];
const prova = (nome, fn) => { try { fn(); esiti.push([true, nome, '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const RIFAI = 'Rifallo con:  bash prima-extension/impacchetta.sh';

prova('il pacchetto esiste', () => {
  deve(fs.existsSync(ZIP), 'quoto-prima.zip non c\'e\': dal pannello Fonti si scaricherebbe un 404. ' + RIFAI);
});

prova('contiene tutti i file che il manifest dichiara', () => {
  const dentro = new Set(execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' }).trim().split('\n'));
  const manifest = JSON.parse(fs.readFileSync(path.join(QUI, 'manifest.json'), 'utf8'));
  const servono = new Set(['manifest.json']);
  for (const c of manifest.content_scripts || []) for (const f of c.js || []) servono.add(f);
  if (manifest.background && manifest.background.service_worker) servono.add(manifest.background.service_worker);
  if (manifest.action && manifest.action.default_popup) servono.add(manifest.action.default_popup);
  for (const f of servono) {
    deve(dentro.has(f), 'il pacchetto non contiene ' + f + ': Chrome rifiuterebbe l\'estensione. ' + RIFAI);
  }
});

prova('quello che c\'è dentro è identico ai sorgenti di adesso', () => {
  const dentro = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' }).trim().split('\n');
  for (const f of dentro) {
    const disco = path.join(QUI, f);
    deve(fs.existsSync(disco), 'il pacchetto contiene ' + f + ', che nel repo non esiste piu\'. ' + RIFAI);
    const a = execFileSync('unzip', ['-p', ZIP, f]);
    const b = fs.readFileSync(disco);
    deve(a.equals(b), f + ' nel pacchetto e\' diverso dal sorgente: chi lo installa prende la versione vecchia. ' + RIFAI);
  }
});

prova('le prove non finiscono dentro al pacchetto', () => {
  /* Non fanno danni, ma sono peso inutile e confondono chi apre lo zip. */
  const dentro = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' });
  deve(!/verifica\//.test(dentro), 'nel pacchetto ci sono le prove. ' + RIFAI);
  deve(!/package\.json/.test(dentro), 'nel pacchetto c\'e\' package.json, che serve solo a Node. ' + RIFAI);
});

prova('il pulsante «Scarica» del pannello Fonti punta a un file che esiste', () => {
  /* Il link e' relativo alla radice del sito, che e' la radice del repo: se il
     pacchetto si sposta, il pulsante diventa un 404 e nessuno se ne accorge
     finche' non ci clicca sopra un collaboratore. */
  const pagina = fs.readFileSync(path.join(path.dirname(QUI), 'index.html'), 'utf8');
  const m = pagina.match(/href="([^"]*quoto-prima\.zip)"/);
  deve(m, 'nel pannello Fonti non c\'e\' piu\' il link per scaricare l\'estensione');
  deve(fs.existsSync(path.join(path.dirname(QUI), m[1])), 'il pulsante punta a ' + m[1] + ', che non esiste: e\' un 404');
});

let ko = 0;
console.log('\nPACCHETTO DA INSTALLARE');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nPACCHETTO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
