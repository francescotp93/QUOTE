/* ═══════════════════════════════════════════════════════════════════════════
   TITOLI — rate, quietanze e insoluti
   ───────────────────────────────────────────────────────────────────────────
   È la catena del denaro. Una polizza emessa non è denaro incassato: fra le
   due cose c'è una rata, e una rata può restare aperta, scadere, tornare
   indietro come insoluta. Questa pagina esiste per una sola ragione: che
   nessuna rata resti indietro senza che qualcuno se ne accorga.

   Sola lettura. Gli incassi si registrano dove si registrano oggi: qui si
   guarda, non si tocca il denaro.
   ═══════════════════════════════════════════════════════════════════════════ */
import { giorni } from '../nucleo/formato.js';

export const meta = {
  chiave: 'titoli',
  titolo: 'Titoli',
  sottotitolo: 'Rate, quietanze e insoluti',
  icona: 'ti-receipt',
  area: 'Contabilità',
  permesso: null
};

/* ═══ LOGICA ═══════════════════════════════════════════════════════════════ */

/* Lo stato per come si dice a voce, non per come si chiama la casella.
   «aperto» al telefono non significa niente; «scaduta da 12 giorni» sì. */
export function statoDi(t, oggi) {
  if (t.stato === 'incassato') return { chiave: 'incassato', stato: 'ok', testo: 'incassata' };
  if (t.stato === 'insoluto') return { chiave: 'insoluto', stato: 'male', testo: 'insoluta' };
  if (t.stato === 'stornato') return { chiave: 'stornato', stato: 'spento', testo: 'stornata' };
  const g = t.data_scadenza ? giorni(t.data_scadenza, oggi) : null;
  if (g != null && g < 0) return { chiave: 'scaduto', stato: 'male', testo: 'scaduta da ' + Math.abs(g) + (Math.abs(g) === 1 ? ' giorno' : ' giorni') };
  return { chiave: 'aperto', stato: 'attesa', testo: 'da incassare' };
}

/* Il denaro che non è ancora entrato. Le stornate non contano: sono state
   annullate, sommarle gonfierebbe il credito con soldi che nessuno deve. */
export function daIncassare(righe) {
  return (righe || []).filter(t => t.stato === 'aperto' || t.stato === 'insoluto')
    .reduce((s, t) => s + (Number(t.importo_lordo) || 0), 0);
}

export function incassato(righe) {
  return (righe || []).filter(t => t.stato === 'incassato')
    .reduce((s, t) => s + (Number(t.importo_lordo) || 0), 0);
}

export function filtra(righe, f = {}, oggi) {
  const q = String(f.q || '').trim().toLowerCase();
  return (righe || []).filter(t => {
    if (f.polizza && t.polizza_id !== f.polizza) return false;
    if (f.stato && statoDi(t, oggi).chiave !== f.stato) return false;
    if (f.dal && String(t.data_scadenza || '') < f.dal) return false;
    if (f.al && String(t.data_scadenza || '') > f.al) return false;
    if (!q) return true;
    const p = t.polizza || {};
    return [p.cliente, p.numero_polizza, p.prodotto, p.compagnia, t.pagatore]
      .some(v => String(v ?? '').toLowerCase().includes(q));
  });
}

export function fasceDa(righe, oggi) {
  const per = (k) => righe.filter(t => statoDi(t, oggi).chiave === k);
  const soldi = (l) => { const s = l.reduce((a, t) => a + (Number(t.importo_lordo) || 0), 0); return s > 0 ? s : null; };
  const voci = [
    { chiave: 'insoluto', testo: 'Insoluti', urgenza: 'alta', lista: per('insoluto') },
    { chiave: 'scaduto', testo: 'Scadute non incassate', urgenza: 'alta', lista: per('scaduto') },
    { chiave: 'aperto', testo: 'Da incassare', urgenza: 'media', lista: per('aperto') },
    { chiave: 'incassato', testo: 'Incassate', urgenza: null, lista: per('incassato') },
    { chiave: 'stornato', testo: 'Stornate', urgenza: null, lista: per('stornato') }
  ];
  return voci.map(v => ({ chiave: v.chiave, testo: v.testo, urgenza: v.urgenza, n: v.lista.length, importo: soldi(v.lista) }))
    .filter(v => v.n > 0);
}

/* ═══ PAGINA ═══════════════════════════════════════════════════════════════ */

