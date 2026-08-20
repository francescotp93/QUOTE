/* ═══════════════════════════════════════════════════════════════════════════
   UI — i pezzi condivisi dell'interfaccia
   Se ogni modulo si scrive la sua tabella, dopo dieci moduli ci sono dieci
   tabelle diverse per la stessa cosa. Questi si usano, non si reinventano.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esc, euro } from './formato.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

/* ── Etichette di stato ─────────────────────────────────────────────────────
   Quattro tipi, e basta: aggiungerne un quinto significa che il significato
   non era chiaro. */
const TIPI = { ok: 'w1-b-ok', attesa: 'w1-b-att', male: 'w1-b-male', neutro: 'w1-b-neu' };
export function badge(testo, tipo = 'neutro') {
  return `<span class="w1-badge ${TIPI[tipo] || TIPI.neutro}">${esc(testo)}</span>`;
}

/* ── Semafori ───────────────────────────────────────────────────────────────
   voci = [{ stato:'ok'|'attesa'|'male'|'spento', spiega:'Pagamento: pagato' }]
   La spiegazione è OBBLIGATORIA: un pallino colorato senza spiegazione non è
   informazione, è decorazione. */
export function semafori(voci) {
  return '<span class="w1-sems">' + (voci || []).map(v =>
    `<i class="w1-sem w1-sem-${v.stato || 'spento'}" title="${esc(v.spiega || '')}"></i>`).join('') + '</span>';
}

export function vuoto(testo) { return `<div class="w1-vuoto">${esc(testo)}</div>`; }
export function attesa(testo = 'Carico…') { return `<div class="w1-attesa">${esc(testo)}</div>`; }

export function errore(contenitore, e) {
  const msg = (e && (e.message || e.error_description)) || String(e || 'errore sconosciuto');
  contenitore.innerHTML = `<div class="w1-errore"><b>Non disponibile.</b><br><small>${esc(msg)}</small></div>`;
}

/* ── Tabella ────────────────────────────────────────────────────────────────
   colonne: [{ testo, largo }]  ·  disegna(riga) → stringa di <td>
   suRiga: facoltativa, (riga) => void quando si clicca */
export function tabella({ colonne, righe, disegna, vuoto: testoVuoto = 'Nessun risultato.', suRiga }) {
  const th = colonne.map(c => `<th${c.largo ? ` style="width:${c.largo}"` : ''}>${esc(c.testo || '')}</th>`).join('');
  if (!righe || !righe.length) {
    return `<div class="w1-tab"><table><thead><tr>${th}</tr></thead><tbody>
      <tr><td colspan="${colonne.length}">${vuoto(testoVuoto)}</td></tr></tbody></table></div>`;
  }
  const corpo = righe.map((r, i) =>
    `<tr${suRiga ? ` class="w1-cliccabile" data-i="${i}"` : ''}>${disegna(r, i)}</tr>`).join('');
  const html = `<div class="w1-tab"><table><thead><tr>${th}</tr></thead><tbody>${corpo}</tbody></table></div>`;
  if (!suRiga) return html;
  const nodo = el(html);
  nodo.querySelectorAll('tr[data-i]').forEach(tr =>
    tr.addEventListener('click', () => suRiga(righe[Number(tr.dataset.i)])));
  return nodo;
}

/* ── Filtri ─────────────────────────────────────────────────────────────────
   campi: [{ chiave, etichetta, tipo:'testo'|'select'|'data', opzioni:[{v,t}] }]
   Ritorna un nodo; i valori si leggono con .valori() */
export function filtri({ campi, suCambio, azione }) {
  const html = `<div class="w1-filtri">
    ${campi.map(c => `<label class="w1-f"><span>${esc(c.etichetta)}</span>${
      c.tipo === 'select'
        ? `<select data-k="${esc(c.chiave)}">${(c.opzioni || []).map(o =>
            `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('')}</select>`
        : `<input data-k="${esc(c.chiave)}" type="${c.tipo === 'data' ? 'date' : 'text'}"${
            c.segnaposto ? ` placeholder="${esc(c.segnaposto)}"` : ''}>`
    }</label>`).join('')}
    <button class="w1-azzera" type="button">Azzera</button>
    <div class="w1-f-az">${azione || ''}</div>
  </div>`;
  const nodo = el(html);
  const valori = () => {
    const v = {};
    nodo.querySelectorAll('[data-k]').forEach(e => { v[e.dataset.k] = (e.value || '').trim(); });
    return v;
  };
  nodo.querySelectorAll('[data-k]').forEach(e => {
    e.addEventListener(e.tagName === 'SELECT' || e.type === 'date' ? 'change' : 'input',
      () => suCambio && suCambio(valori()));
  });
  nodo.querySelector('.w1-azzera').addEventListener('click', () => {
    nodo.querySelectorAll('[data-k]').forEach(e => { e.value = ''; });
    suCambio && suCambio(valori());
  });
  nodo.valori = valori;
  /* Riempie a posteriori le opzioni di una select: i valori possibili spesso si
     conoscono solo dopo aver letto i dati. */
  nodo.opzioni = (chiave, opzioni) => {
    const s = nodo.querySelector(`select[data-k="${chiave}"]`);
    if (!s) return;
    const scelto = s.value;
    s.innerHTML = opzioni.map(o => `<option value="${esc(o.v)}"${o.v === scelto ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
  };
  return nodo;
}

