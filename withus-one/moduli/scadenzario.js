/* ═══════════════════════════════════════════════════════════════════════════
   SCADENZARIO — chi scade, e quando
   ───────────────────────────────────────────────────────────────────────────
   È l'elenco su cui si telefona. Perciò non è ordinato per cliente né per
   compagnia, ma per QUANTO MANCA: in cima ciò che è già scaduto, poi ciò che
   scade fra pochi giorni. E ogni riga dice a che punto è il rinnovo, perché
   richiamare un cliente già rinnovato fa perdere la faccia.

   Sola lettura.
   ═══════════════════════════════════════════════════════════════════════════ */
import { giorni } from '../nucleo/formato.js';
import { numeroDi } from './polizze.js';

export const meta = {
  chiave: 'scadenzario',
  titolo: 'Scadenzario',
  sottotitolo: 'Chi scade, e quando',
  icona: 'ti-calendar-event',
  area: 'Portafoglio',
  permesso: null
};

/* ═══ LOGICA ═══════════════════════════════════════════════════════════════ */

/* Le fasce sono quelle con cui si lavora al telefono: prima si recupera lo
   scaduto, poi si prepara l'imminente, poi si guarda avanti. */
export const FASCE = [
  { chiave: 'scadute', testo: 'Già scadute',    urgenza: 'alta',  da: -Infinity, a: -1 },
  { chiave: 'sette',   testo: 'Entro 7 giorni', urgenza: 'alta',  da: 0,  a: 7 },
  { chiave: 'trenta',  testo: 'Entro 30 giorni', urgenza: 'media', da: 8,  a: 30 },
  { chiave: 'sessanta', testo: 'Entro 60 giorni', urgenza: null,  da: 31, a: 60 },
  { chiave: 'novanta', testo: 'Entro 90 giorni', urgenza: null,   da: 61, a: 90 }
];

export function fasciaDi(g) {
  if (g == null) return null;
  const f = FASCE.find(x => g >= x.da && g <= x.a);
  return f ? f.chiave : null;
}

/* Prepara le righe: aggiunge i giorni mancanti e lo stato del rinnovo, e butta
   fuori ciò che non è più lavorabile (annullate, senza scadenza, oltre 90
   giorni, scadute da più di sei mesi). */
export function prepara(righe, oggi) {
  return (righe || []).map(p => {
    const g = giorni(p.data_scadenza, oggi);
    return { ...p, giorni: g, fascia: fasciaDi(g), rinnovo: rinnovoDi(p) };
  }).filter(p => p.fascia && p.giorni >= -180 && (p.stato_pagamento || '') !== 'annullata')
    .sort((a, b) => a.giorni - b.giorni);
}

/* A che punto è il rinnovo. Sono i soli tre casi che si possono affermare
   guardando i dati: il resto sarebbe un'ipotesi travestita da informazione. */
export function rinnovoDi(p) {
  if (Number(p.sostituzioni) > 0) return { stato: 'ok', testo: 'già rinnovata' };
  if (p.tacito_rinnovo) return { stato: 'attesa', testo: 'tacito rinnovo' };
  return { stato: 'male', testo: 'da rinnovare' };
}

export function raggruppa(righe) {
  return FASCE.map(f => ({
    chiave: f.chiave, testo: f.testo, urgenza: f.urgenza,
    n: righe.filter(r => r.fascia === f.chiave).length,
    importo: somma(righe.filter(r => r.fascia === f.chiave))
  })).filter(f => f.n > 0);
}

function somma(righe) {
  const t = righe.reduce((s, r) => s + (Number(r.premio_annuo) || 0), 0);
  return t > 0 ? t : null;
}

/* ═══ PAGINA ═══════════════════════════════════════════════════════════════ */

