// ═══════════════════════════════════════════════════════════════════════════════
//  PARITÀ — i prodotti a tariffa semplice
//
//  Questi prodotti sono più puliti di AmTrust: il loro calcolo non legge il
//  modulo a schermo, legge un oggetto di stato (TL_DATA, RCRD_DATA, VG_DATA,
//  PET_DATA, SAL_DATA). Spostarli vuol dire farsi passare quello stato come
//  argomento invece di leggerlo da una variabile globale.
//
//  La prova confronta il premio del preventivatore di PRIMA — estratto dalla
//  storia e aperto in un browser senza schermo — con quello del modulo
//  condiviso di ADESSO, su molte combinazioni di ogni prodotto.
//
//  Aggiungere un prodotto qui vuol dire aggiungere una voce a PRODOTTI:
//  «come si prepara lo stato» e «come si chiede il premio ai due lati».
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { apriPreventivatore } from './banco-premi.mjs';

const RADICE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const richiedi = createRequire(import.meta.url);
const esiti = [];
const deve = (c, m) => { if (!c) throw new Error(m); };

/* Ogni prodotto dice: quali stati provare, come si chiama il calcolo nella
   pagina vecchia, e come si chiama il modulo nuovo. */
const PRODOTTI = {
  tutelalegale: {
    modulo: 'tariffe/motore/tutelalegale.js',
    funzioneNuova: (m, stato) => m.calcolaTutelaLegale(stato),
    /* Nella pagina il calcolo legge TL_DATA: lo si riempie e lo si chiama. */
    nellaPagina: 'stati => stati.map(s => { TL_DATA = s; return tlPremio(); })',
    riferimento: 'function tlPremio',
    stati: (() => {
      const out = [];
      for (const mass of [10000, 20000, 30000, 40000, 50000]) {
        for (const inte of ['PF', 'PG']) {
          for (const targa of ['veicolo', 'moto']) {
            for (const q of ['min', 'max']) {
              for (const sc of [false, true]) {
                out.push({ prodotto: 'mydrive', massimale: mass, intestatario: inte, mdTarga: targa, mdQuintali: q, sconto15: sc });
              }
            }
          }
        }
      }
      for (const f of ['crescente', 'famiglia']) for (const sc of [false, true]) for (const pe of [false, true]) {
        out.push({ prodotto: 'myway', mwFormula: f, sconto15: sc, mwPerdite: pe });
      }
      for (const f of ['STANDARD', 'PLUS']) out.push({ prodotto: 'utenze', utFormula: f });
      out.push({ prodotto: 'inesistente' });
      return out;
    })(),
  },
  animali: {
    modulo: 'tariffe/motore/animali.js',
    funzioneNuova: (m, stato) => m.calcolaAnimali(stato),
    nellaPagina: 'stati => stati.map(s => { PET_DATA = s; return petTotal(); })',
    riferimento: 'function petTotal',
    stati: (() => {
      const out = [];
      for (const tipo of ['cane', 'gatto', 'coniglio']) {
        for (const pack of ['silver', 'gold', 'platinum', 'diamond', 'inesistente']) {
          for (const rc of [false, true]) out.push({ tipo: tipo, pacchetto: pack, rc: rc });
        }
      }
      return out;
    })(),
  },
  rcrischidiversi: {
    modulo: 'tariffe/motore/rcrischidiversi.js',
    funzioneNuova: (m, stato) => m.calcolaRcRischiDiversi(stato),
    nellaPagina: 'stati => stati.map(s => { RCRD_DATA = s; return rcrdPremio(); })',
    riferimento: 'function rcrdPremio',
    stati: (() => {
      const out = [];
      const m = richiedi(path.join(RADICE, 'tariffe/motore/rcrischidiversi.js'));
      for (const a of m.RCRD_ATTIVITA.map(x => x.key)) {
        for (const mass of m.RCRD_MASSIMALI) {
          for (const fatt of [50000, 500000]) {
            for (const rco of [false, true]) {
              out.push({ attivita: a, massimale: mass, fatturato: fatt, rco: rco, estensioni: {} });
              out.push({ attivita: a, massimale: mass, fatturato: fatt, rco: rco,
                         estensioni: { animali: true, subappalto: true } });
            }
          }
        }
      }
      return out;
    })(),
  },
  viaggio: {
    modulo: 'tariffe/motore/viaggio.js',
    funzioneNuova: (m, stato) => m.calcolaViaggio(stato),
    nellaPagina: 'stati => stati.map(s => { VG_DATA = s; return vgTotale(); })',
    riferimento: 'function vgComboPremio',
    stati: (() => {
      const out = [];
      const m = richiedi(path.join(RADICE, 'tariffe/motore/viaggio.js'));
      for (const dest of m.VG_AREE.map(a => a.key)) {
        for (const liv of ['Small', 'Medium', 'Large']) {
          /* Durate scelte per toccare ogni fascia (7/14/24/31/45/60) e la
             coda oltre i 60 giorni, che si calcola a settimane. */
          for (const gg of [3, 10, 20, 28, 40, 55, 75]) {
            const p = new Date('2026-09-01');
            const r = new Date(p.getTime() + (gg - 1) * 86400000);
            for (const n of [1, 3]) {
              out.push({ dest: dest, livello: liv, nAssicurati: n,
                         dataPartenza: p.toISOString().slice(0, 10),
                         dataRientro: r.toISOString().slice(0, 10) });
            }
          }
        }
      }
      out.push({ dest: 'europa', livello: 'Medium', nAssicurati: 1 });
      return out;
    })(),
  },
  salute: {
    modulo: 'tariffe/motore/salute.js',
    funzioneNuova: (m, stato) => m.calcolaSalute(stato),
    nellaPagina: 'stati => stati.map(s => { SAL_DATA = s; return salPremio(); })',
    /* Marcatore che dopo lo spostamento NON c'e' piu' nella pagina: se se ne
       usasse uno rimasto («function salPremio» e' ancora li', come ponte) il
       confronto pescherebbe la pagina di adesso e direbbe sempre di si'. */
    riferimento: 'const SAL_PRODOTTI',
    stati: (() => {
      const out = [];
      const m = richiedi(path.join(RADICE, 'tariffe/motore/salute.js'));
      for (const [tipo, p] of Object.entries(m.SAL_PRODOTTI)) {
        for (const liv of p.livelli.map(l => l.key)) {
          for (const comp of ['single', 'nucleo']) {
            for (const up of [false, true]) {
              for (const fraz of ['annuale', 'mensile']) {
                out.push({ tipo: tipo, livello: liv, comp: comp, upgrade: up, fraz: fraz });
              }
            }
          }
        }
        /* Livello inesistente: la tariffa deve ripiegare sul primo. */
        out.push({ tipo: tipo, livello: 'nessuno', comp: 'single', fraz: 'annuale' });
      }
      for (const k of m.SAL_LTC.map(x => x.key).concat(['nessuna'])) {
        out.push({ tipo: 'ltc', ltc: k, comp: 'single', fraz: 'annuale' });
      }
      return out;
    })(),
  },
};

