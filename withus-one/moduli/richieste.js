/* ═══════════════════════════════════════════════════════════════════════════
   RICHIESTE — la coda verso l'ufficio
   ───────────────────────────────────────────────────────────────────────────
   Una coda sola per tutto: quotazioni da fare a mano, volture, problemi
   tecnici, domande. Il motivo per cui è una sola è semplice: con due code, una
   delle due non la guarda nessuno.

   Quello che conta qui non è il numero delle richieste aperte, ma DA QUANTO
   sono aperte. Una richiesta ferma da due settimane è un cliente che aspetta.

   Sola lettura.
   ═══════════════════════════════════════════════════════════════════════════ */
import { giorni } from '../nucleo/formato.js';

export const meta = {
  chiave: 'richieste',
  titolo: 'Richieste',
  sottotitolo: 'La coda verso l\'ufficio',
  icona: 'ti-message-2',
  area: 'Richieste',
  permesso: null
};

/* ═══ LOGICA ═══════════════════════════════════════════════════════════════ */

export function aperta(r) {
  return !/risolt|chius|annullat|archiviat/i.test(String(r && r.stato || ''));
}

/* Le priorità che si trovano davvero nei dati sono cinque, scritte in modi
   diversi nel tempo. Si riconoscono per come sono scritte invece di pretendere
   un elenco chiuso, che si romperebbe alla prima parola nuova. */
export function urgenzaDi(r) {
  const p = String(r.priorita || '').toLowerCase();
  if (/critic|urgent/.test(p)) return { livello: 3, stato: 'male', testo: p || 'urgente' };
  if (/alta/.test(p)) return { livello: 2, stato: 'male', testo: 'alta' };
  if (/bassa/.test(p)) return { livello: 0, stato: 'spento', testo: 'bassa' };
  return { livello: 1, stato: 'attesa', testo: p || 'normale' };
}

export function attesaGiorni(r, oggi) {
  const g = giorni(r.creato_il, oggi);
  return g == null ? null : Math.abs(g);
}

/* Ferma da troppo. Sette giorni non è una soglia di legge: è il tempo oltre il
   quale un cliente richiama per sapere che fine ha fatto la sua pratica. */
export const GIORNI_FERMA = 7;

export function ordina(righe, oggi) {
  return [...(righe || [])].sort((a, b) => {
    /* Prima le aperte: le risolte servono da storico, non da lavoro. */
    if (aperta(a) !== aperta(b)) return aperta(a) ? -1 : 1;
    const u = urgenzaDi(b).livello - urgenzaDi(a).livello;
    if (u) return u;
    return (attesaGiorni(b, oggi) ?? -1) - (attesaGiorni(a, oggi) ?? -1);
  });
}

export function filtra(righe, f = {}, oggi) {
  const q = String(f.q || '').trim().toLowerCase();
  return (righe || []).filter(r => {
    if (f.stato === 'aperte' && !aperta(r)) return false;
    if (f.stato === 'ferme' && !(aperta(r) && (attesaGiorni(r, oggi) ?? 0) > GIORNI_FERMA)) return false;
    if (f.stato === 'urgenti' && !(aperta(r) && urgenzaDi(r).livello >= 2)) return false;
    if (f.stato === 'risolte' && aperta(r)) return false;
    if (f.sezione && (r.sezione || '') !== f.sezione) return false;
    if (!q) return true;
    return [r.titolo, r.descrizione, r.segnalato_nome, r.sezione, r.origine]
      .some(v => String(v ?? '').toLowerCase().includes(q));
  });
}

export function fasceDa(righe, oggi) {
  const n = (s) => filtra(righe, { stato: s }, oggi).length;
  return [
    { chiave: 'aperte', testo: 'Aperte', n: n('aperte'), urgenza: 'media' },
    { chiave: 'ferme', testo: 'Ferme da oltre 7 giorni', n: n('ferme'), urgenza: 'alta' },
    { chiave: 'urgenti', testo: 'Urgenti', n: n('urgenti'), urgenza: 'alta' },
    { chiave: 'risolte', testo: 'Risolte', n: n('risolte'), urgenza: null }
  ].filter(f => f.n > 0);
}

