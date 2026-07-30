/* ═══════════════════════════════════════════════════════════════════════════
   SCRIVANIA — il lavoro di oggi
   ───────────────────────────────────────────────────────────────────────────
   MODULO DI RIFERIMENTO: chi ne scrive uno nuovo copia la forma di questo.
   Vedi CONTRATTO.md.

   Che cosa fa: mette in una sola lista tutto ciò che oggi chiede una mano —
   soldi non incassati, polizze che scadono, documenti che mancano, richieste
   aperte. Non è un cruscotto di numeri: è un elenco di cose da fare, ognuna
   con il tasto per andare dove si risolve.

   Sola lettura: da qui non si scrive niente.
   ═══════════════════════════════════════════════════════════════════════════ */

import { giorni } from '../nucleo/formato.js';

export const meta = {
  chiave: 'scrivania',
  titolo: 'Scrivania',
  sottotitolo: 'Il lavoro di oggi',
  icona: 'ti-home',
  area: 'Scrivania',
  permesso: null
};

/* Quante cose si guardano indietro. Oltre i tre mesi una polizza scaduta non è
   più «da rinnovare», è persa: continuare a mostrarla sporca l'elenco e basta. */
const GIORNI_INDIETRO = 90;
/* Quanto si guarda avanti: un mese è il tempo con cui si lavora un rinnovo. */
const GIORNI_AVANTI = 30;

/* ═══ LA LOGICA ═════════════════════════════════════════════════════════════
   Funzioni pure, senza database e senza pagina: si possono provare da sole
   (verifica/scrivania.test.mjs). Tutto ciò che decide COSA si vede sta qui.

   Il conteggio dei giorni si prende da nucleo/formato.js e non si riscrive:
   due conti diversi per «quanto manca» darebbero due risposte diverse alla
   stessa domanda nella stessa pagina. */

/* Trasforma le quattro fonti in un unico elenco di cose da fare.
   `oggi` si passa da fuori: una funzione che legge l'orologio da sola non si
   può provare, perché il risultato cambia ogni giorno. */
export function componi({ titoli = [], polizze = [], documenti = [], ticket = [] }, oggi) {
  const voci = [];

  for (const t of titoli) {
    const p = t.polizza || {};
    const chi = p.cliente || 'Cliente non indicato';
    const g = giorni(t.data_scadenza, oggi);
    const dove = { chiave: 'titoli', parametri: { polizza: t.polizza_id } };

    if (t.stato === 'insoluto') {
      voci.push({ genere: 'insoluto', urgenza: 'alta', giorni: g, importo: num(t.importo_lordo),
        titolo: 'Insoluto da recuperare', sotto: chi + ' · ' + (p.prodotto || 'polizza'), apri: dove });
    } else if (t.stato === 'aperto' && g != null && g <= 0) {
      voci.push({ genere: 'rata_scaduta', urgenza: 'alta', giorni: g, importo: num(t.importo_lordo),
        titolo: 'Rata da incassare', sotto: chi + ' · ' + (p.prodotto || 'polizza'), apri: dove });
    } else if (t.stato === 'aperto' && g != null && g <= 7) {
      voci.push({ genere: 'rata_vicina', urgenza: 'media', giorni: g, importo: num(t.importo_lordo),
        titolo: 'Rata in scadenza', sotto: chi + ' · ' + (p.prodotto || 'polizza'), apri: dove });
    }
  }

  for (const p of polizze) {
    const g = giorni(p.data_scadenza, oggi);
    if (g == null) continue;                      // scadenza da confermare: non è un ritardo
    if (g < -GIORNI_INDIETRO || g > GIORNI_AVANTI) continue;
    /* Una polizza già sostituita da un'altra è stata rinnovata: non va rifatta.
       `sostituzioni` lo dice contando chi la indica come precedente. */
    if (Number(p.sostituzioni) > 0) continue;
    const chi = p.cliente || 'Cliente non indicato';
    voci.push({
      genere: g < 0 ? 'polizza_scaduta' : 'polizza_scade',
      urgenza: g < 0 ? 'alta' : 'media',
      giorni: g,
      importo: num(p.premio_annuo),
      titolo: g < 0 ? 'Polizza scaduta, da rinnovare' : 'Polizza in scadenza',
      sotto: chi + ' · ' + (p.prodotto || p.modulo || 'polizza') + (p.compagnia ? ' · ' + p.compagnia : ''),
      apri: { chiave: 'polizze', parametri: { id: p.id } }
    });
  }

  for (const d of documenti) {
    /* Solo gli obbligatori mancanti: un documento facoltativo che manca non è
       un lavoro da fare, e finirebbe per nascondere quelli veri. */
    if (!d.obbligatorio || d.url) continue;
    /* Il nome del cliente e il prodotto arrivano da leggi(). Senza, la riga
       direbbe «Pratica 3f2a1b9c» e nessuno saprebbe a chi telefonare: era
       cosi' fino al 30/07/2026, ed erano un quarto delle righe. */
    const p = d.polizza || {};
    voci.push({ genere: 'documento', urgenza: 'media', giorni: null, importo: null,
      titolo: 'Documento mancante: ' + (d.nome || d.categoria || 'da acquisire'),
      sotto: p.cliente
        ? p.cliente + (p.prodotto ? ' · ' + p.prodotto : '')
        : 'Cliente non indicato · pratica non leggibile',
      apri: { chiave: 'polizze', parametri: { id: d.entita_id } } });
  }

  for (const k of ticket) {
    const urgente = /alta|urgente|critic/i.test(String(k.priorita || ''));
    voci.push({ genere: 'richiesta', urgenza: urgente ? 'alta' : 'media', giorni: giorni(k.data_schedulazione, oggi),
      importo: null, titolo: 'Richiesta: ' + (k.titolo || 'senza titolo'),
      sotto: (k.segnalato_nome || 'ufficio') + ' · ' + (k.stato || 'aperta'),
      apri: { chiave: 'richieste', parametri: { id: k.id } } });
  }

  /* Prima l'urgente, poi il più in ritardo. Le voci senza data (documenti,
     richieste non programmate) vanno in fondo al loro gruppo: non hanno un
     ritardo da confrontare, e metterle in cima le farebbe sembrare scadute. */
  const peso = { alta: 0, media: 1 };
  return voci.sort((a, b) =>
    (peso[a.urgenza] ?? 9) - (peso[b.urgenza] ?? 9) ||
    (a.giorni == null ? 1 : 0) - (b.giorni == null ? 1 : 0) ||
    (a.giorni ?? 0) - (b.giorni ?? 0));
}

