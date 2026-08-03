/* ═══════════════════════════════════════════════════════════════════════════
   COLLABORATORI — chi lavora in agenzia
   ───────────────────────────────────────────────────────────────────────────
   Non è un elenco di nomi: è la mappa di CHI VEDE COSA. Il ruolo scritto in
   anagrafica e il potere che ne deriva non coincidono — «top_master» e «admin»
   valgono la stessa cosa, «operativo» non vale «operatore» — e finché questa
   differenza resta implicita si scoprono i permessi sbagliati per caso.
   Qui si mostrano affiancati: quello scritto e quello che conta davvero.

   Sola lettura, e visibile solo agli amministratori.

   Le password non compaiono da nessuna parte e non devono comparire mai: qui
   non esistono proprio, le tiene il servizio di accesso in forma cifrata.
   Un gestionale che mostra la password di un utente a un altro utente è un
   incidente che aspetta il suo giorno.
   ═══════════════════════════════════════════════════════════════════════════ */

export const meta = {
  chiave: 'utenti',
  titolo: 'Collaboratori',
  sottotitolo: 'Chi lavora in agenzia',
  icona: 'ti-id-badge-2',
  area: 'Amministrazione',
  permesso: 'admin'
};

/* ═══ LOGICA ═══════════════════════════════════════════════════════════════ */

/* La STESSA scala che applica la riservatezza del database (iam_mio_ruolo).
   Se qui si scrivesse un elenco diverso, questa pagina mostrerebbe permessi
   che il database non concede — o, peggio, non mostrerebbe quelli che concede. */
export function ruoloEffettivo(u) {
  const r = String(u && u.ruolo || '').toLowerCase();
  if (['admin', 'top_master'].includes(r)) return 'admin';
  if (['operatore', 'master'].includes(r)) return 'operatore';
  return 'collaboratore';
}

export function poteri(u) {
  const e = ruoloEffettivo(u);
  if (e === 'admin') return { testo: 'Amministratore', spiega: 'Vede e modifica tutto, compresi utenti e permessi' };
  if (e === 'operatore') return { testo: 'Ufficio', spiega: 'Vede il lavoro di tutti i collaboratori' };
  return { testo: 'Collaboratore', spiega: 'Vede solo il proprio lavoro e quello della propria rete' };
}

/* Un ruolo scritto che non corrisponde a nessuno di quelli riconosciuti
   retrocede in silenzio a «collaboratore». Silenzio è la parola sbagliata:
   va detto, perché quasi sempre è un errore di scrittura. */
export function ruoloIgnoto(u) {
  const r = String(u && u.ruolo || '').toLowerCase();
  return !!r && !['admin', 'top_master', 'operatore', 'master', 'collaboratore'].includes(r);
}

export function nomeDi(u) {
  const n = [u.nome, u.cognome].filter(Boolean).join(' ').trim();
  return n || (u.email || '').split('@')[0] || '(senza nome)';
}

export function filtra(righe, f = {}) {
  const q = String(f.q || '').trim().toLowerCase();
  return (righe || []).filter(u => {
    if (f.gruppo === 'attivi' && u.attivo === false) return false;
    if (f.gruppo === 'sospesi' && u.attivo !== false) return false;
    if (f.gruppo === 'admin' && ruoloEffettivo(u) !== 'admin') return false;
    if (f.gruppo === 'strani' && !ruoloIgnoto(u)) return false;
    if (f.rete && (u.rete || '') !== f.rete) return false;
    if (!q) return true;
    return [nomeDi(u), u.email, u.ruolo, u.rete].some(v => String(v ?? '').toLowerCase().includes(q));
  });
}

export function fasceDa(righe) {
  const n = (g) => filtra(righe, { gruppo: g }).length;
  return [
    { chiave: '', testo: 'Tutti', n: (righe || []).length, urgenza: null },
    { chiave: 'attivi', testo: 'Attivi', n: n('attivi'), urgenza: null },
    { chiave: 'sospesi', testo: 'Sospesi', n: n('sospesi'), urgenza: 'media' },
    { chiave: 'admin', testo: 'Amministratori', n: n('admin'), urgenza: null },
    { chiave: 'strani', testo: 'Ruolo non riconosciuto', n: n('strani'), urgenza: 'alta' }
  ].filter(f => f.chiave === '' || f.n > 0);
}

/* ═══ PAGINA ═══════════════════════════════════════════════════════════════ */