/* ── Fasce ──────────────────────────────────────────────────────────────────
   La prima cosa che si guarda: quanti ne hai addosso, e per quanti soldi.
   voci: [{ chiave, testo, n, importo, urgenza:'alta'|'media'|null }] */
export function fasce({ voci, scelta, suScelta }) {
  const nodo = el(`<div class="w1-fasce">${voci.map(v =>
    `<button type="button" class="w1-fascia${v.urgenza ? ' u-' + v.urgenza : ''}${v.chiave === scelta ? ' att' : ''}" data-k="${esc(v.chiave)}">
      <b>${v.n}</b><span>${esc(v.testo)}</span>${v.importo != null ? `<span class="w1-fascia-e">${euro(v.importo)}</span>` : ''}
    </button>`).join('')}</div>`);
  nodo.querySelectorAll('[data-k]').forEach(b =>
    b.addEventListener('click', () => suScelta && suScelta(b.dataset.k)));
  return nodo;
}

/* ── Totali ─────────────────────────────────────────────────────────────────
   voci: [{ testo, valore }] — e sotto la tabella dicono anche COSA MANCA,
   non solo quanti sono. */
export function totali(voci) {
  return `<div class="w1-totali">${(voci || []).filter(Boolean).map(v =>
    `<span>${v.valore != null ? `<b>${esc(String(v.valore))}</b> ` : ''}${esc(v.testo)}</span>`).join('')}</div>`;
}

/* ── Modale ─────────────────────────────────────────────────────────────── */
export function modale({ titolo, corpo, azioni, largo = '640px' }) {
  document.getElementById('w1-modale')?.remove();
  const nodo = el(`<div class="w1-ov" id="w1-modale">
    <div class="w1-mod" style="max-width:${largo}">
      <div class="w1-mod-t"><b>${esc(titolo)}</b><button class="w1-x" type="button"><i class="ti ti-x"></i></button></div>
      <div class="w1-mod-c"></div>
      ${azioni ? '<div class="w1-mod-a"></div>' : ''}
    </div></div>`);
  const c = nodo.querySelector('.w1-mod-c');
  if (typeof corpo === 'string') c.innerHTML = corpo; else if (corpo) c.appendChild(corpo);
  if (azioni) {
    const a = nodo.querySelector('.w1-mod-a');
    azioni.forEach(x => {
      const b = el(`<button type="button" class="w1-btn${x.primario ? ' p' : ''}">${esc(x.testo)}</button>`);
      b.addEventListener('click', () => x.fai && x.fai(nodo));
      a.appendChild(b);
    });
  }
  const chiudi = () => nodo.remove();
  nodo.querySelector('.w1-x').addEventListener('click', chiudi);
  nodo.addEventListener('click', e => { if (e.target === nodo) chiudi(); });
  document.body.appendChild(nodo);
  nodo.chiudi = chiudi;
  return nodo;
}

/* ── Conferma ───────────────────────────────────────────────────────────────
   Con `parola` obbliga a scriverla: si usa quando l'azione non si annulla
   (invii, incassi, cancellazioni). Un click non basta. */
export function conferma({ titolo, testo, parola }) {
  return new Promise(risolvi => {
    const campo = parola
      ? `<div class="w1-conf-p">Scrivi <b>${esc(parola)}</b> per confermare:<input id="w1-conf-in" autocomplete="off"></div>` : '';
    const m = modale({
      titolo,
      corpo: `<div class="w1-conf">${esc(testo)}</div>${campo}`,
      largo: '460px',
      azioni: [
        { testo: 'Annulla', fai: n => { n.remove(); risolvi(false); } },
        { testo: parola ? 'Confermo' : 'Vai', primario: true, fai: n => {
            if (parola) {
              const v = (n.querySelector('#w1-conf-in')?.value || '').trim();
              if (v !== parola) { n.querySelector('#w1-conf-in').classList.add('male'); return; }
            }
            n.remove(); risolvi(true);
          } }
      ]
    });
    setTimeout(() => m.querySelector('#w1-conf-in')?.focus(), 60);
  });
}

/* ── Esportazione ───────────────────────────────────────────────────────────
   Se una lista non si può esportare, qualcuno la ricopia a mano. */
export function esporta(nome, colonne, righe) {
  if (!righe || !righe.length) { alert('Non c\'è niente da esportare con questi filtri.'); return; }
  const corpo = righe.map(r => '<tr>' + colonne.map(c => `<td>${esc(c.valore(r) ?? '')}</td>`).join('') + '</tr>').join('');
  const html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">'
    + '<style>table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;font:12px sans-serif}'
    + 'th{background:#f6f8fa;font-weight:700}</style></head><body><table><thead><tr>'
    + colonne.map(c => `<th>${esc(c.testo)}</th>`).join('') + '</tr></thead><tbody>' + corpo + '</tbody></table></body></html>';
  const url = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome + '_' + new Date().toISOString().slice(0, 10) + '.xls';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const ui = { badge, semafori, vuoto, attesa, errore, tabella, filtri, fasce, totali, modale, conferma, esporta };
export default ui;
