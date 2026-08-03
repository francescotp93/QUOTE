/* ═══════════════════════════════════════════════════════════════════════════
   PRODOTTI — il catalogo
   ───────────────────────────────────────────────────────────────────────────
   Che cosa si può vendere, con quali compagnie, e soprattutto COME: alcuni
   prodotti si quotano da soli («calcola»), altri si mandano in richiesta
   all'ufficio («richiedi») perché la tariffa ufficiale non c'è ancora.
   Questa differenza si dice a chiare lettere: un collaboratore che apre un
   prodotto aspettandosi un premio e trova un modulo di richiesta pensa che il
   sistema sia rotto.

   Sola lettura.
   ═══════════════════════════════════════════════════════════════════════════ */

export const meta = {
  chiave: 'prodotti',
  titolo: 'Prodotti',
  sottotitolo: 'Catalogo e compagnie',
  icona: 'ti-package',
  area: 'Preventivi',
  permesso: null
};

/* ═══ LOGICA ═══════════════════════════════════════════════════════════════ */

/* Come si quota. Si dichiara anche quando il dato manca: «non dichiarato» è
   un'informazione, «calcola» messo per difetto sarebbe una bugia. */
export function quotazione(p) {
  const t = String(p.tipo_quotazione || '').toLowerCase();
  if (t === 'calcola') return { stato: 'ok', testo: 'premio calcolato', spiega: 'Quotazione: il sistema calcola il premio' };
  if (t === 'richiedi') return { stato: 'attesa', testo: 'su richiesta', spiega: 'Quotazione: si manda una richiesta all\'ufficio' };
  return { stato: 'spento', testo: 'non dichiarato', spiega: 'Quotazione: modalità non dichiarata sul catalogo' };
}

/* La durata dice quando scadrà la polizza. Se manca, la polizza nascerà senza
   scadenza e non entrerà mai nello scadenzario: è un buco che va visto. */
export function durata(p) {
  const m = Number(p.durata_mesi);
  if (!Number.isFinite(m) || m <= 0) return { stato: 'male', testo: 'da confermare' };
  if (m % 12 === 0) { const a = m / 12; return { stato: 'ok', testo: a + (a === 1 ? ' anno' : ' anni') }; }
  return { stato: 'ok', testo: m + ' mesi' };
}

export function compagnieDi(p) {
  const c = p.compagnie;
  if (Array.isArray(c)) return c.map(x => (typeof x === 'string' ? x : (x && (x.nome || x.codice)) || '')).filter(Boolean);
  if (c && typeof c === 'object') return Object.keys(c);
  return [];
}

export function filtra(righe, f = {}) {
  const q = String(f.q || '').trim().toLowerCase();
  return (righe || []).filter(p => {
    if (f.ramo && (p.ramo || '') !== f.ramo) return false;
    if (f.come === 'calcola' && String(p.tipo_quotazione || '').toLowerCase() !== 'calcola') return false;
    if (f.come === 'richiedi' && String(p.tipo_quotazione || '').toLowerCase() !== 'richiedi') return false;
    if (f.come === 'senza_durata' && Number(p.durata_mesi) > 0) return false;
    if (f.come === 'spenti' && p.attivo !== false) return false;
    if (f.come !== 'spenti' && p.attivo === false && !f.mostraSpenti) return false;
    if (!q) return true;
    return [p.nome, p.codice, p.ramo, p.descrizione, ...compagnieDi(p)]
      .some(v => String(v ?? '').toLowerCase().includes(q));
  });
}

export function fasceDa(righe) {
  const n = (come) => filtra(righe, { come }).length;
  return [
    { chiave: '', testo: 'In catalogo', n: filtra(righe, {}).length, urgenza: null },
    { chiave: 'calcola', testo: 'Con premio calcolato', n: n('calcola'), urgenza: null },
    { chiave: 'richiedi', testo: 'Solo su richiesta', n: n('richiedi'), urgenza: 'media' },
    { chiave: 'senza_durata', testo: 'Senza durata', n: n('senza_durata'), urgenza: 'alta' },
    { chiave: 'spenti', testo: 'Non attivi', n: n('spenti'), urgenza: null }
  ].filter(f => f.chiave === '' || f.n > 0);
}

/* ═══ PAGINA ═══════════════════════════════════════════════════════════════ */

