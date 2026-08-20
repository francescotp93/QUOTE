/* ═══════════════════════════════════════════════════════════════════════════
   CLIENTI — anagrafiche e storia
   ───────────────────────────────────────────────────────────────────────────
   È il centro del gestionale: da qui si arriva a tutto il resto. La scheda non
   mostra solo i dati del cliente, ma la sua STORIA in ordine di tempo —
   preventivi, polizze, rate, sinistri, richieste — perché è quello che serve
   quando il cliente telefona: sapere che cosa è successo, e quando.

   Sola lettura.
   ═══════════════════════════════════════════════════════════════════════════ */

/* La copertura si prende da polizze.js: e' l'unico posto in cui e' definita bene
   (guarda le date, non lo stato di pagamento). Riscriverla qui vorrebbe dire
   avere due risposte diverse alla domanda «questa polizza copre?». */
import { copertura } from './polizze.js';

export const meta = {
  chiave: 'clienti',
  titolo: 'Clienti',
  sottotitolo: 'Anagrafiche e storia',
  icona: 'ti-users',
  area: 'Portafoglio',
  permesso: null
};

/* ═══ LOGICA ═══════════════════════════════════════════════════════════════ */

/* Il nome da mostrare. Le anagrafiche vecchie hanno il nominativo già composto,
   quelle nuove hanno cognome e nome separati, le aziende la ragione sociale.
   Senza questa scala si vedono righe vuote in elenco. */
export function nomeDi(c) {
  if (!c) return '(senza nome)';
  const composto = [c.cognome, c.nome].filter(Boolean).join(' ').trim();
  return (c.nominativo || c.ragione_sociale || composto || '').trim() || '(senza nome)';
}

/* Confronto che ignora maiuscole e accenti: chi cerca «damico» deve trovare
   «D'Amico», altrimenti crea un doppione. */
