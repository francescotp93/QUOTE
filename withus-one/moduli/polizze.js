/* ═══════════════════════════════════════════════════════════════════════════
   POLIZZE — il portafoglio contratti
   ───────────────────────────────────────────────────────────────────────────
   Una polizza non ha «uno stato»: ne ha QUATTRO, e sono indipendenti fra loro.
   Può essere pagata ma non perfezionata (mancano i documenti), perfezionata ma
   non rendicontata (la compagnia non l'ha ancora messa in estratto conto), e
   perfino pagata e perfezionata ma fuori copertura perché è scaduta ieri.
   Riassumerli in un semaforo solo è comodo e sbagliato: si perde proprio
   l'informazione che dice che cosa fare.

   Ordine fisso, sempre: pagamento · perfezionamento · rendicontazione ·
   copertura.

   Sola lettura.
   ═══════════════════════════════════════════════════════════════════════════ */
import { giorni } from '../nucleo/formato.js';

export const meta = {
  chiave: 'polizze',
  titolo: 'Polizze',
  sottotitolo: 'Il portafoglio contratti',
  icona: 'ti-shield-check',
  area: 'Portafoglio',
  permesso: null
};

/* ═══ LOGICA ═══════════════════════════════════════════════════════════════ */

/* I quattro stati, ognuno con la sua spiegazione per esteso. La spiegazione non
   è un di più: un pallino colorato senza legenda non è informazione. */
export function semaforiDi(p, oggi) {
  const s = [];

  const pag = p.stato_pagamento || 'non_pagato';
  s.push(pag === 'pagato' ? { stato: 'ok', spiega: 'Pagamento: incassata' }
       : pag === 'sospeso' ? { stato: 'attesa', spiega: 'Pagamento: sospesa' }
       : pag === 'annullata' ? { stato: 'spento', spiega: 'Pagamento: polizza annullata' }
       : { stato: 'male', spiega: 'Pagamento: non incassata' });

  s.push(p.perfezionata
    ? { stato: 'ok', spiega: 'Perfezionamento: documenti completi' }
    : { stato: 'attesa', spiega: 'Perfezionamento: mancano documenti obbligatori' });

  s.push(p.rendicontata
    ? { stato: 'ok', spiega: 'Rendicontazione: presente in estratto conto' }
    : { stato: 'attesa', spiega: 'Rendicontazione: non ancora rendicontata' });

  s.push(copertura(p, oggi));
  return s;
}

/* La copertura si legge dalle date di copertura se ci sono, altrimenti da
   effetto/scadenza. Senza scadenza NON si tira a indovinare: si dice che è da
   confermare, che è sempre meglio di un verde che non corrisponde a niente. */
export function copertura(p, oggi) {
  if ((p.stato_pagamento || '') === 'annullata') return { stato: 'spento', spiega: 'Copertura: polizza annullata' };
  const dal = p.copertura_dal || p.data_effetto;
  const al = p.copertura_al || p.data_scadenza;
  if (!al) return { stato: 'spento', spiega: 'Copertura: scadenza da confermare' };
  const gDal = dal ? giorni(dal, oggi) : null;
  if (gDal != null && gDal > 0) return { stato: 'attesa', spiega: 'Copertura: decorre il ' + it(dal) };
  const gAl = giorni(al, oggi);
  if (gAl < 0) return { stato: 'male', spiega: 'Copertura: scaduta il ' + it(al) };
  if (gAl <= 30) return { stato: 'attesa', spiega: 'Copertura: scade il ' + it(al) };
  return { stato: 'ok', spiega: 'Copertura: attiva fino al ' + it(al) };
}

function it(iso) { const [a, m, g] = String(iso).slice(0, 10).split('-'); return `${g}/${m}/${a}`; }

/* Quante ne sono a posto su tutti e quattro i fronti. È il numero che conta
   davvero: una polizza «quasi a posto» è comunque una polizza da lavorare. */
export function complete(righe, oggi) {
  return (righe || []).filter(p => semaforiDi(p, oggi).every(s => s.stato === 'ok')).length;
}