function commitDiRiferimento(marcatore) {
  const righe = execSync('git log --format=%H -- index.html', { cwd: RADICE, encoding: 'utf8' }).trim().split('\n');
  for (const c of righe) {
    const n = execSync(`git show ${c}:index.html | grep -c "${marcatore}" || true`,
      { cwd: RADICE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
    if (Number(n) > 0) return c;
  }
  throw new Error('nessun commit contiene più «' + marcatore + '»');
}

console.log('\nPARITÀ — prodotti a tariffa');
for (const [nome, p] of Object.entries(PRODOTTI)) {
  try {
    const dove = fs.mkdtempSync(path.join(os.tmpdir(), 'quoto-prima-' + nome + '-'));
    execSync(`git archive ${commitDiRiferimento(p.riferimento)} | tar -x -C ${JSON.stringify(dove)}`, { cwd: RADICE, stdio: 'pipe' });
    const q = await apriPreventivatore(dove);
    let prima;
    try { prima = await q.pagina.evaluate('(' + p.nellaPagina + ')(' + JSON.stringify(p.stati) + ')'); }
    finally { await q.chiudi(); }

    const m = richiedi(path.join(RADICE, p.modulo));
    const dopo = p.stati.map(s => p.funzioneNuova(m, s));

    const diversi = [];
    prima.forEach((a, i) => { if (JSON.stringify(a) !== JSON.stringify(dopo[i])) diversi.push({ stato: p.stati[i], prima: a, dopo: dopo[i] }); });
    if (diversi.length) {
      throw new Error(diversi.length + ' premi diversi su ' + prima.length + '. Primo: ' + JSON.stringify(diversi[0]).slice(0, 240));
    }
    const conPremio = prima.filter(x => x != null && x !== 0).length;
    deve(conPremio > 5, 'quasi nessuno stato ha prodotto un premio (' + conPremio + '): la prova non guarderebbe niente');
    esiti.push([true, nome, prima.length + ' stati, ' + conPremio + ' con premio, tutti identici']);
  } catch (e) { esiti.push([false, nome, e.message]); }
}

let ko = 0;
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n + ' — ' + m : '  X   ' + n + ' — ' + m); if (!ok) ko++; }
console.log(`\nPARITÀ TARIFFE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