/* ═══ PAGINA ═══════════════════════════════════════════════════════════════ */

export async function monta(contenitore, ctx) {
  const { db, ui, fmt, vaiA, parametri } = ctx;
  const oggi = new Date().toISOString().slice(0, 10);
  contenitore.innerHTML = ui.attesa('Carico la coda…');

  const { data, error } = await db.from('iam_ticket')
    .select('id,titolo,descrizione,priorita,stato,sezione,origine,segnalato_nome,risolto_nome,risolto_il,'
      + 'data_schedulazione,cliente_id,polizza_id,preventivo_id,creato_il')
    .order('creato_il', { ascending: false }).limit(2000);
  if (error) return ui.errore(contenitore, error);
  const tutte = ordina(data || [], oggi);

  /* Si arriva qui anche cliccando una riga della scrivania: in quel caso si
     apre subito quella richiesta, senza farla cercare in mezzo alle altre. */
  const scelta = (parametri && parametri.id) || '';
  if (scelta) {
    const r = tutte.find(x => String(x.id) === String(scelta));
    if (r) setTimeout(() => apri(r), 0);
  }

  let stato = { q: '', sezione: '', stato: 'aperte' };
  let mostrate = [];

  const barra = ui.filtri({
    campi: [
      { chiave: 'q', etichetta: 'Cerca', tipo: 'testo', segnaposto: 'titolo, testo, chi l\'ha aperta…' },
      { chiave: 'sezione', etichetta: 'Sezione', tipo: 'select', opzioni: [{ v: '', t: 'Tutte' }] }
    ],
    suCambio: (v) => { stato = { ...stato, ...v }; disegna(); }
  });
  barra.querySelector('.w1-f-az').appendChild(bottone('Esporta', 'ti-file-spreadsheet', () =>
    ui.esporta('richieste', [
      { testo: 'Aperta il', valore: r => r.creato_il }, { testo: 'Titolo', valore: r => r.titolo },
      { testo: 'Sezione', valore: r => r.sezione }, { testo: 'Priorità', valore: r => urgenzaDi(r).testo },
      { testo: 'Stato', valore: r => r.stato }, { testo: 'Da', valore: r => r.segnalato_nome },
      { testo: 'Giorni aperta', valore: r => (aperta(r) ? attesaGiorni(r, oggi) : '') },
      { testo: 'Risolta da', valore: r => r.risolto_nome }
    ], mostrate)));

  contenitore.innerHTML = '';
  const testa = document.createElement('div');
  contenitore.appendChild(testa);
  contenitore.appendChild(barra);
  const zona = document.createElement('div');
  contenitore.appendChild(zona);

  const sezioni = [...new Set(tutte.map(r => r.sezione).filter(Boolean))].sort();
  barra.opzioni('sezione', [{ v: '', t: 'Tutte' }, ...sezioni.map(s => ({ v: s, t: s }))]);

  disegna();

  function disegna() {
    mostrate = filtra(tutte, stato, oggi);

    testa.innerHTML = '';
    const gruppi = fasceDa(tutte, oggi);
    if (gruppi.length) {
      testa.appendChild(ui.fasce({
        voci: gruppi, scelta: stato.stato,
        suScelta: (k) => { stato.stato = (stato.stato === k ? '' : k); disegna(); }
      }));
    }

    zona.innerHTML = '';
    const tab = ui.tabella({
      colonne: [{ testo: 'Aperta', largo: '120px' }, { testo: 'Richiesta', largo: '32%' },
                { testo: 'Sezione', largo: '150px' }, { testo: 'Da', largo: '150px' },
                { testo: 'Priorità', largo: '130px' }, { testo: 'Stato', largo: '120px' }],
      righe: mostrate, vuoto: stato.stato === 'aperte' ? 'Nessuna richiesta aperta: la coda è vuota.' : 'Nessuna richiesta con questi filtri.',
      suRiga: apri,
      disegna: (r) => {
        const u = urgenzaDi(r), g = attesaGiorni(r, oggi);
        const ferma = aperta(r) && (g ?? 0) > GIORNI_FERMA;
        return `
        <td>${fmt.data(r.creato_il)}${g != null && aperta(r)
              ? `<div class="fio">${ferma ? '<b style="color:#a32b23">' : ''}da ${g} giorni${ferma ? '</b>' : ''}</div>` : ''}</td>
        <td><b>${fmt.esc(r.titolo || '(senza titolo)')}</b></td>
        <td>${fmt.esc(r.sezione || '—')}</td>
        <td>${fmt.esc(r.segnalato_nome || '—')}</td>
        <td>${ui.semafori([{ stato: u.stato, spiega: 'Priorità: ' + u.testo }])}
            <span style="margin-left:5px">${fmt.esc(u.testo)}</span></td>
        <td>${aperta(r) ? ui.badge(r.stato || 'aperta', 'attesa') : ui.badge(r.stato || 'risolta', 'ok')}</td>`;
      }
    });
    if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
    zona.insertAdjacentHTML('beforeend', ui.totali([
      { valore: mostrate.length, testo: 'richieste' },
      { valore: mostrate.filter(aperta).length, testo: 'ancora aperte' },
      { valore: mostrate.filter(r => aperta(r) && (attesaGiorni(r, oggi) ?? 0) > GIORNI_FERMA).length,
        testo: 'ferme da oltre ' + GIORNI_FERMA + ' giorni' }
    ]));
  }

  function apri(r) {
    const u = urgenzaDi(r), g = attesaGiorni(r, oggi);
    const corpo = document.createElement('div');
    corpo.innerHTML = `
      <dl class="w1-dati">
        <dt>Aperta il</dt><dd>${fmt.dataOra(r.creato_il)}${g != null ? ` <span class="fio">(${g} giorni fa)</span>` : ''}</dd>
        <dt>Da</dt><dd>${fmt.esc(r.segnalato_nome || '—')}</dd>
        <dt>Sezione</dt><dd>${fmt.esc(r.sezione || '—')}</dd>
        <dt>Arrivata da</dt><dd>${fmt.esc(r.origine || '—')}</dd>
        <dt>Priorità</dt><dd>${fmt.esc(u.testo)}</dd>
        <dt>Stato</dt><dd>${aperta(r) ? ui.badge(r.stato || 'aperta', 'attesa') : ui.badge(r.stato || 'risolta', 'ok')}</dd>
        ${r.risolto_nome ? `<dt>Risolta da</dt><dd>${fmt.esc(r.risolto_nome)} il ${fmt.data(r.risolto_il)}</dd>` : ''}
        ${r.data_schedulazione ? `<dt>Programmata per</dt><dd>${fmt.data(r.data_schedulazione)}</dd>` : ''}
      </dl>
      ${r.descrizione ? `<div style="margin-top:11px;white-space:pre-wrap">${fmt.esc(r.descrizione)}</div>` : ''}`;

    const azioni = [];
    if (r.cliente_id) azioni.push({ testo: 'Vai al cliente', fai: (n) => { n.remove(); vaiA('clienti', { id: r.cliente_id }); } });
    if (r.polizza_id) azioni.push({ testo: 'Vai alla polizza', fai: (n) => { n.remove(); vaiA('polizze', { id: r.polizza_id }); } });
    azioni.push({ testo: 'Chiudi', primario: true, fai: (n) => n.remove() });

    ui.modale({ titolo: r.titolo || 'Richiesta', corpo, azioni });
  }
}

function bottone(testo, icona, fai) {
  const b = document.createElement('button');
  b.className = 'w1-btn';
  b.innerHTML = `<i class="ti ${icona}"></i>${testo}`;
  b.addEventListener('click', fai);
  return b;
}
