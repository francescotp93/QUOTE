/* ═══════════════════════════════════════════════════════════════════════════
   PREVENTIVI — le quotazioni salvate
   ───────────────────────────────────────────────────────────────────────────
   Un preventivo serve finché è vivo. Passate certe settimane le tariffe
   cambiano e riproporlo così com'è significa promettere un prezzo che non
   esiste più. Per questo ogni riga dice quanti giorni ha e quali sono state
   trasformate in polizza: il resto è lavoro lasciato a metà, ed è lì che si
   perdono i soldi.

   Sola lettura.
   ═══════════════════════════════════════════════════════════════════════════ */
import { giorni } from '../nucleo/formato.js';

export const meta = {
  chiave: 'preventivi',
  titolo: 'Preventivi',
  sottotitolo: 'Le quotazioni salvate',
  icona: 'ti-file-text',
  area: 'Preventivi',
  permesso: null
};

/* ═══ LOGICA ═══════════════════════════════════════════════════════════════ */

/* Dopo quanti giorni un preventivo non si ripropone più senza rifare i conti.
   Trenta giorni è la durata con cui lavorano le compagnie sulle quotazioni
   auto; se un giorno arriverà una regola ufficiale diversa, si cambia qui. */
export const GIORNI_VALIDITA = 30;

export function eta(p, oggi) {
  const g = giorni(p.creato_il, oggi);
  return g == null ? null : Math.abs(g);
}

export function statoDi(p, oggi) {
  if (p.polizza_emessa) return { chiave: 'emesso', stato: 'ok', testo: 'diventato polizza' };
  const e = eta(p, oggi);
  if (e != null && e > GIORNI_VALIDITA) return { chiave: 'vecchio', stato: 'spento', testo: 'da riquotare' };
  return { chiave: 'aperto', stato: 'attesa', testo: 'in lavorazione' };
}

export function filtra(righe, f = {}, oggi) {
  const q = String(f.q || '').trim().toLowerCase();
  return (righe || []).filter(p => {
    if (f.stato && statoDi(p, oggi).chiave !== f.stato) return false;
    if (f.compagnia && (p.compagnia || '') !== f.compagnia) return false;
    if (f.prodotto && p.prodotto_id !== f.prodotto) return false;
    if (f.cliente && p.cliente_id !== f.cliente) return false;
    if (!q) return true;
    return [p.cliente, p.prodotto, p.modulo, p.compagnia, p.numero, p.creato_nome]
      .some(v => String(v ?? '').toLowerCase().includes(q));
  });
}

export function fasceDa(righe, oggi) {
  const n = (s) => righe.filter(p => statoDi(p, oggi).chiave === s);
  const soldi = (l) => { const t = l.reduce((s, p) => s + (Number(p.premio) || 0), 0); return t > 0 ? t : null; };
  const voci = [
    { chiave: '', testo: 'Tutti', n: (righe || []).length, importo: soldi(righe || []), urgenza: null },
    { chiave: 'aperto', testo: 'In lavorazione', n: n('aperto').length, importo: soldi(n('aperto')), urgenza: 'media' },
    { chiave: 'vecchio', testo: 'Da riquotare', n: n('vecchio').length, importo: soldi(n('vecchio')), urgenza: 'alta' },
    { chiave: 'emesso', testo: 'Diventati polizza', n: n('emesso').length, importo: soldi(n('emesso')), urgenza: null }
  ];
  return voci.filter(v => v.chiave === '' || v.n > 0);
}

/* Quanti preventivi si trasformano in polizza. È l'unico numero che dice se il
   lavoro di quotazione sta rendendo. Senza preventivi non è «zero per cento»:
   è una percentuale che non esiste, e mostrare 0% sarebbe scoraggiante e falso. */
export function resa(righe) {
  const tot = (righe || []).length;
  if (!tot) return null;
  return Math.round((righe.filter(p => p.polizza_emessa).length / tot) * 100);
}

/* ═══ PAGINA ═══════════════════════════════════════════════════════════════ */