export async function monta(contenitore, ctx) {
  const { db, ui, fmt, vaiA } = ctx;
  const oggi = new Date().toISOString().slice(0, 10);
  contenitore.innerHTML = ui.attesa('Cerco le scadenze…');

  /* Si legge la vista quote_scadenzario, che conta già le sostituzioni: farlo
     qui costerebbe una richiesta per ogni riga. Il nome del cliente non c'è
     nella vista, quindi si prende dalla tabella con una seconda lettura. */
  const [vista, polizze] = await Promise.all([
    db.from('quote_scadenzario').select('*').not('data_scadenza', 'is', null).limit(3000),
    db.from('quote_polizze').select('id,cliente,cliente_id,numero_polizza,frazionamento').limit(3000)
  ]);
  if (vista.error) return ui.errore(contenitore, vista.error);

  const nomi = new Map((polizze.data || []).map(p => [p.id, p]));
  const tutte = prepara((vista.data || []).map(p => ({ ...p, ...(nomi.get(p.id) || {}) })), oggi);

  let stato = { fascia: '', q: '', compagnia: '' };
  let mostrate = [];

  const barra = ui.filtri({
    campi: [
      { chiave: 'q', etichetta: 'Cerca', tipo: 'testo', segnaposto: 'cliente, prodotto, numero…' },
      { chiave: 'compagnia', etichetta: 'Compagnia', tipo: 'select', opzioni: [{ v: '', t: 'Tutte' }] }
    ],
    suCambio: (v) => { stato = { ...stato, ...v }; disegna(); }
  });
  barra.querySelector('.w1-f-az').appendChild(bottone('Esporta', 'ti-file-spreadsheet', () =>
    ui.esporta('scadenzario', [
      { testo: 'Giorni', valore: p => p.giorni }, { testo: 'Scadenza', valore: p => p.data_scadenza },
      { testo: 'Cliente', valore: p => p.cliente },
      { testo: 'Numero polizza', valore: p => numeroDi(p) || '' }, { testo: 'N. pratica', valore: p => p.numero },
      { testo: 'Prodotto', valore: p => p.prodotto || p.modulo }, { testo: 'Compagnia', valore: p => p.compagnia },
      { testo: 'Premio annuo', valore: p => p.premio_annuo }, { testo: 'Rinnovo', valore: p => p.rinnovo.testo }
    ], mostrate)));

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
    const q = stato.q.trim().toLowerCase();
    mostrate = tutte.filter(p =>
      (!stato.fascia || p.fascia === stato.fascia) &&
      (!stato.compagnia || p.compagnia === stato.compagnia) &&
      (!q || [p.cliente, p.prodotto, p.modulo, p.numero_polizza, p.numero]
        .some(v => String(v ?? '').toLowerCase().includes(q))));

    testa.innerHTML = '';
    const gruppi = raggruppa(tutte);
    if (!gruppi.length) {
      testa.innerHTML = '<div class="w1-card"><div class="dentro"><b>Nessuna scadenza nei prossimi 90 giorni.</b> '
        + 'Ricontrolla quando saranno registrate nuove polizze.</div></div>';
    } else {
      testa.appendChild(ui.fasce({
        voci: gruppi, scelta: stato.fascia,
        suScelta: (k) => { stato.fascia = (stato.fascia === k ? '' : k); disegna(); }
      }));
    }

    zona.innerHTML = '';
    const tab = ui.tabella({
      colonne: [{ testo: 'Quando', largo: '130px' }, { testo: 'Scadenza', largo: '105px' },
                { testo: 'Cliente', largo: '22%' }, { testo: 'Prodotto' },
                { testo: 'Rinnovo', largo: '130px' }, { testo: 'Premio', largo: '110px' }],
      righe: mostrate, vuoto: 'Nessuna scadenza con questi filtri.',
      suRiga: (p) => vaiA('polizze', { id: p.id }),
      disegna: (p) => `
        <td>${p.giorni < 0 ? ui.badge(frase(p.giorni), 'male')
              : p.giorni <= 7 ? ui.badge(frase(p.giorni), 'attesa') : fmt.esc(frase(p.giorni))}</td>
        <td>${fmt.data(p.data_scadenza)}</td>
        <td><b>${fmt.esc(p.cliente || 'Cliente non indicato')}</b></td>
        <td>${fmt.esc([p.prodotto || p.modulo, p.compagnia].filter(Boolean).join(' · '))}</td>
        <td>${ui.semafori([{ stato: p.rinnovo.stato, spiega: 'Rinnovo: ' + p.rinnovo.testo }])}
            <span style="margin-left:5px">${fmt.esc(p.rinnovo.testo)}</span></td>
        <td class="num">${fmt.euro(p.premio_annuo)}</td>`
    });
    if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
    zona.insertAdjacentHTML('beforeend', ui.totali([
      { valore: mostrate.length, testo: 'in scadenza' },
      { valore: mostrate.filter(p => p.giorni < 0).length, testo: 'già scadute' },
      { valore: fmt.euro(mostrate.reduce((s, p) => s + (Number(p.premio_annuo) || 0), 0)), testo: 'di premio in gioco' },
      { valore: mostrate.filter(p => p.rinnovo.stato === 'ok').length, testo: 'già rinnovate' }
    ]));
  }
}

function frase(g) {
  if (g === 0) return 'scade oggi';
  if (g > 0) return 'fra ' + g + (g === 1 ? ' giorno' : ' giorni');
  const a = Math.abs(g);
  return 'scaduta da ' + a + (a === 1 ? ' giorno' : ' giorni');
}

function bottone(testo, icona, fai) {
  const b = document.createElement('button');
  b.className = 'w1-btn';
  b.innerHTML = `<i class="ti ${icona}"></i>${testo}`;
  b.addEventListener('click', fai);
  return b;
}
