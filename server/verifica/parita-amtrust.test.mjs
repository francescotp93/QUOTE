// ═══════════════════════════════════════════════════════════════════════════════
//  PARITÀ — AmTrust (RC professionale per categorie)
//
//  AmTrust non è un prodotto: sono 11 prodotti e CINQUE motori di calcolo
//  diversi (generale, pubblico impiego, specializzazione, combinazione, tasso).
//  Ognuno legge campi suoi dal modulo a schermo.
//
//  Questa prova confronta il premio del preventivatore di PRIMA con quello del
//  modulo condiviso di ADESSO, su ogni prodotto e su più combinazioni di
//  massimale e fatturato. Il «prima» si legge aprendo la pagina estratta dalla
//  storia in un browser senza schermo e percorrendo la strada dell'operatore.
//
//  Finché anche un solo motore non è alla pari, AmTrust resta spento
//  nell'elenco dei prodotti: un prodotto esposto a metà è peggio di uno
//  spento, perché IAM lo vede disponibile e prende errori su metà dei casi.
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

const TARIFFA = JSON.parse(fs.readFileSync(path.join(RADICE, 'tariffe/amtrust.json'), 'utf8'));

/* L'ultimo commit in cui il calcolo stava ancora dentro la pagina. */
function commitDiRiferimento() {
  const righe = execSync('git log --format=%H -- index.html', { cwd: RADICE, encoding: 'utf8' }).trim().split('\n');
  for (const c of righe) {
    const n = execSync(`git show ${c}:index.html | grep -c "function amtGenCompute" || true`,
      { cwd: RADICE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
    if (Number(n) > 0) return c;
  }
  throw new Error('nessun commit contiene più amtGenCompute');
}

/* Apre una versione della pagina e raccoglie i premi di ogni prodotto AmTrust
   su piu' combinazioni. Funziona identica sul vecchio e sul nuovo: e' la
   stessa strada dell'operatore. */
async function raccogliPremi(radice) {
  const q = await apriPreventivatore(radice);
  try {
    return await q.pagina.evaluate(async () => {
      await renderRcprof();
      await ensureAmtrust();
      /* Quale dei cinque motori serve questo prodotto: serve per sapere se la
         prova sta davvero guardando tutti, o solo quelli facili da pilotare. */
      const motore = k => k === 'pubblico_impiego' ? 'PI'
        : AMT_SPEC.includes(k) ? 'SPEC'
        : AMT_COMBO.includes(k) ? 'COMBO'
        : AMT_RATE.includes(k) ? 'RATE' : 'GEN';
      const fuori = [];
      for (const p of amtProducts()) {
        await amtOpenProd(p.key);
        /* Ogni famiglia ha il suo modulo: pilotarle tutte con «massimale +
           fatturato» copriva solo due motori su cinque, e gli altri tre
           passavano verdi senza calcolare niente. Qui ognuna riceve i campi
           che le servono davvero. */
        const mo = motore(p.key);
        if (mo === 'PI') {
          /* NON la prima fascia: in tariffa la «Fascia 1» non ha premi
             («Valutazione Direzionale»), e sceglierla faceva rispondere al
             preventivatore «quotazione riservata alla Direzione» — nessun
             premio da confrontare, e il motore risultava scoperto pur essendo
             pilotato correttamente. Si prende l'ultima, che i premi ce li ha. */
          const f = document.getElementById('amt-pi-fascia');
          if (f && f.options && f.options.length > 1) {
            f.value = f.options[f.options.length - 1].value;
            f.dispatchEvent(new Event('change'));
          }
          /* Senza la sezione A spuntata il pubblico impiego non produce nessun
             premio: e' la garanzia base, e il calcolo esce prima. */
          const a1 = document.getElementById('amt-pi-a1');
          if (a1 && !a1.checked) { a1.checked = true; a1.dispatchEvent(new Event('change')); }
        }
        if (mo === 'SPEC') {
          /* La specializzazione si popola solo dopo aver scelto l'area: senza
             quel primo passaggio la tendina resta vuota e non si quota niente. */
          const ar = document.getElementById('amt-area');
          if (ar && ar.options && ar.options.length > 1) { ar.value = ar.options[1].value; ar.dispatchEvent(new Event('change')); if (typeof amtAreaChange === 'function') amtAreaChange(); }
          /* amt-spec NON e' una tendina: e' un campo di testo con un elenco
             (datalist) che si popola dopo la scelta dell'area. Trattarlo come
             una select non lo riempiva mai, e il motore SPEC non calcolava
             niente — passando verde per assenza di casi. */
          const dl = document.getElementById('amt-spec-list');
          const prima = dl && dl.options && dl.options.length ? dl.options[0].value : null;
          const sp = document.getElementById('amt-spec');
          if (sp && prima) { sp.value = prima; sp.dispatchEvent(new Event('input', { bubbles: true })); }
        }
        if (mo === 'COMBO') {
          /* Il massimale del farmacista compare solo DOPO aver scelto la
             copertura: senza questo passaggio la tendina resta vuota e il
             prodotto non produceva nemmeno un caso. */
          const cop = document.getElementById('amt-cop');
          if (cop && cop.options && cop.options.length) {
            cop.value = cop.options[cop.options.length - 1].value;
            if (typeof amtComboCopChange === 'function') amtComboCopChange();
          }
        }
        /* I campi si RILEGGONO a ogni giro: cambiare la fascia (o l'area, o la
           copertura) fa ridisegnare il pannello, e il riferimento preso prima
           punta a un elemento staccato dalla pagina. Scriverci dentro non ha
           nessun effetto e il calcolo non parte — e' il motivo per cui il
           pubblico impiego risultava scoperto. */
        const leggiMass = () => document.getElementById('amt-combo-mass') || document.getElementById('amt-mass');
        const massimali = (() => { const e = leggiMass(); return (e && e.options) ? [...e.options].map(o => o.value).filter(Boolean) : []; })();
        for (const m of (massimali.length ? massimali.slice(0, 3) : [''])) {
          for (const v of [80000, 400000]) {
            const selM = leggiMass();
            const campoV = document.getElementById('amt-var') || document.getElementById('amt-pi-var');
            if (selM && m) selM.value = m;
            if (campoV) campoV.value = String(v);
            amtCompute();
            const t = RCP.amtQuote;
            fuori.push({
              motore: motore(p.key),
              prodotto: p.key, massimale: m, valore: v,
              totale: t ? t.totale : null,
              premioRC: t ? (t.premioRC != null ? t.premioRC : null) : null,
            });
          }
        }
      }
      return fuori;
    });
  } finally { await q.chiudi(); }
}

console.log('\nPARITÀ — AmTrust');
try {
  const dove = fs.mkdtempSync(path.join(os.tmpdir(), 'quoto-prima-amt-'));
  execSync(`git archive ${commitDiRiferimento()} | tar -x -C ${JSON.stringify(dove)}`, { cwd: RADICE, stdio: 'pipe' });

  const prima = await raccogliPremi(dove);
  const dopo = await raccogliPremi(RADICE);

  deve(prima.length > 30, 'troppi pochi casi raccolti: ' + prima.length);
  deve(prima.length === dopo.length, 'numero di casi diverso: ' + prima.length + ' vs ' + dopo.length);

  const diversi = [];
  prima.forEach((a, i) => {
    const b = dopo[i];
    if (JSON.stringify(a) !== JSON.stringify(b)) diversi.push({ prima: a, dopo: b });
  });
  if (diversi.length) {
    throw new Error(diversi.length + ' premi diversi su ' + prima.length + '. Primo: ' + JSON.stringify(diversi[0]).slice(0, 280));
  }
  const conPremio = prima.filter(x => x.totale != null).length;
  deve(conPremio > 10, 'quasi nessun caso ha prodotto un premio (' + conPremio + '): la prova non starebbe guardando niente');
  esiti.push([true, 'stesso premio del preventivatore su ogni prodotto AmTrust',
    prima.length + ' casi, ' + conPremio + ' con premio, tutti identici']);

  /* IL BUCO CHE QUESTA PROVA DEVE URLARE, non nascondere.
     Confrontare vecchio e nuovo non serve a niente sui motori che la prova non
     riesce a far calcolare: se PI, SPEC e COMBO non producono nessun premio,
     un cambiamento al loro codice passerebbe verde. Il 17/08/2026 erano
     scoperti tre motori su cinque — pubblico impiego, specializzazione e
     combinazione vogliono campi che questo pilota non imposta ancora.
     Finche' restano a zero, questa prova e' ROSSA: meglio un allarme che una
     falsa sicurezza. */
  const perMotore = {};
  for (const x of prima) {
    perMotore[x.motore] = perMotore[x.motore] || { casi: 0, premi: 0 };
    perMotore[x.motore].casi++;
    if (x.totale != null) perMotore[x.motore].premi++;
  }
  /* Un motore che non produce nemmeno un CASO e' peggio di uno scoperto: non
     compare nel riepilogo, quindi il buco non si vede. Il farmacista (COMBO)
     era cosi': il suo modulo non ha il campo massimale che il pilota cerca, e
     il ciclo non girava mai. */
  const ATTESI = ['GEN', 'PI', 'SPEC', 'COMBO', 'RATE'];
  const mancanti = ATTESI.filter(m => !perMotore[m]);
  const scoperti = ATTESI.filter(m => perMotore[m] && perMotore[m].premi === 0).concat(mancanti);
  const riepilogo = Object.entries(perMotore).map(([m, d]) => m + ' ' + d.premi + '/' + d.casi).join(' · ');
  if (scoperti.length) {
    throw new Error('motori non confrontati: ' + scoperti.join(', ') +
      (mancanti.length ? ' (di cui MAI raggiunti dal pilota: ' + mancanti.join(', ') + ')' : '') +
      ' — un cambiamento al loro calcolo passerebbe inosservato. (' + riepilogo + ')');
  }
  esiti.push([true, 'tutti e cinque i motori sono davvero confrontati', riepilogo]);
} catch (e) { esiti.push([false, 'tutti e cinque i motori sono davvero confrontati', e.message]); }

let ko = 0;
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n + (m ? ' — ' + m : '') : '  X   ' + n + ' — ' + m); if (!ok) ko++; }
console.log(`\nPARITÀ AMTRUST: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