/* Il numero che la compagnia riconosce e il nostro contatore interno sono due
   cose diverse. Se manca il primo NON si mostra il secondo al suo posto: quel
   numero verrebbe dettato al telefono a una compagnia dove non esiste. Si dice
   che manca, e il numero di pratica si mostra a parte, con il suo nome. */
export function numeroDi(p) {
  return (p && p.numero_polizza) ? String(p.numero_polizza) : null;
}
export function pratica(p) {
  return (p && p.numero != null) ? 'pratica ' + p.numero : '';
}

export function filtra(righe, f = {}, oggi) {
  const q = String(f.q || '').trim().toLowerCase();
  return (righe || []).filter(p => {
    if (f.cliente && p.cliente_id !== f.cliente) return false;
    if (f.compagnia && (p.compagnia || '') !== f.compagnia) return false;
    /* Una polizza annullata non è lavoro: non si incassa, non si perfeziona e non
       si rendiconta. Lasciarla nelle fasce rosse manda a telefonare un cliente
       per una polizza che non esiste, e gonfia il totale del premio. */
    const annullata = (p.stato_pagamento || '') === 'annullata';
    if (annullata && ['da_incassare', 'da_perfezionare', 'da_rendicontare', 'complete'].includes(f.stato)) return false;
    if (f.stato === 'da_incassare' && p.stato_pagamento === 'pagato') return false;
    if (f.stato === 'da_perfezionare' && p.perfezionata) return false;
    if (f.stato === 'da_rendicontare' && p.rendicontata) return false;
    if (f.stato === 'scoperte' && copertura(p, oggi).stato !== 'male') return false;
    if (f.stato === 'complete' && !semaforiDi(p, oggi).every(s => s.stato === 'ok')) return false;
    if (!q) return true;
    return [p.cliente, p.numero_polizza, p.prodotto, p.modulo, p.compagnia, p.numero]
      .some(v => String(v ?? '').toLowerCase().includes(q));
  });
}

export function fasceDa(righe, oggi) {
  const conta = (chiave) => filtra(righe, { stato: chiave }, oggi).length;
  const voci = [
    { chiave: '', testo: 'Tutte', n: (righe || []).length, urgenza: null },
    { chiave: 'da_incassare', testo: 'Da incassare', n: conta('da_incassare'), urgenza: 'alta' },
    { chiave: 'scoperte', testo: 'Scoperte', n: conta('scoperte'), urgenza: 'alta' },
    { chiave: 'da_perfezionare', testo: 'Da perfezionare', n: conta('da_perfezionare'), urgenza: 'media' },
    { chiave: 'da_rendicontare', testo: 'Da rendicontare', n: conta('da_rendicontare'), urgenza: 'media' },
    { chiave: 'complete', testo: 'A posto', n: conta('complete'), urgenza: null }
  ];
  /* «Tutte» resta anche se è zero: è il modo per tornare indietro dal filtro.
     Le altre a zero spariscono, perché una fascia vuota è solo rumore. */
  return voci.filter(v => v.chiave === '' || v.n > 0);
}

/* ═══ PAGINA ═══════════════════════════════════════════════════════════════ */

export async function monta(contenitore, ctx) {
  if (ctx.parametri && ctx.parametri.id) return scheda(contenitore, ctx, ctx.parametri.id);
  return elenco(contenitore, ctx);
}

const CAMPI = 'id,numero,numero_polizza,cliente,cliente_id,modulo,prodotto,compagnia,data_effetto,data_scadenza,'
  + 'frazionamento,tacito_rinnovo,premio_annuo,premio_rata,stato_pagamento,perfezionata,rendicontata,'
  + 'copertura_dal,copertura_al,sostituisce_id,motivo_emissione,note,creato_nome,creato_il';