/* Le fasce in cima: quante cose per tipo e per quanti soldi.
   Le voci a zero non si mostrano (CONTRATTO §2.7): un elenco pieno di zeri
   fa credere che non ci sia niente da fare proprio quando c'è. */
export function fasceDa(voci) {
  const gruppi = [
    { chiave: 'insoluto',        testo: 'Insoluti',            urgenza: 'alta',  generi: ['insoluto'] },
    { chiave: 'rate',            testo: 'Rate da incassare',   urgenza: 'alta',  generi: ['rata_scaduta', 'rata_vicina'] },
    { chiave: 'polizze_scadute', testo: 'Scadute da rinnovare', urgenza: 'alta', generi: ['polizza_scaduta'] },
    { chiave: 'polizze',         testo: 'In scadenza a 30 gg', urgenza: 'media', generi: ['polizza_scade'] },
    { chiave: 'documenti',       testo: 'Documenti mancanti',  urgenza: 'media', generi: ['documento'] },
    { chiave: 'richieste',       testo: 'Richieste aperte',    urgenza: null,    generi: ['richiesta'] }
  ];
  const fatte = gruppi.map(g => {
    const mie = voci.filter(v => g.generi.includes(v.genere));
    const soldi = mie.reduce((s, v) => s + (v.importo || 0), 0);
    return { chiave: g.chiave, testo: g.testo, urgenza: g.urgenza, n: mie.length,
             importo: soldi > 0 ? soldi : null, generi: g.generi };
  }).filter(f => f.n > 0);
  return fatte;
}

/* ═══ LA PAGINA ═════════════════════════════════════════════════════════════ */

let statoFiltro = null;   // quale fascia è selezionata; null = tutte