export async function monta(contenitore, ctx) {
  const { db, ui, fmt, utente } = ctx;
  contenitore.innerHTML = ui.attesa('Carico i collaboratori…');

  const { data, error } = await db.from('iam_utenti')
    .select('id,email,nome,cognome,ruolo,attivo,rete,responsabile,accesso_iam,accesso_quoto,creato_il')
    .order('cognome', { ascending: true }).limit(1000);
  if (error) return ui.errore(contenitore, error);
  const tutti = data || [];

  let stato = { q: '', rete: '', gruppo: '' };
  let mostrate = [];

  const barra = ui.filtri({
    campi: [
      { chiave: 'q', etichetta: 'Cerca', tipo: 'testo', segnaposto: 'nome, email, ruolo…' },
      { chiave: 'rete', etichetta: 'Rete', tipo: 'select', opzioni: [{ v: '', t: 'Tutte' }] }
    ],
    suCambio: (v) => { stato = { ...stato, ...v }; disegna(); }
  });
  barra.querySelector('.w1-f-az').appendChild(bottone('Esporta', 'ti-file-spreadsheet', () =>
    ui.esporta('collaboratori', [
      { testo: 'Nome', valore: nomeDi }, { testo: 'Email', valore: u => u.email },
      { testo: 'Ruolo scritto', valore: u => u.ruolo }, { testo: 'Vale come', valore: u => poteri(u).testo },
      { testo: 'Attivo', valore: u => (u.attivo === false ? 'no' : 'si') },
      { testo: 'Rete', valore: u => u.rete }, { testo: 'Responsabile', valore: u => u.responsabile }
    ], mostrate)));

  contenitore.innerHTML = '';
  const testa = document.createElement('div');
  contenitore.appendChild(testa);
  contenitore.appendChild(barra);
  const zona = document.createElement('div');
  contenitore.appendChild(zona);

  const reti = [...new Set(tutti.map(u => u.rete).filter(Boolean))].sort();
  barra.opzioni('rete', [{ v: '', t: 'Tutte' }, ...reti.map(r => ({ v: r, t: r }))]);

  disegna();

  function disegna() {
    mostrate = filtra(tutti, stato);

    testa.innerHTML = '';
    testa.appendChild(ui.fasce({
      voci: fasceDa(tutti), scelta: stato.gruppo,
      suScelta: (k) => { stato.gruppo = (stato.gruppo === k ? '' : k); disegna(); }
    }));

    zona.innerHTML = '';
    const tab = ui.tabella({
      colonne: [{ testo: 'Collaboratore', largo: '24%' }, { testo: 'Ruolo scritto', largo: '150px' },
                { testo: 'Vale come', largo: '210px' }, { testo: 'Rete', largo: '150px' },
                { testo: 'Accessi', largo: '150px' }, { testo: 'Stato', largo: '110px' }],
      righe: mostrate, vuoto: 'Nessun collaboratore con questi filtri.',
      disegna: (u) => {
        const p = poteri(u);
        const accessi = [u.accesso_iam !== false ? 'gestionale' : null, u.accesso_quoto !== false ? 'preventivi' : null]
          .filter(Boolean);
        return `
        <td><b>${fmt.esc(nomeDi(u))}</b>${u.id === utente.id ? ' ' + ui.badge('sei tu', 'neutro') : ''}
            <div class="fio">${fmt.esc(u.email || '')}</div></td>
        <td>${fmt.esc(u.ruolo || '—')}${ruoloIgnoto(u) ? ' ' + ui.badge('non riconosciuto', 'male') : ''}</td>
        <td>${ui.semafori([{ stato: ruoloEffettivo(u) === 'admin' ? 'ok' : 'attesa', spiega: p.spiega }])}
            <span style="margin-left:5px">${fmt.esc(p.testo)}</span>
            <div class="fio">${fmt.esc(p.spiega)}</div></td>
        <td>${fmt.esc(u.rete || '—')}${u.responsabile ? `<div class="fio">capo: ${fmt.esc(u.responsabile)}</div>` : ''}</td>
        <td>${accessi.length ? fmt.esc(accessi.join(', ')) : '<span class="fio">nessuno</span>'}</td>
        <td>${u.attivo === false ? ui.badge('sospeso', 'male') : ui.badge('attivo', 'ok')}</td>`;
      }
    });
    if (typeof tab === 'string') zona.innerHTML = tab; else zona.appendChild(tab);
    zona.insertAdjacentHTML('beforeend', ui.totali([
      { valore: mostrate.length, testo: 'collaboratori' },
      { valore: mostrate.filter(u => u.attivo !== false).length, testo: 'attivi' },
      { valore: mostrate.filter(u => ruoloEffettivo(u) === 'admin').length, testo: 'con poteri di amministratore' },
      { valore: mostrate.filter(ruoloIgnoto).length, testo: 'con un ruolo scritto male' }
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