export async function monta(contenitore, ctx) {
  const { db, ui, fmt, vaiA, parametri } = ctx;
  const oggi = new Date().toISOString().slice(0, 10);
  contenitore.innerHTML = ui.attesa('Carico i preventivi…');

  const { data, error } = await db.from('quote_preventivi')
    .select('id,numero,modulo,prodotto,prodotto_id,compagnia,premio,cliente,cliente_id,stato,polizza_emessa,polizza_il,creato_nome,creato_il')
    .order('creato_il', { ascending: false }).limit(3000);
  if (error) return ui.errore(contenitore, error);
  const tutti = data || [];

  let stato = {
    q: '', compagnia: '', stato: '',
    prodotto: (parametri && parametri.prodotto) || '',
    cliente: (parametri && parametri.cliente) || ''
  };
  let mostrate = [];

  const barra = ui.filtri({
    campi: [
      { chiave: 'q', etichetta: 'Cerca', tipo: 'testo', segnaposto: 'cliente, prodotto, chi l\'ha fatto…' },
      { chiave: 'compagnia', etichetta: 'Compagnia', tipo: 'select', opzioni: [{ v: '', t: 'Tutte' }] }
    ],
    suCambio: (v) => { stato = { ...stato, ...v }; disegna(); }
  });
  barra.querySelector('.w1-f-az').appendChild(bottone('Esporta', 'ti-file-spreadsheet', () =>
    ui.esporta('preventivi', [
      { testo: 'Numero', valore: p => p.numero }, { testo: 'Quando', valore: p => p.creato_il },
      { testo: 'Cliente', valore: p => p.cliente }, { testo: 'Prodotto', valore: p => p.prodotto || p.modulo },
      { testo: 'Compagnia', valore: p => p.compagnia }, { testo: 'Premio', valore: p => p.premio },
      { testo: 'Stato', valore: p => statoDi(p, oggi).testo }, { testo: 'Fatto da', valore: p => p.creato_nome }
    ], mostrate)));

  contenitore.innerHTML = '';
  const testa = document.createElement('div');
  contenitore.appendChild(testa);
  contenitore.appendChild(barra);
  const zona = document.createElement('div');
  contenitore.appendChild(zona);

  const compagnie = [...new Set(tutti.map(p => p.compagnia).filter(Boolean))].sort();
  barra.opzioni('compagnia', [{ v: '', t: 'Tutte' }, ...compagnie.map(c => ({ v: c, t: c }))]);

  disegna();

  function disegna() {
    mostrate = filtra(tutti, stato, oggi);

    testa.innerHTML = '';
    testa.appendChild(ui.fasce({
      voci: fasceDa(tutti, oggi), scelta: stato.stato,
      suScelta: (k) => { stato.stato = (stato.stato === k ? '' : k); disegna(); }
    }));
    if (stato.prodotto || stato.cliente) {
      const avviso = document.createElement('div');
      avviso.className = 'w1-totali';
      avviso.style.borderRadius = 'var(--w1-raggio)';
      avviso.innerHTML = '<span>Elenco ristretto a quanto arrivava dalla pagina precedente.</span>';
      const b = bottone('Mostra tutti', 'ti-x', () => { stato.prodotto = ''; stato.cliente = ''; disegna(); });
      b.style.height = '22px';
      avviso.appendChild(b);
      testa.appendChild(avviso);
    }

    zona.innerHTML = '';
    const tab = ui.tabella({
      colonne: [{ testo: 'Quando', largo: '120px' }, { testo: 'Cliente', largo: '22%' },
                { testo: 'Prodotto' }, { testo: 'Fatto da', largo: '150px' },
                { testo: 'Stato', largo: '170px' }, { testo: 'Premio', largo: '110px' }],
      righe: mostrate, vuoto: 'Nessun preventivo con questi filtri.',
      suRiga: (p) => (p.cliente_id ? vaiA('clienti', { id: p.cliente_id }) : null),
      disegna: (p) => {
        const s = statoDi(p, oggi), e = eta(p, oggi);
        return `
        <td>${fmt.data(p.creato_il)}${e != null ? `<div class="fio">${e} giorni fa</div>` : ''}</td>
        <td><b>${fmt.esc(p.cliente || 'Cliente non indicato')}</b></td>
        <td>${fmt.esc([p.prodotto || p.modulo, p.compagnia].filter(Boolean).join(' · '))}</td>
        <td>${fmt.esc(p.creato_nome || '—')}</td>
        <td>${ui.semafori([{ stato: s.stato, spiega: 'Preventivo: ' + s.testo }])}
            <span style="margin-left:5px">${fmt.esc(s.testo)}</span></td>
        <td class="num">${fmt.euro(p.premio)}</td>`;
      }
    });
    if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);

    const r = resa(mostrate);
    zona.insertAdjacentHTML('beforeend', ui.totali([
      { valore: mostrate.length, testo: 'preventivi' },
      { valore: fmt.euro(mostrate.reduce((s, p) => s + (Number(p.premio) || 0), 0)), testo: 'di premio quotato' },
      r == null ? null : { valore: r + '%', testo: 'trasformati in polizza' },
      { valore: mostrate.filter(p => statoDi(p, oggi).chiave === 'vecchio').length, testo: 'da riquotare' }
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