export async function monta(contenitore, ctx) {
  const { db, utente, ui, fmt, vaiA } = ctx;
  const oggi = new Date().toISOString().slice(0, 10);

  contenitore.innerHTML = ui.attesa('Raccolgo il lavoro di oggi…');

  let fonti;
  try {
    fonti = await leggi(db, utente, oggi);
  } catch (e) {
    ui.errore(contenitore, e);
    return;
  }

  const voci = componi(fonti, oggi);
  disegna();

  function disegna() {
    const mostrate = filtra(voci, statoFiltro);
    contenitore.innerHTML = `
      <div id="s-fasce"></div>
      <div class="w1-card" style="margin-bottom:0">
        <h2><i class="ti ti-checklist"></i>Da fare oggi
          <span class="az" id="s-az"></span></h2>
      </div>
      <div id="s-lista"></div>`;

    const fasce = fasceDa(voci);
    const box = contenitore.querySelector('#s-fasce');
    if (!fasce.length) {
      box.innerHTML = '<div class="w1-card"><div class="dentro"><b>Niente in sospeso.</b> '
        + 'Nessun insoluto, nessuna scadenza entro 30 giorni, nessun documento obbligatorio mancante.</div></div>';
    } else {
      box.appendChild(ui.fasce({
        voci: fasce, scelta: statoFiltro,
        suScelta: (k) => { statoFiltro = (statoFiltro === k ? null : k); disegna(); }
      }));
    }

    const colonne = [
      { testo: 'Che cosa', largo: '30%' },
      { testo: 'Chi / dove' },
      { testo: 'Quando', largo: '120px' },
      { testo: 'Importo', largo: '110px' }
    ];
    const lista = contenitore.querySelector('#s-lista');
    const tab = ui.tabella({
      colonne, righe: mostrate,
      vuoto: statoFiltro ? 'Niente in questa fascia.' : 'Nessuna cosa da fare in questo momento.',
      suRiga: (v) => vaiA(v.apri.chiave, v.apri.parametri),
      disegna: (v) => `
        <td>${ui.semafori([{ stato: v.urgenza === 'alta' ? 'male' : 'attesa',
                             spiega: v.urgenza === 'alta' ? 'Urgente: è già in ritardo' : 'Da fare a breve' }])}
            <b style="margin-left:5px">${fmt.esc(v.titolo)}</b></td>
        <td>${fmt.esc(v.sotto)}</td>
        <td>${v.giorni == null ? '<span class="fio">—</span>'
              : `<span class="${v.giorni < 0 ? 'w1-badge w1-b-male' : ''}">${fmt.esc(frase(v.giorni))}</span>`}</td>
        <td class="num">${v.importo == null ? '<span class="fio">—</span>' : fmt.euro(v.importo)}</td>`
    });
    if (typeof tab === 'string') lista.innerHTML = tab; else lista.appendChild(tab);

    lista.insertAdjacentHTML('beforeend', ui.totali([
      { valore: mostrate.length, testo: 'cose da fare' },
      { valore: mostrate.filter(v => v.urgenza === 'alta').length, testo: 'urgenti' },
      { valore: fmt.euro(mostrate.reduce((s, v) => s + (v.importo || 0), 0)), testo: 'di importo coinvolto' }
    ]));
    if (fonti.tagliate && fonti.tagliate.length) {
      lista.insertAdjacentHTML('beforeend',
        `<div class="w1-errore" style="margin-top:10px"><b>Elenco parziale.</b> Ci sono piu'
         ${fmt.esc(fonti.tagliate.join(' e '))} di quante se ne possano mostrare qui: i totali
         qui sopra contano solo quello che vedi. Per l'elenco completo usa le pagine dedicate.</div>`);
    }

    const az = contenitore.querySelector('#s-az');
    const b = document.createElement('button');
    b.className = 'w1-btn';
    b.innerHTML = '<i class="ti ti-file-spreadsheet"></i>Esporta';
    b.addEventListener('click', () => ui.esporta('da_fare_oggi', [
      { testo: 'Che cosa', valore: v => v.titolo },
      { testo: 'Chi / dove', valore: v => v.sotto },
      { testo: 'Urgenza', valore: v => v.urgenza },
      { testo: 'Giorni', valore: v => (v.giorni == null ? '' : v.giorni) },
      { testo: 'Importo', valore: v => (v.importo == null ? '' : v.importo) }
    ], mostrate));
    az.appendChild(b);
  }
}

export function smonta() { statoFiltro = null; }

/* Il filtro delle fasce: si tiene fuori dalla pagina così si può provare. */
export function filtra(voci, chiaveFascia) {
  if (!chiaveFascia) return voci;
  const f = fasceDa(voci).find(x => x.chiave === chiaveFascia);
  if (!f) return voci;
  return voci.filter(v => f.generi.includes(v.genere));
}