export async function monta(contenitore, ctx) {
  const { db, ui, fmt, vaiA, parametri } = ctx;
  const oggi = new Date().toISOString().slice(0, 10);
  contenitore.innerHTML = ui.attesa('Carico le rate…');

  const { data, error } = await db.from('quote_titoli')
    .select('id,polizza_id,tipo,data_decorrenza,data_scadenza,importo_lordo,stato,mezzo_pagamento,pagatore,incassato_il,'
      + 'polizza:quote_polizze(id,cliente,cliente_id,numero_polizza,prodotto,compagnia)')
    .order('data_scadenza', { ascending: true }).limit(3000);
  if (error) return ui.errore(contenitore, error);
  const tutte = data || [];

  let stato = { q: '', stato: '', dal: '', al: '', polizza: (parametri && parametri.polizza) || '' };
  let mostrate = [];

  const barra = ui.filtri({
    campi: [
      { chiave: 'q', etichetta: 'Cerca', tipo: 'testo', segnaposto: 'cliente, numero polizza…' },
      { chiave: 'dal', etichetta: 'Scadenza dal', tipo: 'data' },
      { chiave: 'al', etichetta: 'Scadenza al', tipo: 'data' }
    ],
    suCambio: (v) => { stato = { ...stato, ...v }; disegna(); }
  });
  barra.querySelector('.w1-f-az').appendChild(bottone('Esporta', 'ti-file-spreadsheet', () =>
    ui.esporta('titoli', [
      { testo: 'Scadenza', valore: t => t.data_scadenza }, { testo: 'Decorrenza', valore: t => t.data_decorrenza },
      { testo: 'Cliente', valore: t => (t.polizza || {}).cliente },
      { testo: 'Polizza', valore: t => (t.polizza || {}).numero_polizza },
      { testo: 'Prodotto', valore: t => (t.polizza || {}).prodotto },
      { testo: 'Tipo', valore: t => t.tipo }, { testo: 'Stato', valore: t => statoDi(t, oggi).testo },
      { testo: 'Importo', valore: t => t.importo_lordo },
      { testo: 'Incassata il', valore: t => t.incassato_il }, { testo: 'Mezzo', valore: t => t.mezzo_pagamento }
    ], mostrate)));

  contenitore.innerHTML = '';
  const testa = document.createElement('div');
  contenitore.appendChild(testa);
  contenitore.appendChild(barra);
  const zona = document.createElement('div');
  contenitore.appendChild(zona);

  disegna();

  function disegna() {
    mostrate = filtra(tutte, stato, oggi);

    testa.innerHTML = '';
    const gruppi = fasceDa(tutte, oggi);
    if (!gruppi.length) {
      testa.innerHTML = '<div class="w1-card"><div class="dentro"><b>Nessuna rata registrata.</b> '
        + 'Le rate nascono quando si emette una polizza.</div></div>';
    } else {
      testa.appendChild(ui.fasce({
        voci: gruppi, scelta: stato.stato,
        suScelta: (k) => { stato.stato = (stato.stato === k ? '' : k); disegna(); }
      }));
    }
    if (stato.polizza) {
      const avviso = document.createElement('div');
      avviso.className = 'w1-totali';
      avviso.style.borderRadius = 'var(--w1-raggio)';
      avviso.innerHTML = '<span>Stai vedendo le rate di una sola polizza.</span>';
      const b = bottone('Mostra tutte', 'ti-x', () => { stato.polizza = ''; disegna(); });
      b.style.height = '22px';
      avviso.appendChild(b);
      testa.appendChild(avviso);
    }

    zona.innerHTML = '';
    const tab = ui.tabella({
      colonne: [{ testo: 'Scadenza', largo: '105px' }, { testo: 'Cliente', largo: '22%' },
                { testo: 'Polizza' }, { testo: 'Tipo', largo: '110px' },
                { testo: 'Stato', largo: '190px' }, { testo: 'Importo', largo: '110px' }],
      righe: mostrate, vuoto: 'Nessuna rata con questi filtri.',
      suRiga: (t) => (t.polizza_id ? vaiA('polizze', { id: t.polizza_id }) : null),
      disegna: (t) => {
        const p = t.polizza || {}, s = statoDi(t, oggi);
        return `
        <td>${fmt.data(t.data_scadenza)}</td>
        <td><b>${fmt.esc(p.cliente || 'Cliente non indicato')}</b></td>
        <td>${fmt.esc([p.numero_polizza, p.prodotto, p.compagnia].filter(Boolean).join(' · ')) || '<span class="fio">—</span>'}</td>
        <td>${fmt.esc(String(t.tipo || 'rata').replace('_', ' '))}</td>
        <td>${ui.semafori([{ stato: s.stato, spiega: 'Rata: ' + s.testo }])}
            <span style="margin-left:5px">${fmt.esc(s.testo)}</span>
            ${t.incassato_il ? `<div class="fio">il ${fmt.data(t.incassato_il)}${t.mezzo_pagamento ? ' · ' + fmt.esc(t.mezzo_pagamento) : ''}</div>` : ''}</td>
        <td class="num">${fmt.euro(t.importo_lordo)}</td>`;
      }
    });
    if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
    zona.insertAdjacentHTML('beforeend', ui.totali([
      { valore: mostrate.length, testo: 'rate' },
      { valore: fmt.euro(incassato(mostrate)), testo: 'incassati' },
      { valore: fmt.euro(daIncassare(mostrate)), testo: 'ancora da incassare' },
      { valore: mostrate.filter(t => t.stato === 'insoluto').length, testo: 'insoluti da recuperare' }
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
