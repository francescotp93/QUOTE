#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Analizzatore di catture hdiservice/portale per le tariffe AmTrust.
// Uso:  node analizza-cattura.mjs <cattura.json> [percorso amtrust.json]
//
// La cattura è l'array prodotto dal bookmarklet/sniffer: ogni elemento ha
// { u|url, m|method, resp|body, status, mime }. Lo script:
//  1. elenca gli endpoint (metodo · status · dim · path);
//  2. per ogni preventivo (/steps/N/_varianti) estrae: nome prodotto, i
//     PARAMETRI di input (dalla query dell'URL), i frazionamenti offerti e i
//     relativi premi (rata);
//  3. deduce il PREMIO ANNUO (= card ANNUALE, o rata × n) e stima il PREMIO
//     MINIMO di polizza quando più preventivi dello stesso prodotto a fatturato
//     diverso restituiscono lo stesso importo (indice di "floor");
//  4. se passato amtrust.json, confronta il premio reale con quello che il
//     nostro codice calcolerebbe (solo prodotti a tasso, per un colpo d'occhio).
// Non modifica nulla: stampa un report. È il punto di partenza per calibrare.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';

const capPath = process.argv[2];
const tarPath = process.argv[3]; // opzionale
if (!capPath) { console.error('Uso: node analizza-cattura.mjs <cattura.json> [amtrust.json]'); process.exit(1); }

const calls = JSON.parse(fs.readFileSync(capPath, 'utf8'));
const arr = Array.isArray(calls) ? calls : (calls.calls || calls.captured || calls.entries || []);
const U = c => c.u || c.url || (c.request && c.request.url) || '';
const M = c => c.m || c.method || (c.request && c.request.method) || '';
const R = c => c.resp || c.body || (c.response && c.response.body) || '';
const path = c => U(c).replace(/https?:\/\/[^/]+/, '').replace(/\?.*/, '');
const clean = s => String(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&euro;/g, '€').replace(/\s+/g, ' ').trim();
const num = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));

console.log(`\n=== ${arr.length} chiamate ===`);
arr.forEach((c, i) => {
  const p = path(c); if (/\.(css|js|woff|png|jpg|svg)$/.test(p) || /chrome-extension/.test(U(c))) return;
  console.log(String(i).padStart(3), (M(c) || '').padEnd(4), String(c.status || '').padEnd(3), String(R(c).length).padStart(7), p.slice(0, 70));
});

// ── Preventivi: /steps/N/_varianti ──────────────────────────────────────────
const quotes = [];
arr.forEach((c, i) => {
  if (!/_varianti/.test(path(c))) return;
  const t = clean(R(c)); if (!t) return;
  const nomeM = t.match(/AmTrust ([^()]+?) \((ANNUALE|SEMESTRALE|QUADRIMESTRALE|MENSILE)\)/i);
  const nome = nomeM ? nomeM[1].trim() : null;
  if (!nome) return;
  const fraz = [...new Set([...t.matchAll(/\((ANNUALE|SEMESTRALE|QUADRIMESTRALE|MENSILE)\)/gi)].map(m => m[1].toUpperCase()))];
  const premi = [...t.matchAll(/([\d.]+,\d{2})\s*€\s*Importo Totale/gi)].map(m => num(m[1]));
  const annuo = premi.length ? Math.max(...premi) : null; // l'ANNUALE è il più alto
  // parametri di input dalla query dell'URL
  const q = {}; const qs = U(c).split('?')[1] || '';
  qs.split('&').forEach(kv => { const [k, v] = kv.split('='); if (k && v) q[decodeURIComponent(k)] = decodeURIComponent(v); });
  const inputs = ['fatturato', 'massimale', 'anni-retroattivita', 'franchigia-facoltativa', 'num-convenzione']
    .filter(k => q[k] != null && q[k] !== '').map(k => `${k}=${q[k]}`);
  quotes.push({ i, nome, fraz, premi, annuo, fatturato: num(q.fatturato || ''), massimale: q.massimale, inputs });
});

console.log(`\n=== PREVENTIVI AmTrust trovati: ${quotes.length} ===`);
quotes.forEach(x => {
  console.log(`\n• [${x.i}] ${x.nome}`);
  console.log(`  input: ${x.inputs.join(' · ') || '(n/d)'}`);
  console.log(`  frazionamenti: ${x.fraz.join(' / ') || '(nessuno)'}`);
  console.log(`  premi (rate): ${x.premi.map(p => p.toLocaleString('it-IT')).join(' | ') || '(nessuno)'}  → premio ANNUO ≈ ${x.annuo != null ? x.annuo.toLocaleString('it-IT') : 'n/d'}`);
});

// ── Rilevatore di PREMIO MINIMO: stesso prodotto, fatturati diversi, stesso annuo ──
const byProd = {};
quotes.forEach(x => { if (x.annuo == null) return; (byProd[x.nome] = byProd[x.nome] || []).push(x); });
console.log(`\n=== STIMA PREMIO MINIMO (floor) ===`);
Object.entries(byProd).forEach(([nome, xs]) => {
  if (xs.length < 2) { console.log(`• ${nome}: un solo dato (fatturato ${xs[0].fatturato || 'n/d'} → ${xs[0].annuo}). Servono più preventivi a fatturato crescente per isolare il minimo.`); return; }
  const flat = xs.filter(a => xs.some(b => b !== a && b.annuo === a.annuo && b.fatturato !== a.fatturato));
  if (flat.length) console.log(`• ${nome}: premio COSTANTE ${flat[0].annuo} su fatturati diversi (${flat.map(f => f.fatturato).join(', ')}) → PREMIO MINIMO ≈ ${flat[0].annuo}`);
  else console.log(`• ${nome}: premio variabile col fatturato → nessun floor evidente nel range catturato`);
});

// ── Frazionamenti per prodotto (regola per prodotto) ─────────────────────────
console.log(`\n=== FRAZIONAMENTI AMMESSI per prodotto ===`);
Object.entries(byProd).forEach(([nome, xs]) => console.log(`• ${nome}: ${[...new Set(xs.flatMap(x => x.fraz))].join(' / ')}`));

// ── Confronto opzionale col nostro amtrust.json (prodotti a tasso) ───────────
if (tarPath && fs.existsSync(tarPath)) {
  const tar = JSON.parse(fs.readFileSync(tarPath, 'utf8')).prodotti || {};
  console.log(`\n=== CONFRONTO col nostro amtrust.json (prodotti a tasso) ===`);
  const rateKeys = ['poliambulatori', 'studi_dentistici', 'residenze_sanitarie', 'farmacie'];
  rateKeys.forEach(k => {
    const p = tar[k]; if (!p || !p.premi) return;
    console.log(`• ${k}: premio_minimo_lordo attuale = ${p.premio_minimo_lordo == null ? 'ASSENTE' : p.premio_minimo_lordo} · scaglioni tasso: ${(p.premi.scaglioni || p.premi.righe || []).length || 'n/d'}`);
  });
  console.log('  (se un preventivo reale a fatturato basso mostra un floor > del nostro calcolo → valorizzare premio_minimo_lordo)');
}
console.log('');