function frase(g) {
  if (g === 0) return 'oggi';
  if (g > 0) return 'fra ' + g + (g === 1 ? ' giorno' : ' giorni');
  const a = Math.abs(g);
  return 'da ' + a + (a === 1 ? ' giorno' : ' giorni');
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ── Lettura ────────────────────────────────────────────────────────────────
   Quattro richieste in parallelo, non in fila: in fila la pagina apparirebbe
   con il tempo della somma. La riservatezza del database (RLS) fa già vedere
   a ciascuno solo il suo: qui non si filtra per utente, altrimenti si
   scriverebbe una seconda regola destinata a divergere dalla prima. */
const TETTO = { titoli: 400, polizze: 400, documenti: 200, ticket: 200 };

async function leggi(db, utente, oggi) {
  const limite = new Date(Date.parse(oggi) - GIORNI_INDIETRO * 86400000).toISOString().slice(0, 10);
  const avanti = new Date(Date.parse(oggi) + GIORNI_AVANTI * 86400000).toISOString().slice(0, 10);
  /* Le rate aperte oltre una settimana non entrano comunque nell'elenco: se non
     si escludono qui riempiono il tetto di righe destinate a essere buttate, e
     spingono fuori gli insoluti veri. E senza un ordine, quali righe arrivino
     non e' nemmeno stabilito: si chiedono le piu' in ritardo per prime. */
  const settimana = new Date(Date.parse(oggi) + 7 * 86400000).toISOString().slice(0, 10);

  const [titoli, polizze, documenti, ticket] = await Promise.all([
    db.from('quote_titoli')
      .select('id,polizza_id,tipo,data_scadenza,importo_lordo,stato,polizza:quote_polizze(id,cliente,prodotto,compagnia)')
      .in('stato', ['aperto', 'insoluto'])
      .or('stato.eq.insoluto,data_scadenza.lte.' + settimana)
      .order('data_scadenza', { ascending: true }).limit(TETTO.titoli),
    db.from('quote_polizze')
      .select('id,cliente,prodotto,modulo,compagnia,data_scadenza,premio_annuo,stato_pagamento')
      .neq('stato_pagamento', 'annullata')
      .gte('data_scadenza', limite).lte('data_scadenza', avanti)
      .order('data_scadenza', { ascending: true }).limit(TETTO.polizze),
    db.from('quote_pratica_documenti')
      .select('id,entita,entita_id,categoria,nome,url,obbligatorio')
      .eq('entita', 'polizza').eq('obbligatorio', true).is('url', null)
      .order('creato_il', { ascending: true }).limit(TETTO.documenti),
    db.from('iam_ticket')
      .select('id,titolo,priorita,stato,segnalato_nome,data_schedulazione')
      .not('stato', 'in', '("chiuso","risolto","annullato")')
      .order('creato_il', { ascending: true }).limit(TETTO.ticket)
  ]);

  for (const r of [titoli, polizze, documenti, ticket]) if (r.error) throw r.error;

  /* Le sostituzioni dicono quali polizze sono già state rinnovate. Si chiedono
     a parte perché sono un conteggio su sé stessa: chiederle nella riga
     costerebbe una sotto-interrogazione per ogni polizza. */
  const ids = (polizze.data || []).map(p => p.id);
  let sostituite = new Set();
  if (ids.length) {
    const { data } = await db.from('quote_polizze').select('sostituisce_id').in('sostituisce_id', ids);
    sostituite = new Set((data || []).map(r => r.sostituisce_id));
  }

  /* I documenti sanno solo l'identificativo della pratica. Il nome del cliente si
     prende con una seconda lettura e non con una giunzione: entita_id punta a
     tabelle diverse (polizza, preventivo, cliente, sinistro), quindi una
     giunzione fissa non esiste proprio. */
  const docs = documenti.data || [];
  const pratiche = [...new Set(docs.map(d => d.entita_id).filter(Boolean))];
  let intestate = new Map();
  if (pratiche.length) {
    const { data } = await db.from('quote_polizze').select('id,cliente,prodotto').in('id', pratiche);
    intestate = new Map((data || []).map(r => [r.id, r]));
  }

  /* Se una lettura ha toccato il tetto, l'elenco NON e' completo: va detto, non
     lasciato intuire. Un totale presentato come definitivo su dati tagliati e'
     peggio di nessun totale. */
  const tagliate = [
    (titoli.data || []).length >= TETTO.titoli ? 'rate' : null,
    (polizze.data || []).length >= TETTO.polizze ? 'polizze in scadenza' : null,
    docs.length >= TETTO.documenti ? 'documenti mancanti' : null,
    (ticket.data || []).length >= TETTO.ticket ? 'richieste' : null
  ].filter(Boolean);

  return {
    titoli: titoli.data || [],
    polizze: (polizze.data || []).map(p => ({ ...p, sostituzioni: sostituite.has(p.id) ? 1 : 0 })),
    documenti: docs.map(d => ({ ...d, polizza: intestate.get(d.entita_id) || null })),
    ticket: ticket.data || [],
    tagliate
  };
}
