/* ═══════════════════════════════════════════════════════════════════════════
   FORMATO — come si scrivono numeri, soldi e date
   Un posto solo: se ogni modulo formatta a modo suo, la stessa cifra appare
   scritta in tre modi diversi nella stessa pagina.
   ═══════════════════════════════════════════════════════════════════════════ */

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* useGrouping esplicito: per la regola italiana (CLDR) il punto delle migliaia
   comparirebbe solo da 10.000 in su, e «1234,50» in una colonna di importi si
   legge male. In contabilità si scrive 1.234,50, sempre. */
export function numero(n, decimali = 0) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali, useGrouping: true });
}

export function euro(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return '€ ' + v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
}

/* Alcuni fatti hanno l'orario (un preventivo salvato alle 11:04), altri sono
   solo date (la decorrenza di una polizza). Scrivere «00:00» sui secondi è un
   orario finto: si mostra solo ciò che si sa davvero. */
export function data(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('it-IT');
}

export function dataOra(v) {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return data(v);
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/* Giorni che mancano a una data: negativo se è passata.
   Si contano GIORNI DI CALENDARIO, non ore: una polizza che scade domani scade
   domani sia che la si guardi alle 9 sia alle 23. Contando le ore, la stessa
   scadenza risulterebbe «fra 1 giorno» la mattina e «oggi» la sera.
   `oggi` si può passare da fuori: serve alle prove, che altrimenti cambierebbero
   risultato ogni giorno. */
export function giorni(v, oggi) {
  if (!v) return null;
  const a = giornoSolo(v);
  const b = giornoSolo(oggi || new Date());
  if (a == null || b == null) return null;
  return Math.round((a - b) / 86400000);
}

function giornoSolo(v) {
  const t = String(v instanceof Date ? v.toISOString() : v).slice(0, 10);
  const n = Date.parse(t + 'T00:00:00Z');
  return Number.isFinite(n) ? n : null;
}

/* «fra 12 giorni» / «scaduta da 3 giorni» / «oggi»: la frase che si legge,
   non il numero da interpretare. */
export function quando(v, oggi) {
  const g = giorni(v, oggi);
  if (g == null) return '';
  if (g === 0) return 'oggi';
  if (g > 0) return 'fra ' + g + (g === 1 ? ' giorno' : ' giorni');
  const a = Math.abs(g);
  return 'da ' + a + (a === 1 ? ' giorno' : ' giorni');
}

/* Somma mesi restando su AAAA-MM-GG. Il 31 gennaio + 1 mese fa 28 febbraio,
   non il 3 marzo: sulle polizze due giorni di errore sono un rinnovo perso. */
export function sommaMesi(iso, mesi) {
  const [a, m, g] = String(iso).slice(0, 10).split('-').map(Number);
  const totale = (m - 1) + Number(mesi);
  const anno = a + Math.floor(totale / 12);
  const mese = ((totale % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate();
  const giorno = Math.min(g, ultimo);
  return anno + '-' + String(mese + 1).padStart(2, '0') + '-' + String(giorno).padStart(2, '0');
}

export const fmt = { esc, numero, euro, data, dataOra, giorni, quando, sommaMesi };
export default fmt;