async function elenco(contenitore, ctx) {
  const { db, ui, fmt, vaiA, parametri } = ctx;
  const oggi = new Date().toISOString().slice(0, 10);
  contenitore.innerHTML = ui.attesa('Carico il portafoglio…');

  const { data, error } = await db.from('quote_polizze').select(CAMPI)
    .order('data_effetto', { ascending: false }).limit(3000);
  if (error) return ui.errore(contenitore, error);
  const tutte = data || [];

  let stato = { q: '', compagnia: '', stato: '', cliente: (parametri && parametri.cliente) || '' };
  let mostrate = [];

  const barra = ui.filtri({
    campi: [
      { chiave: 'q', etichetta: 'Cerca', tipo: 'testo', segnaposto: 'cliente, numero, prodotto…' },
      { chiave: 'compagnia', etichetta: 'Compagnia', tipo: 'select', opzioni: [{ v: '', t: 'Tutte' }] }
    ],
    suCambio: (v) => { stato = { ...stato, ...v }; disegna(); }
  });
  const esp = bottone('Esporta', 'ti-file-spreadsheet', () => ui.esporta('polizze', [
    { testo: 'Numero polizza', valore: p => numeroDi(p) || '' },
    { testo: 'N. pratica', valore: p => p.numero },
    { testo: 'Cliente', valore: p => p.cliente }, { testo: 'Prodotto', valore: p => p.prodotto || p.modulo },
    { testo: 'Compagnia', valore: p => p.compagnia }, { testo: 'Effetto', valore: p => p.data_effetto },
    { testo: 'Scadenza', valore: p => p.data_scadenza }, { testo: 'Premio annuo', valore: p => p.premio_annuo },
    { testo: 'Pagamento', valore: p => p.stato_pagamento },
    { testo: 'Perfezionata', valore: p => (p.perfezionata ? 'si' : 'no') },
    { testo: 'Rendicontata', valore: p => (p.rendicontata ? 'si' : 'no') },
    { testo: 'Copertura', valore: p => copertura(p, oggi).spiega }
  ], mostrate));
  barra.querySelector('.w1-f-az').appendChild(esp);

  contenitore.innerHTML = '';
  const testa = document.createElement('div');
  contenitore.appendChild(testa);
  contenitore.appendChild(barra);
  const zona = document.createElement('div');
  contenitore.appendChild(zona);

  const compagnie = [...new Set(tutte.map(p => p.compagnia).filter(Boolean))].sort();
  barra.opzioni('compagnia', [{ v: '', t: 'Tutte' }, ...compagnie.map(c => ({ v: c, t: c }))]);

  disegna();

  function disegna() {
    mostrate = filtra(tutte, stato, oggi);

    testa.innerHTML = '';
    testa.appendChild(ui.fasce({
      voci: fasceDa(tutte, oggi), scelta: stato.stato,
      suScelta: (k) => { stato.stato = (stato.stato === k ? '' : k); disegna(); }
    }));
    if (stato.cliente) {
      const avviso = document.createElement('div');
      avviso.className = 'w1-totali';
      avviso.style.borderRadius = 'var(--w1-raggio)';
      avviso.innerHTML = '<span>Stai vedendo le polizze di un solo cliente.</span>';
      const b = bottone('Mostra tutte', 'ti-x', () => { stato.cliente = ''; disegna(); });
      b.style.height = '22px';
      avviso.appendChild(b);
      testa.appendChild(avviso);
    }

    zona.innerHTML = '';
    const tab = ui.tabella({
      colonne: [
        { testo: 'Stato', largo: '78px' }, { testo: 'Numero', largo: '120px' },
        { testo: 'Cliente', largo: '20%' }, { testo: 'Prodotto' },
        { testo: 'Scadenza', largo: '130px' }, { testo: 'Premio', largo: '110px' }
      ],
      righe: mostrate, vuoto: 'Nessuna polizza con questi filtri.',
      suRiga: (p) => vaiA('polizze', { id: p.id }),
      disegna: (p) => `
        <td>${ui.semafori(semaforiDi(p, oggi))}</td>
        <td>${numeroDi(p) ? fmt.esc(numeroDi(p))
              : ui.badge('senza numero', 'attesa')}<div class="fio">${fmt.esc(pratica(p))}</div></td>
        <td><b>${fmt.esc(p.cliente || 'Cliente non indicato')}</b></td>
        <td>${fmt.esc([p.prodotto || p.modulo, p.compagnia].filter(Boolean).join(' · '))}</td>
        <td>${p.data_scadenza ? fmt.data(p.data_scadenza) : ui.badge('da confermare', 'attesa')}</td>
        <td class="num">${fmt.euro(p.premio_annuo)}</td>`
    });
    if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
    /* Il premio si somma solo sulle polizze VIVE. Le annullate restano visibili
       nell'elenco (servono allo storico) ma non fanno portafoglio: sommarle
       significherebbe dichiarare un premio che non incasseremo mai. */
    const vive = mostrate.filter(p => (p.stato_pagamento || '') !== 'annullata');
    const annullate = mostrate.length - vive.length;
    zona.insertAdjacentHTML('beforeend', ui.totali([
      { valore: mostrate.length, testo: 'polizze' },
      annullate ? { valore: annullate, testo: 'annullate, escluse dal premio' } : null,
      { valore: fmt.euro(vive.reduce((s, p) => s + (Number(p.premio_annuo) || 0), 0)), testo: 'di premio annuo' },
      { valore: complete(mostrate, oggi), testo: 'a posto su tutti e quattro i fronti' }
    ]));
  }
}

