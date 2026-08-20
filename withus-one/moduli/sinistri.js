/* ═══════════════════════════════════════════════════════════════════════════
   SINISTRI — denunce e liquidazioni
   ───────────────────────────────────────────────────────────────────────────
   Un sinistro non è una scheda con una descrizione: è un fascicolo con dentro
   delle CONTROPARTI e delle PARTITE di danno, ognuna con il suo importo
   richiesto, riservato e liquidato. Il numero che conta — quanto è ancora
   aperto — si ottiene solo mettendoli in fila.

   Sola lettura.
   ═══════════════════════════════════════════════════════════════════════════ */
import { giorni } from '../nucleo/formato.js';

export const meta = {
  chiave: 'sinistri',
  titolo: 'Sinistri',
  sottotitolo: 'Denunce e liquidazioni',
  icona: 'ti-alert-triangle',
  area: 'Portafoglio',
  permesso: null
};

/* ═══ LOGICA ═══════════════════════════════════════════════════════════════ */

/* Aperto finché non è chiuso o respinto. Si guarda il testo dello stato invece
   di un elenco chiuso perché lo stato lo scrivono le compagnie con parole loro. */
export function aperto(s) {
  return !/chius|liquidat|respint|archiviat|annullat/i.test(String(s && s.stato || ''));
}

/* I soldi del fascicolo. Il «da liquidare» è quello che resta fra ciò che è
   stato riservato e ciò che è già uscito: mai negativo, perché una liquidazione
   più alta della riserva significa riserva da aggiornare, non credito. */
export function conti(partite) {
  const somma = (campo) => (partite || []).reduce((t, p) => t + (Number(p[campo]) || 0), 0);
  const riservato = somma('importo_riservato');
  const liquidato = somma('importo_liquidato');
  return {
    richiesto: somma('importo_richiesto'),
    riservato, liquidato,
    franchigia: somma('franchigia'),
    daLiquidare: Math.max(0, riservato - liquidato)
  };
}

/* Da quanti giorni è aperto. Un sinistro fermo da mesi è il vero problema:
   nessuno se ne lamenta finché il cliente non chiama arrabbiato. */
export function giacenza(s, oggi) {
  const g = giorni(s.data_denuncia || s.data_accadimento, oggi);
  return g == null ? null : Math.abs(g);
}

export function filtra(righe, f = {}, oggi) {
  const q = String(f.q || '').trim().toLowerCase();
  return (righe || []).filter(s => {
    if (f.stato === 'aperti' && !aperto(s)) return false;
    if (f.stato === 'chiusi' && aperto(s)) return false;
    if (f.stato === 'fermi' && !(aperto(s) && (giacenza(s, oggi) ?? 0) > 60)) return false;
    if (f.ramo && (s.ramo || '') !== f.ramo) return false;
    if (!q) return true;
    return [s.contraente, s.numero_sx, s.n_polizza, s.compagnia, s.ramo, s.luogo]
      .some(v => String(v ?? '').toLowerCase().includes(q));
  });
}

export function fasceDa(righe, oggi) {
  const voci = [
    { chiave: '', testo: 'Tutti', n: (righe || []).length, urgenza: null },
    { chiave: 'aperti', testo: 'Aperti', n: filtra(righe, { stato: 'aperti' }, oggi).length, urgenza: 'media' },
    { chiave: 'fermi', testo: 'Fermi da oltre 60 giorni', n: filtra(righe, { stato: 'fermi' }, oggi).length, urgenza: 'alta' },
    { chiave: 'chiusi', testo: 'Chiusi', n: filtra(righe, { stato: 'chiusi' }, oggi).length, urgenza: null }
  ];
  return voci.filter(v => v.chiave === '' || v.n > 0);
}

/* ═══ PAGINA ═══════════════════════════════════════════════════════════════ */

export async function monta(contenitore, ctx) {
  if (ctx.parametri && ctx.parametri.id) return scheda(contenitore, ctx, ctx.parametri.id);
  return elenco(contenitore, ctx);
}