export async function monta(contenitore, ctx) {
  const { db, ui, fmt, vaiA } = ctx;
  contenitore.innerHTML = ui.attesa('Carico il catalogo…');

  const { data, error } = await db.from('quote_prodotti_catalogo')
    .select('id,ramo,codice,nome,descrizione,tipo_quotazione,compagnie,attivo,ordine,durata_mesi')
    .order('ordine', { ascending: true }).limit(500);
  if (error) return ui.errore(contenitore, error);
  const tutti = data || [];

  let stato = { q: '', ramo: '', come: '' };
  let mostrate = [];

  const barra = ui.filtri({
    campi: [
      { chiave: 'q', etichetta: 'Cerca', tipo: 'testo', segnaposto: 'nome, codice, compagnia…' },
      { chiave: 'ramo', etichetta: 'Ramo', tipo: 'select', opzioni: [{ v: '', t: 'Tutti' }] }
    ],
    suCambio: (v) => { stato = { ...stato, ...v }; disegna(); }
  });
  barra.querySelector('.w1-f-az').appendChild(bottone('Esporta', 'ti-file-spreadsheet', () =>
    ui.esporta('catalogo_prodotti', [
      { testo: 'Ramo', valore: p => p.ramo }, { testo: 'Codice', valore: p => p.codice },
      { testo: 'Prodotto', valore: p => p.nome }, { testo: 'Quotazione', valore: p => quotazione(p).testo },
      { testo: 'Durata', valore: p => durata(p).testo }, { testo: 'Compagnie', valore: p => compagnieDi(p).join(', ') },
      { testo: 'Attivo', valore: p => (p.attivo === false ? 'no' : 'si') }
    ], mostrate)));

  contenitore.innerHTML = '';
  const testa = document.createElement('div');
  contenitore.appendChild(testa);
  contenitore.appendChild(barra);
  const zona = document.createElement('div');
  contenitore.appendChild(zona);

  const rami = [...new Set(tutti.map(p => p.ramo).filter(Boolean))].sort();
  barra.opzioni('ramo', [{ v: '', t: 'Tutti' }, ...rami.map(r => ({ v: r, t: r }))]);

  disegna();

  function disegna() {
    mostrate = filtra(tutti, stato);

    testa.innerHTML = '';
    testa.appendChild(ui.fasce({
      voci: fasceDa(tutti), scelta: stato.come,
      suScelta: (k) => { stato.come = (stato.come === k ? '' : k); disegna(); }
    }));

    zona.innerHTML = '';
    const tab = ui.tabella({
      colonne: [{ testo: 'Prodotto', largo: '26%' }, { testo: 'Ramo', largo: '140px' },
                { testo: 'Compagnie' }, { testo: 'Come si quota', largo: '190px' }, { testo: 'Durata', largo: '120px' }],
      righe: mostrate, vuoto: 'Nessun prodotto con questi filtri.',
      suRiga: (p) => vaiA('preventivi', { prodotto: p.id }),
      disegna: (p) => {
        const q = quotazione(p), d = durata(p);
        const comp = compagnieDi(p);
        return `
        <td><b>${fmt.esc(p.nome || p.codice || '(senza nome)')}</b>
            ${p.attivo === false ? ' ' + ui.badge('non attivo', 'neutro') : ''}
            ${p.descrizione ? `<div class="fio">${fmt.esc(p.descrizione)}</div>` : ''}</td>
        <td>${fmt.esc(p.ramo || '—')}</td>
        <td>${comp.length ? fmt.esc(comp.join(', ')) : '<span class="fio">nessuna compagnia collegata</span>'}</td>
        <td>${ui.semafori([{ stato: q.stato, spiega: q.spiega }])}
            <span style="margin-left:5px">${fmt.esc(q.testo)}</span></td>
        <td>${d.stato === 'male' ? ui.badge(d.testo, 'male') : fmt.esc(d.testo)}</td>`;
      }
    });
    if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
    zona.insertAdjacentHTML('beforeend', ui.totali([
      { valore: mostrate.length, testo: 'prodotti' },
      { valore: mostrate.filter(p => quotazione(p).stato === 'ok').length, testo: 'con premio calcolato' },
      { valore: mostrate.filter(p => durata(p).stato === 'male').length, testo: 'senza durata dichiarata' },
      { valore: mostrate.filter(p => !compagnieDi(p).length).length, testo: 'senza compagnie collegate' }
    ]));
  }
}

function bottone(testo, icona, fai) {
  const b = document.createElement('button');
  b.className = 'w1-btn';
  b.innerHTML = `<i class="ti ${icona}"></i>${testo}`;
  b.addEventListener('click', fai);
  return b;
}
