/* ═══════════════════════════════════════════════════════════════════════════
   BANCO DI PROVA — gli attrezzi comuni alle verifiche
   ───────────────────────────────────────────────────────────────────────────
   Qui il lavoro è molto più semplice che in un file unico da 15.000 righe:
   i moduli sono moduli veri, quindi si importano e si chiamano. È metà del
   motivo per cui il sistema è stato spezzato.
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const MODULI = path.join(RADICE, 'moduli');

export function elencoModuli() {
  if (!fs.existsSync(MODULI)) return [];
  return fs.readdirSync(MODULI).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, '')).sort();
}

export function sorgente(chiave) {
  return fs.readFileSync(path.join(MODULI, chiave + '.js'), 'utf8');
}

/* Le righe di commento non contano quando si cerca del CODICE vietato: è già
   costato una prova rossa per la parola giusta scritta in una spiegazione. */
export function soloCodice(testo) {
  return testo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(r => !/^\s*\/\//.test(r)).join('\n');
}

/* Emoji vere e proprie. I trattini lunghi, i puntini e le cornici ═ non lo sono:
   servono a rendere leggibile il codice e restano ammessi. */
export const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

export function esiti(titolo) {
  const righe = [];
  const agg = (nome, e) => righe.push(e ? { nome, ok: false, perche: e.message } : { nome, ok: true });
  return {
    prova(nome, fn) { try { fn(); agg(nome); } catch (e) { agg(nome, e); } },
    async provaAsync(nome, fn) { try { await fn(); agg(nome); } catch (e) { agg(nome, e); } },
    get ko() { return righe.filter(r => !r.ok).length; },
    get ok() { return righe.filter(r => r.ok).length; },
    righe,
    stampa() {
      console.log(titolo);
      for (const r of righe) console.log(`  ${r.ok ? 'ok ' : 'X  '} ${r.nome}${r.ok ? '' : ' — ' + r.perche}`);
      console.log(`\n${titolo}: ${this.ok} superate, ${this.ko} fallite`);
      return this.ko;
    }
  };
}

export function deve(condizione, messaggio) {
  if (!condizione) throw new Error(messaggio);
}

export function uguale(avuto, atteso, messaggio) {
  const a = JSON.stringify(avuto), b = JSON.stringify(atteso);
  if (a !== b) throw new Error((messaggio || 'valori diversi') + ` — avuto ${a}, atteso ${b}`);
}