async function elenco(contenitore, ctx) {
  const { db, ui, fmt, vaiA } = ctx;
  const oggi = new Date().toISOString().slice(0, 10);
  contenitore.innerHTML = ui.attesa('Carico i sinistri…');

  const { data, error } = await db.from('quote_sinistri')
    .select('id,contraente,cliente_id,ramo,compagnia,n_polizza,numero_sx,luogo,data_accadimento,data_denuncia,stato,creato_nome')
    .order('data_denuncia', { ascending: false }).limit(2000);
  if (error) return ui.errore(contenitore, error);
  const tutti = data || [];

  let stato = { q: '', ramo: '', stato: '' };
  let mostrate = [];

  const barra = ui.filtri({
    campi: [
      { chiave: 'q', etichetta: 'Cerca', tipo: 'testo', segnaposto: 'contraente, numero, targa…' },
      { chiave: 'ramo', etichetta: 'Ramo', tipo: 'select', opzioni: [{ v: '', t: 'Tutti' }] }
    ],
    suCambio: (v) => { stato = { ...stato, ...v }; disegna(); }
  });
  barra.querySelector('.w1-f-az').appendChild(bottone('Esporta', 'ti-file-spreadsheet', () =>
    ui.esporta('sinistri', [
      { testo: 'Numero', valore: s => s.numero_sx }, { testo: 'Contraente', valore: s => s.contraente },
      { testo: 'Ramo', valore: s => s.ramo }, { testo: 'Compagnia', valore: s => s.compagnia },
      { testo: 'Polizza', valore: s => s.n_polizza }, { testo: 'Accadimento', valore: s => s.data_accadimento },
      { testo: 'Denuncia', valore: s => s.data_denuncia }, { testo: 'Stato', valore: s => s.stato },
      { testo: 'Giorni aperto', valore: s => (aperto(s) ? giacenza(s, oggi) : '') }
    ], mostrate)));

  contenitore.innerHTML = '';
  const testa = document.createElement('div');
  contenitore.appendChild(testa);
  contenitore.appendChild(barra);
  const zona = document.createElement('div');
  contenitore.appendChild(zona);

  const rami = [...new Set(tutti.map(s => s.ramo).filter(Boolean))].sort();
  barra.opzioni('ramo', [{ v: '', t: 'Tutti' }, ...rami.map(r => ({ v: r, t: r }))]);

  disegna();

  function disegna() {
    mostrate = filtra(tutti, stato, oggi);

    testa.innerHTML = '';
    testa.appendChild(ui.fasce({
      voci: fasceDa(tutti, oggi), scelta: stato.stato,
      suScelta: (k) => { stato.stato = (stato.stato === k ? '' : k); disegna(); }
    }));

    zona.innerHTML = '';
    const tab = ui.tabella({
      colonne: [{ testo: 'Numero', largo: '130px' }, { testo: 'Contraente', largo: '22%' },
                { testo: 'Ramo / compagnia' }, { testo: 'Accadimento', largo: '105px' },
                { testo: 'Stato', largo: '150px' }, { testo: 'Aperto da', largo: '110px' }],
      righe: mostrate, vuoto: 'Nessun sinistro con questi filtri.',
      suRiga: (s) => vaiA('sinistri', { id: s.id }),
      disegna: (s) => {
        const g = giacenza(s, oggi);
        return `
        <td>${fmt.esc(s.numero_sx || '(senza numero)')}</td>
        <td><b>${fmt.esc(s.contraente || 'non indicato')}</b></td>
        <td>${fmt.esc([s.ramo, s.compagnia].filter(Boolean).join(' · '))}</td>
        <td>${fmt.data(s.data_accadimento)}</td>
        <td>${aperto(s) ? ui.badge(s.stato || 'aperto', 'attesa') : ui.badge(s.stato || 'chiuso', 'ok')}</td>
        <td>${!aperto(s) || g == null ? '<span class="fio">—</span>'
              : (g > 60 ? ui.badge(g + ' giorni', 'male') : fmt.esc(g + ' giorni'))}</td>`;
      }
    });
    if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
    zona.insertAdjacentHTML('beforeend', ui.totali([
      { valore: mostrate.length, testo: 'sinistri' },
      { valore: mostrate.filter(aperto).length, testo: 'ancora aperti' },
      { valore: mostrate.filter(s => aperto(s) && (giacenza(s, oggi) ?? 0) > 60).length, testo: 'fermi da oltre 60 giorni' }
    ]));
  }
}