export function piatto(v) {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // toglie gli accenti
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function cerca(righe, filtri = {}) {
  const q = piatto(filtri.q);
  const tipo = (filtri.tipo || '').trim();
  return (righe || []).filter(c => {
    if (tipo && (c.tipo || '') !== tipo) return false;
    if (!q) return true;
    return [nomeDi(c), c.codice_fiscale, c.partita_iva, c.email, c.telefono, c.cellulare, c.comune]
      .some(v => piatto(v).includes(q));
  });
}

/* Che cosa manca per poter lavorare quel cliente. Non è un giudizio estetico:
   senza contatto non si può avvisare di una scadenza, senza codice fiscale non
   si emette. Si elenca in chiaro invece di mostrare un punteggio, perché un
   punteggio non dice che cosa andare a chiedere. */
export function mancanze(c) {
  const m = [];
  const azienda = (c.tipo || '').toLowerCase().startsWith('azien') || !!c.partita_iva;
  if (!c.email && !c.pec) m.push('email');
  if (!c.telefono && !c.cellulare) m.push('telefono');
  if (azienda ? !c.partita_iva : !c.codice_fiscale) m.push(azienda ? 'partita IVA' : 'codice fiscale');
  if (!c.indirizzo || !c.comune) m.push('indirizzo');
  return m;
}

/* La storia del cliente: fatti diversi messi sulla stessa linea del tempo.
   Ordine decrescente — quando arriva una telefonata interessa l'ultima cosa
   successa, non la prima. */
export function cronologia({ preventivi = [], polizze = [], titoli = [], sinistri = [], richieste = [] }) {
  const v = [];
  for (const p of preventivi) {
    v.push({ quando: p.creato_il, tipo: 'Preventivo', icona: 'ti-file-text',
      /* Se il preventivo e' gia' diventato polizza va detto qui: altrimenti la
         storia mostra due righe con lo stesso premio e sembra un doppione. */
      testo: [p.prodotto || p.modulo, p.compagnia, p.polizza_emessa ? 'diventato polizza' : null]
        .filter(Boolean).join(' · ') || 'preventivo',
      importo: numero(p.premio), apri: { chiave: 'preventivi', parametri: { id: p.id } } });
  }
  for (const p of polizze) {
    v.push({ quando: p.data_effetto || p.creato_il, tipo: 'Polizza', icona: 'ti-shield-check',
      /* Solo gli stati che cambiano il senso della riga: annullata e non pagata.
         Scriverli tutti e quattro qui renderebbe illeggibile la cronologia. */
      testo: [p.numero_polizza ? 'n. ' + p.numero_polizza : null, p.prodotto || p.modulo, p.compagnia,
              p.stato_pagamento === 'annullata' ? 'ANNULLATA'
                : p.stato_pagamento === 'non_pagato' ? 'non pagata' : null]
        .filter(Boolean).join(' · ') || 'polizza',
      importo: numero(p.premio_annuo), apri: { chiave: 'polizze', parametri: { id: p.id } } });
  }
  for (const t of titoli) {
    const incassato = t.stato === 'incassato';
    v.push({ quando: t.incassato_il || t.data_scadenza || t.data_decorrenza, tipo: incassato ? 'Incasso' : 'Rata',
      icona: incassato ? 'ti-cash' : 'ti-receipt',
      testo: (t.tipo || 'rata').replace('_', ' ') + ' · ' + (t.stato || ''),
      importo: numero(t.importo_lordo), apri: { chiave: 'titoli', parametri: { polizza: t.polizza_id } } });
  }
  for (const s of sinistri) {
    v.push({ quando: s.data_denuncia || s.data_accadimento, tipo: 'Sinistro', icona: 'ti-alert-triangle',
      testo: [s.numero_sx, s.ramo, s.stato].filter(Boolean).join(' · ') || 'sinistro',
      importo: null, apri: { chiave: 'sinistri', parametri: { id: s.id } } });
  }
  for (const r of richieste) {
    v.push({ quando: r.creato_il, tipo: 'Richiesta', icona: 'ti-message-2',
      testo: (r.titolo || 'richiesta') + ' · ' + (r.stato || ''), importo: null,
      apri: { chiave: 'richieste', parametri: { id: r.id } } });
  }
  /* Un fatto senza data non si può collocare: va in fondo, non in cima, per
     non sembrare l'ultima cosa accaduta. */
  return v.sort((a, b) => {
    if (!a.quando && !b.quando) return 0;
    if (!a.quando) return 1;
    if (!b.quando) return -1;
    return String(b.quando).localeCompare(String(a.quando));
  });
}

function numero(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

/* ═══ PAGINA ═══════════════════════════════════════════════════════════════ */

export async function monta(contenitore, ctx) {
  if (ctx.parametri && ctx.parametri.id) return scheda(contenitore, ctx, ctx.parametri.id);
  return elenco(contenitore, ctx);
}

async function elenco(contenitore, ctx) {
  const { db, ui, fmt, vaiA, parametri } = ctx;
  contenitore.innerHTML = ui.attesa('Carico le anagrafiche…');

  const { data, error } = await db.from('quote_anagrafiche')
    .select('id,tipo,nominativo,cognome,nome,ragione_sociale,codice_fiscale,partita_iva,email,pec,telefono,cellulare,indirizzo,comune,provincia,creato_il')
    .order('creato_il', { ascending: false }).limit(3000);
  if (error) return ui.errore(contenitore, error);
  const tutti = data || [];

  /* La ricerca dalla barra in alto arriva qui come parametro: chi cerca un
     cliente da qualunque pagina si ritrova l'elenco già filtrato. */
  let stato = { q: (parametri && parametri.q) || '', tipo: '' };

  const barra = ui.filtri({
    campi: [
      { chiave: 'q', etichetta: 'Cerca', tipo: 'testo', segnaposto: 'nome, codice fiscale, email, telefono…' },
      { chiave: 'tipo', etichetta: 'Tipo', tipo: 'select', opzioni: [{ v: '', t: 'Tutti' }] }
    ],
    suCambio: (v) => { stato = v; disegna(); }
  });

  contenitore.innerHTML = '';
  contenitore.appendChild(barra);
  const zona = document.createElement('div');
  contenitore.appendChild(zona);

  const tipi = [...new Set(tutti.map(c => c.tipo).filter(Boolean))].sort();
  barra.opzioni('tipo', [{ v: '', t: 'Tutti' }, ...tipi.map(t => ({ v: t, t }))]);
  if (stato.q) barra.querySelector('[data-k="q"]').value = stato.q;

  /* L'esportazione porta via quello che si sta guardando, non tutto l'archivio:
     se si e' filtrato, si esporta il filtrato. */
  let mostrate = [];
  const esp = document.createElement('button');
  esp.className = 'w1-btn';
  esp.innerHTML = '<i class="ti ti-file-spreadsheet"></i>Esporta';
  esp.addEventListener('click', () => ui.esporta('clienti', [
    { testo: 'Cliente', valore: nomeDi }, { testo: 'Tipo', valore: c => c.tipo },
    { testo: 'Codice fiscale', valore: c => c.codice_fiscale }, { testo: 'Partita IVA', valore: c => c.partita_iva },
    { testo: 'Email', valore: c => c.email || c.pec }, { testo: 'Telefono', valore: c => c.cellulare || c.telefono },
    { testo: 'Comune', valore: c => c.comune }, { testo: 'Da completare', valore: c => mancanze(c).join(', ') }
  ], mostrate));
  barra.querySelector('.w1-f-az').appendChild(esp);

  disegna();

  function disegna() {
    const righe = cerca(tutti, stato);
    zona.innerHTML = '';
    const tab = ui.tabella({
      colonne: [
        { testo: 'Cliente', largo: '28%' }, { testo: 'Codice fiscale / P.IVA', largo: '170px' },
        { testo: 'Contatti' }, { testo: 'Comune', largo: '150px' }, { testo: 'Da completare', largo: '190px' }
      ],
      righe, vuoto: stato.q ? 'Nessun cliente con questa ricerca.' : 'Nessun cliente.',
      suRiga: (c) => vaiA('clienti', { id: c.id }),
      disegna: (c) => {
        const m = mancanze(c);
        return `<td><b>${fmt.esc(nomeDi(c))}</b>${c.tipo ? `<div class="fio">${fmt.esc(c.tipo)}</div>` : ''}</td>
        <td>${fmt.esc(c.codice_fiscale || c.partita_iva || '')}${!c.codice_fiscale && !c.partita_iva ? '<span class="fio">—</span>' : ''}</td>
        <td>${[c.email || c.pec, c.cellulare || c.telefono].filter(Boolean).map(x => fmt.esc(x)).join('<br>') || '<span class="fio">nessun contatto</span>'}</td>
        <td>${fmt.esc([c.comune, c.provincia].filter(Boolean).join(' ('))}${c.provincia ? ')' : ''}</td>
        <td>${m.length ? ui.badge(m.join(', '), 'attesa') : ui.badge('completo', 'ok')}</td>`;
      }
    });
    if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
    zona.insertAdjacentHTML('beforeend', ui.totali([
      { valore: righe.length, testo: 'clienti' },
      { valore: righe.filter(c => mancanze(c).length).length, testo: 'con dati da completare' },
      { valore: righe.filter(c => !c.email && !c.pec && !c.cellulare && !c.telefono).length, testo: 'senza alcun contatto' }
    ]));

    mostrate = righe;
  }
}

async function scheda(contenitore, ctx, id) {
  const { db, ui, fmt, vaiA } = ctx;
  const oggi = new Date().toISOString().slice(0, 10);
  contenitore.innerHTML = ui.attesa('Carico la scheda…');

  const [anag, prev, pol, sin, ric] = await Promise.all([
    db.from('quote_anagrafiche').select('*').eq('id', id).maybeSingle(),
    db.from('quote_preventivi').select('id,modulo,prodotto,compagnia,premio,stato,polizza_emessa,creato_il').eq('cliente_id', id).limit(300),
    db.from('quote_polizze').select('id,numero,numero_polizza,modulo,prodotto,compagnia,data_effetto,data_scadenza,copertura_dal,copertura_al,premio_annuo,stato_pagamento,perfezionata,rendicontata,creato_il').eq('cliente_id', id).limit(300),
    db.from('quote_sinistri').select('id,numero_sx,ramo,stato,data_accadimento,data_denuncia').eq('cliente_id', id).limit(200),
    db.from('iam_ticket').select('id,titolo,stato,creato_il').eq('cliente_id', id).limit(200)
  ]);
  if (anag.error) return ui.errore(contenitore, anag.error);
  const c = anag.data;
  if (!c) { contenitore.innerHTML = ui.vuoto('Questo cliente non esiste più, oppure non è visibile con il tuo ruolo.'); return; }

  const polizze = pol.data || [];
  let titoli = [];
  if (polizze.length) {
    const { data } = await db.from('quote_titoli')
      .select('id,polizza_id,tipo,stato,data_decorrenza,data_scadenza,importo_lordo,incassato_il')
      .in('polizza_id', polizze.map(p => p.id)).limit(500);
    titoli = data || [];
  }

  const storia = cronologia({ preventivi: prev.data || [], polizze, titoli, sinistri: sin.data || [], richieste: ric.data || [] });
  const m = mancanze(c);
  /* «Attiva» vuol dire CHE COPRE OGGI. Contare le non-annullate faceva risultare
     attiva una polizza scaduta un anno fa: al telefono si confermava al cliente
     una copertura che non esisteva piu'. */
  const attive = polizze.filter(p => ['ok', 'attesa'].includes(copertura(p, oggi).stato));
  const scadute = polizze.filter(p => copertura(p, oggi).stato === 'male');
  const premio = attive.reduce((s, p) => s + (Number(p.premio_annuo) || 0), 0);

  contenitore.innerHTML = `
    <div style="margin-bottom:10px"><button class="w1-btn" id="c-indietro"><i class="ti ti-arrow-left"></i>Tutti i clienti</button></div>
    <div class="w1-griglia">
      <div class="w1-card">
        <h2><i class="ti ti-user"></i>${fmt.esc(nomeDi(c))}</h2>
        <div class="dentro">
          <dl class="w1-dati">
            ${riga('Tipo', c.tipo)}
            ${riga('Codice fiscale', c.codice_fiscale)}
            ${riga('Partita IVA', c.partita_iva)}
            ${riga('Nascita', c.data_nascita ? fmt.data(c.data_nascita) : null)}
            ${riga('Indirizzo', [c.indirizzo, c.civico].filter(Boolean).join(' ') || null)}
            ${riga('Comune', [c.cap, c.comune, c.provincia && '(' + c.provincia + ')'].filter(Boolean).join(' ') || null)}
            ${riga('Email', c.email)}
            ${riga('PEC', c.pec)}
            ${riga('Telefono', c.cellulare || c.telefono)}
            ${riga('Professione', c.professione)}
          </dl>
          ${m.length ? `<div style="margin-top:10px">${ui.badge('Da chiedere: ' + m.join(', '), 'attesa')}</div>` : ''}
          ${c.note ? `<div style="margin-top:10px;color:var(--w1-testo2)"><b>Note.</b> ${fmt.esc(c.note)}</div>` : ''}
        </div>
      </div>
      <div class="w1-card">
        <h2><i class="ti ti-briefcase"></i>In portafoglio</h2>
        <div class="dentro">
          <dl class="w1-dati">
            <dt>Polizze che coprono oggi</dt><dd>${attive.length}</dd>
            ${scadute.length ? `<dt>Scadute, non rinnovate</dt><dd>${scadute.length}</dd>` : ''}
            <dt>Premio annuo in corso</dt><dd>${fmt.euro(premio)}</dd>
            <dt>Preventivi</dt><dd>${(prev.data || []).length}</dd>
            <dt>Sinistri</dt><dd>${(sin.data || []).length}</dd>
            <dt>Rate non incassate</dt><dd>${titoli.filter(t => t.stato === 'aperto' || t.stato === 'insoluto').length}</dd>
          </dl>
          <div style="margin-top:11px;display:flex;gap:7px;flex-wrap:wrap">
            <button class="w1-btn" id="c-pol"><i class="ti ti-shield-check"></i>Le sue polizze</button>
            <button class="w1-btn" id="c-esp"><i class="ti ti-file-spreadsheet"></i>Esporta storia</button>
          </div>
        </div>
      </div>
    </div>
    <div class="w1-card" style="margin-bottom:0"><h2><i class="ti ti-history"></i>Che cosa è successo</h2></div>
    <div id="c-storia"></div>`;

  function riga(etichetta, valore) {
    /* Un campo vuoto si mostra lo stesso, ma con il trattino: fa vedere che
       manca invece di far credere che non esista quel dato. */
    return `<dt>${fmt.esc(etichetta)}</dt><dd>${valore ? fmt.esc(valore) : '<span class="fio">—</span>'}</dd>`;
  }

  const zona = contenitore.querySelector('#c-storia');
  const tab = ui.tabella({
    colonne: [{ testo: 'Quando', largo: '110px' }, { testo: 'Che cosa', largo: '110px' }, { testo: 'Dettaglio' }, { testo: 'Importo', largo: '110px' }],
    righe: storia, vuoto: 'Nessun movimento su questo cliente.',
    suRiga: (v) => vaiA(v.apri.chiave, v.apri.parametri),
    disegna: (v) => `
      <td>${v.quando ? fmt.data(v.quando) : '<span class="fio">senza data</span>'}</td>
      <td><i class="ti ${fmt.esc(v.icona)}" style="color:var(--w1-testo2)"></i> ${fmt.esc(v.tipo)}</td>
      <td>${fmt.esc(v.testo)}</td>
      <td class="num">${v.importo == null ? '<span class="fio">—</span>' : fmt.euro(v.importo)}</td>`
  });
  if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
  zona.insertAdjacentHTML('beforeend', ui.totali([{ valore: storia.length, testo: 'movimenti' }]));

  contenitore.querySelector('#c-indietro').addEventListener('click', () => vaiA('clienti'));
  contenitore.querySelector('#c-pol').addEventListener('click', () => vaiA('polizze', { cliente: id }));
  contenitore.querySelector('#c-esp').addEventListener('click', () => ui.esporta('storia_' + piatto(nomeDi(c)), [
    { testo: 'Quando', valore: v => v.quando }, { testo: 'Che cosa', valore: v => v.tipo },
    { testo: 'Dettaglio', valore: v => v.testo }, { testo: 'Importo', valore: v => v.importo }
  ], storia));
}