async function scheda(contenitore, ctx, id) {
  const { db, ui, fmt, vaiA } = ctx;
  const oggi = new Date().toISOString().slice(0, 10);
  contenitore.innerHTML = ui.attesa('Carico la polizza…');

  const [pol, tit, doc] = await Promise.all([
    db.from('quote_polizze').select(CAMPI).eq('id', id).maybeSingle(),
    db.from('quote_titoli').select('*').eq('polizza_id', id).order('data_decorrenza', { ascending: true }).limit(200),
    db.from('quote_pratica_documenti').select('*').eq('entita', 'polizza').eq('entita_id', id).limit(100)
  ]);
  if (pol.error) return ui.errore(contenitore, pol.error);
  const p = pol.data;
  if (!p) { contenitore.innerHTML = ui.vuoto('Questa polizza non esiste più, oppure non è visibile con il tuo ruolo.'); return; }

  const titoli = tit.data || [], documenti = doc.data || [];
  const mancanti = documenti.filter(d => d.obbligatorio && !d.url);
  const sem = semaforiDi(p, oggi);

  contenitore.innerHTML = `
    <div style="margin-bottom:10px;display:flex;gap:7px">
      <button class="w1-btn" id="p-indietro"><i class="ti ti-arrow-left"></i>Tutte le polizze</button>
      ${p.cliente_id ? '<button class="w1-btn" id="p-cliente"><i class="ti ti-user"></i>Scheda cliente</button>' : ''}
    </div>
    <div class="w1-griglia">
      <div class="w1-card">
        <h2><i class="ti ti-shield-check"></i>${numeroDi(p) ? fmt.esc(numeroDi(p)) : 'Polizza senza numero'}
            <span class="az" style="font-size:11px;color:var(--w1-testo3);font-weight:400">${fmt.esc(pratica(p))}</span></h2>
        <div class="dentro">
          <dl class="w1-dati">
            <dt>Cliente</dt><dd>${fmt.esc(p.cliente || 'non indicato')}</dd>
            <dt>Prodotto</dt><dd>${fmt.esc(p.prodotto || p.modulo || '—')}</dd>
            <dt>Compagnia</dt><dd>${fmt.esc(p.compagnia || '—')}</dd>
            <dt>Effetto</dt><dd>${fmt.data(p.data_effetto)}</dd>
            <dt>Scadenza</dt><dd>${p.data_scadenza ? fmt.data(p.data_scadenza) : ui.badge('da confermare', 'attesa')}</dd>
            <dt>Frazionamento</dt><dd>${fmt.esc(p.frazionamento || '—')}</dd>
            <dt>Tacito rinnovo</dt><dd>${p.tacito_rinnovo ? 'sì' : 'no'}</dd>
            <dt>Premio annuo</dt><dd>${fmt.euro(p.premio_annuo)}</dd>
            <dt>Premio rata</dt><dd>${fmt.euro(p.premio_rata)}</dd>
            <dt>Emessa da</dt><dd>${fmt.esc(p.creato_nome || '—')}</dd>
          </dl>
          ${p.note ? `<div style="margin-top:10px;color:var(--w1-testo2)"><b>Note.</b> ${fmt.esc(p.note)}</div>` : ''}
        </div>
      </div>
      <div class="w1-card">
        <h2><i class="ti ti-traffic-lights"></i>I quattro stati</h2>
        <div class="dentro">
          <dl class="w1-dati">
            ${sem.map(s => `<dt>${ui.semafori([s])}</dt><dd style="font-weight:400">${fmt.esc(s.spiega)}</dd>`).join('')}
          </dl>
          ${mancanti.length ? `<div style="margin-top:11px">${ui.badge('Documenti da acquisire: '
              + mancanti.map(d => d.nome || d.categoria).join(', '), 'attesa')}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="w1-card" style="margin-bottom:0"><h2><i class="ti ti-receipt"></i>Rate e quietanze</h2></div>
    <div id="p-titoli"></div>

    <div class="w1-card" style="margin:12px 0 0"><h2><i class="ti ti-files"></i>Documenti di pratica</h2>
      <div class="dentro">${documenti.length ? documenti.map(d =>
        `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--w1-bordo2)">
           ${ui.semafori([{ stato: d.url ? 'ok' : (d.obbligatorio ? 'male' : 'spento'),
                            spiega: d.url ? 'Acquisito' : (d.obbligatorio ? 'Obbligatorio, manca' : 'Facoltativo, manca') }])}
           <span>${fmt.esc(d.nome || d.categoria)}</span>
           ${d.obbligatorio ? ui.badge('obbligatorio', 'neutro') : ''}
           ${d.url ? `<a href="${fmt.esc(d.url)}" target="_blank" rel="noopener" style="margin-left:auto">apri</a>` : ''}
         </div>`).join('')
        : ui.vuoto('Nessun documento registrato su questa pratica.')}</div>
    </div>`;

  const zona = contenitore.querySelector('#p-titoli');
  const tab = ui.tabella({
    colonne: [{ testo: 'Tipo', largo: '110px' }, { testo: 'Decorrenza', largo: '110px' },
              { testo: 'Scadenza', largo: '110px' }, { testo: 'Stato', largo: '120px' },
              { testo: 'Incassata il', largo: '110px' }, { testo: 'Importo', largo: '110px' }],
    righe: titoli, vuoto: 'Nessuna rata generata su questa polizza.',
    disegna: (t) => `
      <td>${fmt.esc(String(t.tipo || 'rata').replace('_', ' '))}</td>
      <td>${fmt.data(t.data_decorrenza)}</td>
      <td>${fmt.data(t.data_scadenza)}</td>
      <td>${statoTitolo(t, ui, oggi)}</td>
      <td>${t.incassato_il ? fmt.data(t.incassato_il) : '<span class="fio">—</span>'}</td>
      <td class="num">${fmt.euro(t.importo_lordo)}</td>`
  });
  if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
  zona.insertAdjacentHTML('beforeend', ui.totali([
    { valore: titoli.length, testo: 'rate' },
    { valore: fmt.euro(titoli.filter(t => t.stato === 'incassato').reduce((s, t) => s + (Number(t.importo_lordo) || 0), 0)), testo: 'incassati' },
    { valore: fmt.euro(titoli.filter(t => t.stato !== 'incassato' && t.stato !== 'stornato')
        .reduce((s, t) => s + (Number(t.importo_lordo) || 0), 0)), testo: 'ancora da incassare' }
  ]));

  contenitore.querySelector('#p-indietro').addEventListener('click', () => vaiA('polizze'));
  const bc = contenitore.querySelector('#p-cliente');
  if (bc) bc.addEventListener('click', () => vaiA('clienti', { id: p.cliente_id }));
}

/* Lo stato della rata detto in italiano, non con il nome della casella del
   database. «aperto» non significa niente per chi telefona al cliente. */
export function statoTitolo(t, ui, oggi) {
  if (t.stato === 'incassato') return ui.badge('incassata', 'ok');
  if (t.stato === 'insoluto') return ui.badge('insoluta', 'male');
  if (t.stato === 'stornato') return ui.badge('stornata', 'neutro');
  const g = t.data_scadenza ? giorni(t.data_scadenza, oggi) : null;
  if (g != null && g < 0) return ui.badge('scaduta', 'male');
  return ui.badge('da incassare', 'attesa');
}

function bottone(testo, icona, fai) {
  const b = document.createElement('button');
  b.className = 'w1-btn';
  b.innerHTML = `<i class="ti ${icona}"></i>${testo}`;
  b.addEventListener('click', fai);
  return b;
}