async function scheda(contenitore, ctx, id) {
  const { db, ui, fmt, vaiA } = ctx;
  const oggi = new Date().toISOString().slice(0, 10);
  contenitore.innerHTML = ui.attesa('Apro il fascicolo…');

  const [sin, cop, par] = await Promise.all([
    db.from('quote_sinistri').select('*').eq('id', id).maybeSingle(),
    db.from('quote_sinistro_controparti').select('*').eq('sinistro_id', id).limit(50),
    db.from('quote_sinistro_partite').select('*').eq('sinistro_id', id).limit(100)
  ]);
  if (sin.error) return ui.errore(contenitore, sin.error);
  const s = sin.data;
  if (!s) { contenitore.innerHTML = ui.vuoto('Questo sinistro non esiste più, oppure non è visibile con il tuo ruolo.'); return; }

  const controparti = cop.data || [], partite = par.data || [];
  const c = conti(partite);
  const g = giacenza(s, oggi);

  contenitore.innerHTML = `
    <div style="margin-bottom:10px;display:flex;gap:7px">
      <button class="w1-btn" id="s-indietro"><i class="ti ti-arrow-left"></i>Tutti i sinistri</button>
      ${s.cliente_id ? '<button class="w1-btn" id="s-cliente"><i class="ti ti-user"></i>Scheda cliente</button>' : ''}
    </div>
    <div class="w1-griglia">
      <div class="w1-card">
        <h2><i class="ti ti-alert-triangle"></i>${fmt.esc(s.numero_sx || 'Sinistro senza numero')}</h2>
        <div class="dentro"><dl class="w1-dati">
          <dt>Contraente</dt><dd>${fmt.esc(s.contraente || '—')}</dd>
          <dt>Polizza</dt><dd>${fmt.esc(s.n_polizza || '—')}</dd>
          <dt>Ramo</dt><dd>${fmt.esc(s.ramo || '—')}</dd>
          <dt>Compagnia</dt><dd>${fmt.esc(s.compagnia || '—')}</dd>
          <dt>Accadimento</dt><dd>${fmt.data(s.data_accadimento)}</dd>
          <dt>Denuncia</dt><dd>${fmt.data(s.data_denuncia)}</dd>
          <dt>Luogo</dt><dd>${fmt.esc(s.luogo || '—')}</dd>
          <dt>Stato</dt><dd>${aperto(s) ? ui.badge(s.stato || 'aperto', 'attesa') : ui.badge(s.stato || 'chiuso', 'ok')}</dd>
          <dt>Aperto da</dt><dd>${!aperto(s) || g == null ? '—' : g + ' giorni'}</dd>
        </dl>
        ${s.descrizione ? `<div style="margin-top:10px"><b>Dinamica.</b> ${fmt.esc(s.descrizione)}</div>` : ''}</div>
      </div>
      <div class="w1-card">
        <h2><i class="ti ti-cash"></i>I numeri del fascicolo</h2>
        <div class="dentro"><dl class="w1-dati">
          <dt>Richiesto</dt><dd>${fmt.euro(c.richiesto)}</dd>
          <dt>Riservato</dt><dd>${fmt.euro(c.riservato)}</dd>
          <dt>Liquidato</dt><dd>${fmt.euro(c.liquidato)}</dd>
          <dt>Franchigie</dt><dd>${fmt.euro(c.franchigia)}</dd>
          <dt>Ancora da liquidare</dt><dd>${fmt.euro(c.daLiquidare)}</dd>
        </dl>
        ${!partite.length ? `<div style="margin-top:10px;color:var(--w1-testo2)">
          Nessuna partita di danno registrata: gli importi restano a zero finché non si inseriscono.</div>` : ''}</div>
      </div>
    </div>

    <div class="w1-card" style="margin-bottom:0"><h2><i class="ti ti-users"></i>Controparti</h2>
      <div class="dentro">${controparti.length ? controparti.map(k =>
        `<div style="padding:5px 0;border-bottom:1px solid var(--w1-bordo2)">
           <b>${fmt.esc(k.nominativo || '(senza nome)')}</b>
           ${k.tipo ? ui.badge(k.tipo, 'neutro') : ''}
           ${k.responsabilita ? ui.badge('responsabilità: ' + k.responsabilita, 'attesa') : ''}
           <div class="fio">${fmt.esc([k.targa, k.compagnia, k.numero_polizza].filter(Boolean).join(' · '))}</div>
         </div>`).join('') : ui.vuoto('Nessuna controparte registrata.')}</div>
    </div>

    <div class="w1-card" style="margin:12px 0 0"><h2><i class="ti ti-list-details"></i>Partite di danno</h2></div>
    <div id="s-partite"></div>`;

  const zona = contenitore.querySelector('#s-partite');
  const tab = ui.tabella({
    colonne: [{ testo: 'Tipo', largo: '130px' }, { testo: 'Descrizione' }, { testo: 'Stato', largo: '120px' },
              { testo: 'Richiesto', largo: '105px' }, { testo: 'Riservato', largo: '105px' }, { testo: 'Liquidato', largo: '105px' }],
    righe: partite, vuoto: 'Nessuna partita di danno su questo fascicolo.',
    disegna: (p) => `
      <td>${fmt.esc(p.tipo || '—')}</td>
      <td>${fmt.esc(p.descrizione || '—')}</td>
      <td>${ui.badge(p.stato || 'aperta', /liquidat|chius/i.test(String(p.stato || '')) ? 'ok' : 'attesa')}</td>
      <td class="num">${fmt.euro(p.importo_richiesto)}</td>
      <td class="num">${fmt.euro(p.importo_riservato)}</td>
      <td class="num">${fmt.euro(p.importo_liquidato)}</td>`
  });
  if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
  zona.insertAdjacentHTML('beforeend', ui.totali([
    { valore: partite.length, testo: 'partite' },
    { valore: fmt.euro(c.daLiquidare), testo: 'ancora da liquidare' }
  ]));

  contenitore.querySelector('#s-indietro').addEventListener('click', () => vaiA('sinistri'));
  const bc = contenitore.querySelector('#s-cliente');
  if (bc) bc.addEventListener('click', () => vaiA('clienti', { id: s.cliente_id }));
}

function bottone(testo, icona, fai) {
  const b = document.createElement('button');
  b.className = 'w1-btn';
  b.innerHTML = `<i class="ti ${icona}"></i>${testo}`;
  b.addEventListener('click', fai);
  return b;
}
