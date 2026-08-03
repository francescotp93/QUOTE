/* ══════════════════════════════════════════════════════════════════════════
   PREVIDENZA — interfaccia
   ─────────────────────────────────────────────────────────────────────────
   Usa il motore in previdenza-engine.js (window.PREV) e i parametri in
   tariffe/previdenza-parametri.json + tariffe/previdenza-fondi.json.

   Dipende da alcune funzioni globali di index.html: esc(), showPage(),
   savePreventivo(), db, currentUser. Il file va caricato DOPO index.html.

   Tutti i comandi passano dal namespace PRVUI (gli onclick sono inline,
   come nel resto del progetto).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const VERSIONE_DATI = '2026.1';

  let P = null;            // parametri normativi
  let CATALOGO = null;     // profili e prodotti
  let charts = {};         // istanze ApexCharts, per poterle distruggere
  let ultimoCalcolo = null;
  let timerRicalcolo = null;

  const $ = id => document.getElementById(id);
  /* Le due viste coesistono nel DOM (una nascosta), quindi ciascuna ha il
     proprio contenitore dei risultati: un id condiviso farebbe scrivere
     l'azienda dentro la pagina del privato. */
  const out = () => $(vista === 'privato' ? 'prv-out-privato' : 'prv-out-azienda');
  const E = window.PREV;
  const esc = s => (window.esc ? window.esc(s) : String(s == null ? '' : s));
  const eur = (n, d) => E.fmtEuro(n, d);

  /* ── Caricamento dati ───────────────────────────────────────────────── */

  async function caricaDati() {
    if (P && CATALOGO) return true;
    try {
      const [a, b] = await Promise.all([
        fetch('tariffe/previdenza-parametri.json?v=' + VERSIONE_DATI).then(r => r.json()),
        fetch('tariffe/previdenza-fondi.json?v=' + VERSIONE_DATI).then(r => r.json())
      ]);
      P = a; CATALOGO = b;
      return true;
    } catch (e) {
      console.error('Previdenza — parametri non caricati:', e);
      return false;
    }
  }

  /** Prodotti confrontabili: quelli reali a catalogo, altrimenti i profili
      generici (dichiarati come tali all'utente). */
  function prodottiConfrontabili() {
    const reali = (CATALOGO.prodotti || []).filter(p => p.attivo !== false);
    if (reali.length) {
      const righe = [];
      reali.forEach(pr => (pr.linee || []).forEach(l => {
        const profilo = (CATALOGO.profili_generici || []).find(g => g.id === l.profilo) || {};
        righe.push({
          id: pr.id + '::' + l.id,
          nome: pr.nome + ' — ' + l.nome,
          compagnia: pr.compagnia, tipo: pr.tipo, reale: true,
          costoAdesione: (pr.costi_una_tantum || {}).adesione || 0,
          contributoDatoreAliquota: (pr.contributo_datoriale || {}).previsto ? (pr.contributo_datoriale.aliquota || 0) : 0,
          linea: {
            nome: l.nome,
            rendimento_atteso: l.rendimento_storico_10a != null ? l.rendimento_storico_10a : (profilo.rendimento_atteso || 0),
            costo_gestione_annuo: l.costo_gestione_annuo != null ? l.costo_gestione_annuo : (profilo.costo_gestione_annuo || 0),
            quota_titoli_stato: profilo.quota_titoli_stato || 0
          }
        });
      }));
      return { lista: righe, reali: true };
    }
    return {
      lista: (CATALOGO.profili_generici || []).map(l => ({ id: l.id, nome: l.nome, reale: false, linea: l })),
      reali: false
    };
  }

  /* ── Componenti di interfaccia riutilizzabili ───────────────────────── */

  function campo(id, label, valore, opts) {
    const o = opts || {};
    const suff = o.suffisso ? `<span class="prv-suff">${esc(o.suffisso)}</span>` : '';
    return `<div class="aw-field prv-f">
      <label for="${id}">${esc(label)}${o.aiuto ? `<i class="ti ti-help prv-help" data-tip="${esc(o.aiuto)}"></i>` : ''}</label>
      <div class="prv-inp">
        <input id="${id}" type="${o.tipo || 'number'}" value="${esc(valore)}"
          ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''}
          ${o.step != null ? `step="${o.step}"` : 'step="1"'}
          oninput="PRVUI.ricalcola()">
        ${suff}
      </div>
    </div>`;
  }

  function selezione(id, label, valore, opzioni, aiuto) {
    return `<div class="aw-field prv-f">
      <label for="${id}">${esc(label)}${aiuto ? `<i class="ti ti-help prv-help" data-tip="${esc(aiuto)}"></i>` : ''}</label>
      <select id="${id}" onchange="PRVUI.ricalcola()">
        ${opzioni.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(valore) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
      </select>
    </div>`;
  }

  function cursore(id, label, valore, min, max, step, formato) {
    return `<div class="prv-slider">
      <div class="prv-slider-top">
        <label for="${id}">${esc(label)}</label>
        <span class="prv-slider-val" id="${id}-val">${formato(valore)}</span>
      </div>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${valore}"
        oninput="PRVUI.aggiornaCursore('${id}'); PRVUI.ricalcola()">
    </div>`;
  }

  function statCard(label, valore, nota, colore) {
    return `<div class="stat-card prv-stat${colore ? ' prv-stat-' + colore : ''}">
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value">${esc(valore)}</div>
      ${nota ? `<div class="prv-stat-nota">${esc(nota)}</div>` : ''}
    </div>`;
  }

  function boxIpotesi(ipotesi, avvertenze) {
    const av = (avvertenze || []).length
      ? `<div class="prv-avvisi">${avvertenze.map(a => `<div class="prv-avviso"><i class="ti ti-alert-triangle"></i> ${esc(a)}</div>`).join('')}</div>` : '';
    return `${av}
      <details class="prv-ipotesi">
        <summary><i class="ti ti-list-check"></i> Su quali ipotesi è costruita questa stima</summary>
        <ul>${(ipotesi || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      </details>`;
  }

  function disclaimer() {
    return `<div class="prv-disclaimer">
      <i class="ti ti-info-circle"></i>
      <div><b>Stima non impegnativa.</b> Gli importi indicati sono proiezioni costruite sulle ipotesi
      dichiarate sopra e non costituiscono una promessa di rendimento né un impegno contrattuale.
      La pensione pubblica effettiva è determinata dall'INPS: per un calcolo puntuale serve l'estratto
      conto contributivo. I rendimenti passati non sono indicativi di quelli futuri.</div>
    </div>`;
  }

  /* ── Stato ──────────────────────────────────────────────────────────── */

  const statoPrivato = () => ({
    eta: 40, sesso: 'M', tipoLavoratore: 'dipendente',
    ral: 30000, crescitaRal: 2.0,
    anniContributi: 15, anniAnte1996: 0, montanteInps: '',
    etaPensione: 67, tassoCapitalizzazione: 2.0,
    profilo: 'bilanciata', conferisceTfr: 1, versamentoMensile: 100,
    foi: 2.0, scenario: 'atteso'
  });

  const statoAzienda = () => ({
    dipendenti: 20, monteRetributivo: 600000, fondoTfrEsistente: 150000,
    anni: 10, costoDenaro: 5.0, quotaConferita: 100, foi: 2.0,
    nettoObiettivo: 1000, redditoDipendente: 30000, figliACarico: 0
  });

  let S = statoPrivato();
  let SA = statoAzienda();
  let vista = 'privato';

  function leggiForm(prefisso, stato) {
    Object.keys(stato).forEach(k => {
      const el = $(prefisso + '-' + k);
      if (!el) return;
      stato[k] = el.type === 'number' || el.type === 'range' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    });
  }

  /* ══ HOME ═══════════════════════════════════════════════════════════ */

  async function apri() {
    const ok = await caricaDati();
    if (!ok) { alert('Parametri previdenziali non disponibili. Ricarica la pagina.'); return; }
    const g = $('previdenza-grid');
    if (g) g.innerHTML = `
      <div class="mod-card" onclick="PRVUI.apriPrivato()" data-tip="Gap pensionistico, TFR e previdenza complementare per il singolo cliente.">
        <div class="mod-ic"><i class="ti ti-user-heart"></i></div>
        <div class="mod-name">Privato</div>
      </div>
      <div class="mod-card" onclick="PRVUI.apriAzienda()" data-tip="Costo del TFR, vantaggi del conferimento e confronto tra forme di erogazione.">
        <div class="mod-ic"><i class="ti ti-building-store"></i></div>
        <div class="mod-name">Azienda</div>
      </div>`;
    window.showPage('previdenza');
  }

  /* ══ PRIVATO ════════════════════════════════════════════════════════ */

  async function apriPrivato() {
    // Di norma si arriva qui dalla home del modulo, che ha già caricato i
    // parametri; ma la funzione è raggiungibile anche direttamente.
    if (!(await caricaDati())) { alert('Parametri previdenziali non disponibili. Ricarica la pagina.'); return; }
    vista = 'privato';
    S = statoPrivato();
    window.showPage('prv-privato');
    $('prv-privato-body').innerHTML = formPrivato();
    ricalcola();
  }

  function formPrivato() {
    const prof = CATALOGO.profili_generici.map(l => ({ v: l.id, l: l.nome + ' · ' + (l.rendimento_atteso * 100).toFixed(1) + '% atteso' }));
    return `
    <div class="prv-layout">
      <div class="prv-form">
        <div class="aw-sec" style="margin-top:0">Il cliente</div>
        <div class="aw-row2">
          ${campo('prv-eta', 'Età attuale', S.eta, { min: 18, max: 75, suffisso: 'anni' })}
          ${selezione('prv-sesso', 'Sesso', S.sesso, [{ v: 'M', l: 'Uomo' }, { v: 'F', l: 'Donna' }])}
        </div>
        ${selezione('prv-tipoLavoratore', 'Tipo di lavoratore', S.tipoLavoratore, [
          { v: 'dipendente', l: 'Lavoratore dipendente' },
          { v: 'autonomo_artigiano', l: 'Artigiano' },
          { v: 'autonomo_commerciante', l: 'Commerciante' },
          { v: 'professionista', l: 'Professionista (gestione separata)' }
        ], 'Determina l\'aliquota con cui i contributi entrano nel montante pensionistico.')}

        <div class="aw-sec">Reddito e contributi</div>
        ${campo('prv-ral', 'Retribuzione annua lorda', S.ral, { min: 0, step: 500, suffisso: '€' })}
        <div class="aw-row2">
          ${campo('prv-anniContributi', 'Anni di contributi già versati', S.anniContributi, { min: 0, max: 50, suffisso: 'anni' })}
          ${campo('prv-anniAnte1996', 'di cui prima del 1996', S.anniAnte1996, { min: 0, max: 50, suffisso: 'anni', aiuto: 'Gli anni ante 1996 seguono il vecchio sistema retributivo, più generoso.' })}
        </div>
        ${campo('prv-montanteInps', 'Montante da estratto conto INPS (facoltativo)', S.montanteInps, { min: 0, step: 1000, suffisso: '€', aiuto: 'Se il cliente lo ha, il calcolo smette di essere una stima e diventa preciso.' })}

        <div class="aw-sec">Quando e come</div>
        ${campo('prv-etaPensione', 'Età di pensionamento ipotizzata', S.etaPensione, { min: 57, max: 75, suffisso: 'anni' })}
        ${selezione('prv-conferisceTfr', 'Destinazione del TFR', S.conferisceTfr, [
          { v: 1, l: 'Conferito al fondo pensione' }, { v: 0, l: 'Lasciato in azienda' }
        ])}
        ${selezione('prv-profilo', 'Linea di investimento', S.profilo, prof,
          'Più l\'orizzonte è lungo, più ha senso una linea con quota azionaria alta.')}
        ${campo('prv-versamentoMensile', 'Versamento volontario mensile', S.versamentoMensile, { min: 0, step: 10, suffisso: '€/mese' })}

        <div class="aw-sec">Ipotesi economiche</div>
        ${cursore('prv-crescitaRal', 'Crescita della retribuzione', S.crescitaRal, 0, 5, 0.1, v => Number(v).toFixed(1) + '% l\'anno')}
        ${cursore('prv-tassoCapitalizzazione', 'Rivalutazione del montante INPS', S.tassoCapitalizzazione, 0, 5, 0.1, v => Number(v).toFixed(1) + '% l\'anno')}
        ${cursore('prv-foi', 'Inflazione (FOI)', S.foi, 0, 6, 0.1, v => Number(v).toFixed(1) + '% l\'anno')}
        <div class="prv-nota-ipotesi">
          <i class="ti ti-bulb"></i> Tieni la <b>crescita della retribuzione</b> allineata alla
          <b>rivalutazione del montante</b>: se la seconda è più alta, la pensione stimata si gonfia
          e il gap sparisce.
        </div>

        <div class="aw-sec">Scenario</div>
        <div class="prv-scenari" id="prv-scenari">
          ${['pessimistico', 'atteso', 'ottimistico'].map(k => `
            <button type="button" class="prv-scen${S.scenario === k ? ' on' : ''}" data-k="${k}"
              onclick="PRVUI.cambiaScenario('${k}')">${esc(P.scenari[k].etichetta)}</button>`).join('')}
        </div>
      </div>

      <div class="prv-out" id="prv-out-privato"></div>
    </div>`;
  }

  function calcolaPrivato() {
    const linea = CATALOGO.profili_generici.find(l => l.id === S.profilo) || CATALOGO.profili_generici[0];
    const delta = P.scenari[S.scenario].delta_rendimento;
    const anni = Math.max(0, Number(S.etaPensione) - Number(S.eta));

    const base = {
      eta: Number(S.eta), etaPensione: Number(S.etaPensione), ral: Number(S.ral),
      anniContributi: Number(S.anniContributi), anniAnte1996: Number(S.anniAnte1996),
      montanteInps: S.montanteInps === '' ? null : Number(S.montanteInps),
      tipoLavoratore: S.tipoLavoratore,
      crescitaRal: Number(S.crescitaRal) / 100,
      tassoCapitalizzazione: Number(S.tassoCapitalizzazione) / 100
    };

    const pensione = E.pensionePubblica(base, P);

    const inputTfr = {
      ral: Number(S.ral), anni, crescitaRal: base.crescitaRal,
      foi: Number(S.foi) / 100, linea, deltaRendimento: delta
    };
    const tfr = E.confrontoTfr(inputTfr, P);

    const pc = prodottiConfrontabili();
    const confronto = E.confrontoProdotti({
      ral: Number(S.ral), anni, crescitaRal: base.crescitaRal,
      conferisceTfr: Number(S.conferisceTfr) === 1,
      versamentoAnnuo: Number(S.versamentoMensile) * 12,
      deltaRendimento: delta
    }, P, pc.lista);

    // Quanto serve versare per colmare il gap fino alla fine della vita attesa.
    const anniRendita = 20;
    const obiettivo = pensione.gapAnnuoNetto * anniRendita;
    const necessario = obiettivo > 0
      ? E.versamentoPerColmareGap({ anni: Math.max(1, anni), obiettivoMontante: obiettivo, reddito: Number(S.ral), linea, deltaRendimento: delta }, P)
      : null;

    // Che cosa produce il versamento effettivamente impostato.
    const fondoScelto = E.proiezioneFondo({
      ral: Number(S.ral), anni, crescitaRal: base.crescitaRal,
      conferisceTfr: Number(S.conferisceTfr) === 1,
      versamentoAnnuo: Number(S.versamentoMensile) * 12,
      linea, deltaRendimento: delta
    }, P);
    const fondoSceltoTass = E.tassazionePrestazioneFondo(fondoScelto, Math.max(1, anni), P);
    const risparmio = E.risparmioFiscaleAnnuo(Number(S.ral), Number(S.versamentoMensile) * 12, P);

    return { pensione, tfr, confronto, prodottiReali: pc.reali, necessario, fondoScelto, fondoSceltoTass, risparmio, anni, linea, obiettivo, anniRendita };
  }

  function rendiPrivato(c) {
    const p = c.pensione;
    const rendita = c.fondoSceltoTass.netto / c.anniRendita / P.pensione_pubblica.mensilita_pensione;

    const html = `
      <div class="prv-head">
        <div class="prv-head-t">Gap previdenziale</div>
        <div class="prv-head-s">Tra ${c.anni} anni, a ${p.etaPensione} anni</div>
      </div>

      <div class="stats-grid prv-stats">
        ${statCard('Ultimo stipendio netto', eur(p.ultimoRedditoNettoMensile) + '/mese', 'stima al momento della pensione')}
        ${statCard('Pensione pubblica netta', eur(p.pensioneMensileNetta) + '/mese', 'INPS, primo assegno')}
        ${statCard('Ti mancheranno', eur(p.gapMensileNetto) + '/mese', 'ogni mese, per tutta la pensione', 'rosso')}
        ${statCard('Tasso di sostituzione', p.tassoSostituzioneNetto + '%', 'della retribuzione netta attuale')}
      </div>

      <div class="prv-grafici">
        <div class="prv-graf"><div class="prv-graf-t">Prima e dopo la pensione</div><div id="prv-ch-gap"></div></div>
      </div>

      ${c.necessario ? `
      <div class="prv-azione">
        <div class="prv-azione-t"><i class="ti ti-target-arrow"></i> Per colmare il gap</div>
        <div class="prv-azione-grid">
          <div><div class="prv-azione-l">Versamento necessario</div><div class="prv-azione-v">${eur(c.necessario.versamentoMensile)}<span>/mese</span></div></div>
          <div><div class="prv-azione-l">Risparmio fiscale</div><div class="prv-azione-v verde">${eur(c.necessario.risparmioFiscaleAnnuo)}<span>/anno</span></div></div>
          <div><div class="prv-azione-l">Costo reale</div><div class="prv-azione-v blu">${eur(c.necessario.costoRealeMensile)}<span>/mese</span></div></div>
        </div>
        <div class="prv-azione-n">Per garantire ${eur(p.gapMensileNetto)} al mese per ${c.anniRendita} anni serve un capitale di ${eur(c.obiettivo)}.
        ${c.necessario.oltreTetto ? ' Attenzione: il versamento supera il tetto di deducibilità annuo.' : ''}</div>
      </div>` : `
      <div class="prv-azione prv-azione-ok">
        <div class="prv-azione-t"><i class="ti ti-circle-check"></i> Con queste ipotesi non emerge un gap</div>
        <div class="prv-azione-n">Verifica le ipotesi economiche nel pannello a sinistra: un tasso di sostituzione molto alto di solito segnala ipotesi disallineate.</div>
      </div>`}

      <div class="prv-head" style="margin-top:2.2rem">
        <div class="prv-head-t">Il TFR: in azienda o nel fondo?</div>
        <div class="prv-head-s">Stessi euro, ${c.anni} anni, due destinazioni</div>
      </div>

      <div class="stats-grid prv-stats prv-stats-2">
        ${statCard('TFR in azienda', eur(c.tfr.azienda.netto), `netto, tassato al ${(c.tfr.azienda.tassazione.aliquota * 100).toFixed(1)}%`)}
        ${statCard('TFR nel fondo', eur(c.tfr.fondo.netto), `netto, tassato al ${(c.tfr.fondo.tassazione.aliquota * 100).toFixed(1)}%`)}
        ${statCard('Differenza', (c.tfr.differenza >= 0 ? '+' : '') + eur(c.tfr.differenza), c.tfr.conviene === 'fondo' ? 'a favore del fondo pensione' : 'a favore del TFR in azienda', c.tfr.differenza >= 0 ? 'verde' : 'rosso')}
      </div>

      <div class="prv-grafici">
        <div class="prv-graf prv-graf-wide"><div class="prv-graf-t">Quanto resterebbe in mano, anno per anno, al netto delle imposte</div><div id="prv-ch-tfr"></div></div>
      </div>

      ${boxIpotesi(c.tfr.ipotesi)}

      <div class="prv-head" style="margin-top:2.2rem">
        <div class="prv-head-t">Confronto tra le soluzioni</div>
        <div class="prv-head-s">${c.prodottiReali
          ? 'Prodotti a catalogo, con i costi reali di ciascuno'
          : 'Profili di investimento generici — non sono prodotti: servono a mostrare l\'ordine di grandezza'}</div>
      </div>

      ${!c.prodottiReali ? `<div class="prv-nota-catalogo"><i class="ti ti-alert-circle"></i>
        Nessun prodotto ancora a catalogo: il confronto usa profili generici. I dati reali si inseriscono
        in <code>tariffe/previdenza-fondi.json</code> e il confronto si aggiorna da solo.</div>` : ''}

      <div class="prv-grafici">
        <div class="prv-graf prv-graf-wide"><div class="prv-graf-t">Capitale netto a scadenza</div><div id="prv-ch-conf"></div></div>
      </div>

      <div class="prv-tabella-wrap">
        <table class="prv-tabella">
          <thead><tr><th>Soluzione</th><th>Versato</th><th>Rendimento</th><th>Imposte</th><th>Netto finale</th></tr></thead>
          <tbody>
            ${c.confronto.esiti.map((e, i) => `<tr class="${i === 0 ? 'top' : ''}">
              <td><b>${esc(e.nome)}</b>${e.compagnia ? `<span class="prv-comp">${esc(e.compagnia)}</span>` : ''}</td>
              <td>${eur(e.capitaleVersato)}</td>
              <td>${(e.rendimentoNettoAnnuo * 100).toFixed(2)}%</td>
              <td>${eur(e.imposta)}</td>
              <td class="prv-td-net">${eur(e.netto)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="prv-azione" style="margin-top:1.4rem">
        <div class="prv-azione-t"><i class="ti ti-pig-money"></i> Con il versamento impostato (${eur(Number(S.versamentoMensile))}/mese)</div>
        <div class="prv-azione-grid">
          <div><div class="prv-azione-l">Capitale a scadenza</div><div class="prv-azione-v">${eur(c.fondoSceltoTass.netto)}</div></div>
          <div><div class="prv-azione-l">Di cui versato da te</div><div class="prv-azione-l2">${eur(c.fondoScelto.capitaleVersato)}</div></div>
          <div><div class="prv-azione-l">Risparmio fiscale annuo</div><div class="prv-azione-v verde">${eur(c.risparmio.risparmio)}</div></div>
          <div><div class="prv-azione-l">Integrazione stimata</div><div class="prv-azione-v blu">${eur(rendita)}<span>/mese</span></div></div>
        </div>
        <div class="prv-azione-n">L'integrazione mensile è calcolata distribuendo il capitale netto su ${c.anniRendita} anni. La rendita effettiva dipende dai coefficienti del prodotto scelto.</div>
      </div>

      ${boxIpotesi(c.pensione.ipotesi, c.pensione.avvertenze)}
      ${disclaimer()}

      <div class="prv-azioni-finali">
        <button class="aw-btn-ghost" onclick="PRVUI.stampa()"><i class="ti ti-printer"></i> REPORT PER IL CLIENTE</button>
        <button class="aw-btn-dark" onclick="PRVUI.salva()"><i class="ti ti-device-floppy"></i> SALVA ANALISI</button>
      </div>`;

    out().innerHTML = html;
    graficiPrivato(c);
  }

  /* ══ AZIENDA ════════════════════════════════════════════════════════ */

  async function apriAzienda() {
    if (!(await caricaDati())) { alert('Parametri previdenziali non disponibili. Ricarica la pagina.'); return; }
    vista = 'azienda';
    SA = statoAzienda();
    window.showPage('prv-azienda');
    $('prv-azienda-body').innerHTML = formAzienda();
    ricalcola();
  }

  function formAzienda() {
    return `
    <div class="prv-layout">
      <div class="prv-form">
        <div class="aw-sec" style="margin-top:0">L'azienda</div>
        ${campo('prva-dipendenti', 'Numero di dipendenti', SA.dipendenti, { min: 1, max: 5000 })}
        ${campo('prva-monteRetributivo', 'Monte retributivo annuo lordo', SA.monteRetributivo, { min: 0, step: 10000, suffisso: '€' })}
        ${campo('prva-fondoTfrEsistente', 'Fondo TFR già accantonato', SA.fondoTfrEsistente, { min: 0, step: 10000, suffisso: '€' })}

        <div class="aw-sec">Orizzonte e ipotesi</div>
        ${campo('prva-anni', 'Anni di proiezione', SA.anni, { min: 1, max: 30, suffisso: 'anni' })}
        ${cursore('prva-quotaConferita', 'Quota di dipendenti che aderisce', SA.quotaConferita, 0, 100, 5, v => Number(v).toFixed(0) + '%')}
        ${cursore('prva-costoDenaro', 'Costo del denaro per l\'azienda', SA.costoDenaro, 0, 12, 0.25, v => Number(v).toFixed(2) + '%')}
        ${cursore('prva-foi', 'Inflazione (FOI)', SA.foi, 0, 6, 0.1, v => Number(v).toFixed(1) + '% l\'anno')}

        <div class="aw-sec">Quanto costa dare valore al dipendente</div>
        ${campo('prva-nettoObiettivo', 'Netto da mettere in tasca', SA.nettoObiettivo, { min: 0, step: 100, suffisso: '€' })}
        ${campo('prva-redditoDipendente', 'Reddito annuo del dipendente', SA.redditoDipendente, { min: 0, step: 1000, suffisso: '€' })}
        ${selezione('prva-figliACarico', 'Figli a carico', SA.figliACarico, [{ v: 0, l: 'No' }, { v: 1, l: 'Sì' }],
          'Con figli a carico la soglia di esenzione dei fringe benefit è più alta.')}
      </div>

      <div class="prv-out" id="prv-out-azienda"></div>
    </div>`;
  }

  function calcolaAzienda() {
    const base = {
      dipendenti: Number(SA.dipendenti), monteRetributivo: Number(SA.monteRetributivo),
      fondoTfrEsistente: Number(SA.fondoTfrEsistente), anni: Number(SA.anni),
      costoDenaro: Number(SA.costoDenaro) / 100, foi: Number(SA.foi) / 100
    };
    const costo = E.costoTfrAzienda(base, P);
    const vantaggio = E.vantaggioConferimento({ ...base, quotaConferita: Number(SA.quotaConferita) / 100 }, P);
    const erogazione = E.confrontoErogazione({
      nettoObiettivo: Number(SA.nettoObiettivo),
      redditoDipendente: Number(SA.redditoDipendente),
      figliACarico: Number(SA.figliACarico) === 1
    }, P);
    return { costo, vantaggio, erogazione, base };
  }

  function rendiAzienda(c) {
    const v = c.vantaggio, k = c.costo, er = c.erogazione;
    const migliore = er.opzioni.find(o => o.id === er.migliore);
    const busta = er.opzioni.find(o => o.id === 'busta');
    const risparmioVsBusta = migliore && busta ? busta.costoAzienda - migliore.costoAzienda : 0;

    out().innerHTML = `
      <div class="prv-head">
        <div class="prv-head-t">Il TFR in azienda</div>
        <div class="prv-head-s">${k.sottoSoglia
          ? `Sotto i ${P.azienda.soglia_dipendenti_tesoreria} dipendenti: il TFR resta in azienda`
          : `Almeno ${P.azienda.soglia_dipendenti_tesoreria} dipendenti: il TFR non conferito va al Fondo di Tesoreria INPS`}</div>
      </div>

      <div class="stats-grid prv-stats">
        ${statCard('Accantonamento annuo', eur(k.accantonamentoAnnuo), 'monte retributivo / 13,5')}
        ${statCard('Fondo TFR tra ' + k.anni + ' anni', eur(k.fondoFinale), k.sottoSoglia ? 'debito verso i dipendenti' : 'solo la parte già maturata')}
        ${statCard('Costo annuo della rivalutazione', eur(k.costoAnnuoRivalutazione), 'rivalutazione + imposta sostitutiva', 'rosso')}
        ${statCard('Liquidità autofinanziata', k.risparmioFinanziarioAnnuo > 0 ? eur(k.risparmioFinanziarioAnnuo) + '/anno' : '—',
          k.sottoSoglia ? 'rispetto al costo del credito' : 'non applicabile sopra soglia', 'verde')}
      </div>

      <div class="prv-grafici">
        <div class="prv-graf prv-graf-wide"><div class="prv-graf-t">Evoluzione del fondo TFR</div><div id="prv-ch-az"></div></div>
      </div>

      ${boxIpotesi(k.ipotesi)}

      <div class="prv-head" style="margin-top:2.2rem">
        <div class="prv-head-t">Se il TFR va a previdenza complementare</div>
        <div class="prv-head-s">Con l'adesione del ${Number(SA.quotaConferita).toFixed(0)}% dei dipendenti</div>
      </div>

      <div class="stats-grid prv-stats">
        ${statCard('Vantaggio annuo', eur(v.vantaggioAnnuo), 'fiscale + contributivo', 'verde')}
        ${statCard('Per dipendente', eur(v.vantaggioPerDipendente) + '/anno', 'media sull\'organico')}
        ${statCard('Su ' + k.anni + ' anni', eur(v.vantaggioAnnuo * k.anni), 'a parità di organico', 'verde')}
        ${statCard('Deduzione aggiuntiva', (v.aliquotaDeduzione * 100).toFixed(0) + '%', 'del TFR conferito')}
      </div>

      <div class="prv-tabella-wrap">
        <table class="prv-tabella">
          <thead><tr><th>Voce</th><th>Base di calcolo</th><th>Beneficio annuo</th></tr></thead>
          <tbody>
            <tr><td><b>Deduzione aggiuntiva IRES</b><span class="prv-comp">${(v.aliquotaDeduzione * 100).toFixed(0)}% del TFR conferito, dedotto al ${(P.azienda.aliquota_ires * 100).toFixed(0)}%</span></td>
                <td>${eur(v.deduzioneAggiuntiva)}</td><td class="prv-td-net">${eur(v.risparmioDeduzione)}</td></tr>
            <tr><td><b>Esonero contributo Fondo di garanzia</b><span class="prv-comp">${(P.azienda.esonero_fondo_garanzia * 100).toFixed(2)}% del monte retributivo</span></td>
                <td>${eur(c.base.monteRetributivo)}</td><td class="prv-td-net">${eur(v.esoneroFondoGaranzia)}</td></tr>
            <tr><td><b>Riduzione oneri impropri</b><span class="prv-comp">${(P.azienda.riduzione_oneri_impropri * 100).toFixed(2)}% del monte retributivo</span></td>
                <td>${eur(c.base.monteRetributivo)}</td><td class="prv-td-net">${eur(v.riduzioneOneriImpropri)}</td></tr>
            <tr class="top"><td><b>Totale</b></td><td></td><td class="prv-td-net">${eur(v.vantaggioAnnuo)}</td></tr>
          </tbody>
        </table>
      </div>

      ${boxIpotesi(v.ipotesi)}

      <div class="prv-head" style="margin-top:2.2rem">
        <div class="prv-head-t">Quanto costa mettere ${eur(er.nettoObiettivo)} netti in tasca al dipendente</div>
        <div class="prv-head-s">Stesso obiettivo, quattro strade diverse</div>
      </div>

      ${migliore && risparmioVsBusta > 0 ? `
      <div class="prv-azione">
        <div class="prv-azione-t"><i class="ti ti-trophy"></i> ${esc(migliore.modalita)}</div>
        <div class="prv-azione-grid">
          <div><div class="prv-azione-l">Costo per l'azienda</div><div class="prv-azione-v">${eur(migliore.costoAzienda)}</div></div>
          <div><div class="prv-azione-l">Netto al dipendente</div><div class="prv-azione-v blu">${eur(migliore.nettoDipendente)}</div></div>
          <div><div class="prv-azione-l">Risparmio sull'aumento in busta</div><div class="prv-azione-v verde">${eur(risparmioVsBusta)}</div></div>
          <div><div class="prv-azione-l">Efficienza</div><div class="prv-azione-v">${migliore.efficienza}%</div></div>
        </div>
        <div class="prv-azione-n">Per ogni dipendente. Su ${SA.dipendenti} dipendenti fanno ${eur(risparmioVsBusta * Number(SA.dipendenti))} l'anno.</div>
      </div>` : ''}

      <div class="prv-grafici">
        <div class="prv-graf prv-graf-wide"><div class="prv-graf-t">Costo azienda a parità di netto erogato</div><div id="prv-ch-erog"></div></div>
      </div>

      <div class="prv-tabella-wrap">
        <table class="prv-tabella">
          <thead><tr><th>Modalità</th><th>Costo azienda</th><th>Al netto IRES</th><th>Netto al dipendente</th><th>Efficienza</th></tr></thead>
          <tbody>
            ${er.opzioni.map(o => `<tr class="${o.id === er.migliore ? 'top' : ''}${o.ammesso === false ? ' spento' : ''}">
              <td><b>${esc(o.modalita)}</b><span class="prv-comp">${esc(o.nota)}</span></td>
              <td>${o.costoAzienda > 0 ? eur(o.costoAzienda) : '—'}</td>
              <td>${o.costoAzienda > 0 ? eur(o.costoDopoDeduzione) : '—'}</td>
              <td>${eur(o.nettoDipendente)}${o.differito ? '<span class="prv-comp">alla pensione</span>' : ''}${o.parziale ? '<span class="prv-comp">limite raggiunto</span>' : ''}</td>
              <td class="prv-td-net">${o.costoAzienda > 0 ? o.efficienza + '%' : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      ${boxIpotesi(er.ipotesi)}
      ${disclaimer()}

      <div class="prv-azioni-finali">
        <button class="aw-btn-ghost" onclick="PRVUI.stampa()"><i class="ti ti-printer"></i> REPORT PER L'AZIENDA</button>
        <button class="aw-btn-dark" onclick="PRVUI.salva()"><i class="ti ti-device-floppy"></i> SALVA ANALISI</button>
      </div>`;

    graficiAzienda(c);
  }

  /* ══ GRAFICI ════════════════════════════════════════════════════════ */

  const BLU = '#3b5bfd', VERDE = '#2ec16a', ROSSO = '#e5544b', GRIGIO = '#98a2b8', VIOLA = '#8b5cf6';

  function disegna(id, opts) {
    const el = $(id);
    if (!el || typeof ApexCharts === 'undefined') return;
    if (charts[id]) { try { charts[id].destroy(); } catch (e) {} }
    el.innerHTML = '';
    charts[id] = new ApexCharts(el, {
      chart: { fontFamily: 'inherit', toolbar: { show: false }, animations: { enabled: true, speed: 400 }, ...(opts.chart || {}) },
      grid: { borderColor: '#eef0f5', strokeDashArray: 4 },
      dataLabels: { enabled: false },
      ...opts
    });
    charts[id].render();
  }

  function distruggiGrafici() {
    Object.keys(charts).forEach(k => { try { charts[k].destroy(); } catch (e) {} });
    charts = {};
  }

  function graficiPrivato(c) {
    const p = c.pensione;

    // Prima e dopo la pensione — il salto è il messaggio.
    disegna('prv-ch-gap', {
      chart: { type: 'bar', height: 260 },
      colors: [BLU, ROSSO],
      plotOptions: { bar: { columnWidth: '45%', borderRadius: 6, distributed: true } },
      legend: { show: false },
      xaxis: { categories: ['Ultimo stipendio', 'Pensione INPS'], axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { formatter: v => eur(v) } },
      tooltip: { y: { formatter: v => eur(v, 2) + ' al mese' } },
      series: [{ name: 'Netto mensile', data: [p.ultimoRedditoNettoMensile, p.pensioneMensileNetta] }]
    });

    /* TFR anno per anno, al NETTO delle imposte.
       Sul lordo le due curve sarebbero quasi sovrapposte: la differenza tra
       lasciarlo in azienda e conferirlo al fondo la fa la tassazione, non
       l'accumulo. Mostrare il lordo qui contraddirebbe i numeri qui sopra. */
    const netti = E.nettiPerAnno(c.tfr, P);
    const anni = c.tfr.azienda.righe.map(r => 'Anno ' + r.anno);
    disegna('prv-ch-tfr', {
      chart: { type: 'area', height: 330 },
      colors: [GRIGIO, VERDE],
      // I dati sono annuali e l'accumulo sale sempre: lo spline "smooth"
      // introduce ondeggiamenti che i numeri non hanno.
      stroke: { curve: 'straight', width: 3 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.02, stops: [0, 90, 100] } },
      legend: { position: 'top', horizontalAlign: 'left', fontWeight: 600, markers: { width: 12, height: 12, radius: 12 } },
      xaxis: { categories: anni, tickAmount: Math.min(10, anni.length), axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { formatter: v => eur(v) } },
      tooltip: { shared: true, y: { formatter: v => eur(v, 2) } },
      series: [
        { name: 'TFR in azienda', data: netti.azienda.map(v => Math.round(v)) },
        { name: 'TFR nel fondo', data: netti.fondo.map(v => Math.round(v)) }
      ]
    });

    // Confronto tra soluzioni.
    const es = c.confronto.esiti;
    disegna('prv-ch-conf', {
      chart: { type: 'bar', height: Math.max(220, 60 + es.length * 46) },
      plotOptions: { bar: { horizontal: true, borderRadius: 5, barHeight: '58%', distributed: true } },
      colors: es.map((e, i) => i === 0 ? VERDE : BLU),   // la soluzione migliore in verde
      legend: { show: false },
      xaxis: { categories: es.map(e => e.nome), labels: { formatter: v => eur(v) } },
      yaxis: { labels: { maxWidth: 220 } },
      tooltip: { y: { formatter: v => eur(v, 2) + ' netti' } },
      series: [{ name: 'Netto a scadenza', data: es.map(e => Math.round(e.netto)) }]
    });
  }

  function graficiAzienda(c) {
    const r = c.costo.righe;
    disegna('prv-ch-az', {
      chart: { type: 'area', height: 300 },
      colors: [BLU],
      stroke: { curve: 'straight', width: 3 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.32, opacityTo: 0.02, stops: [0, 90, 100] } },
      xaxis: { categories: r.map(x => 'Anno ' + x.anno), axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { formatter: v => eur(v) } },
      tooltip: { y: { formatter: v => eur(v, 2) } },
      series: [{ name: 'Fondo TFR', data: r.map(x => Math.round(x.fondo)) }]
    });

    const op = c.erogazione.opzioni.filter(o => o.costoAzienda > 0);
    disegna('prv-ch-erog', {
      chart: { type: 'bar', height: Math.max(240, 60 + op.length * 52), stacked: false },
      plotOptions: { bar: { horizontal: true, borderRadius: 5, barHeight: '62%' } },
      colors: [ROSSO, VERDE],
      legend: { position: 'top', horizontalAlign: 'left', fontWeight: 600, markers: { width: 12, height: 12, radius: 12 } },
      xaxis: { categories: op.map(o => o.modalita), labels: { formatter: v => eur(v) } },
      yaxis: { labels: { maxWidth: 230 } },
      tooltip: { y: { formatter: v => eur(v, 2) } },
      series: [
        { name: 'Costo per l\'azienda', data: op.map(o => Math.round(o.costoAzienda)) },
        { name: 'Netto al dipendente', data: op.map(o => Math.round(o.nettoDipendente)) }
      ]
    });
  }

  /* ══ RICALCOLO ══════════════════════════════════════════════════════ */

  function ricalcola() {
    clearTimeout(timerRicalcolo);
    timerRicalcolo = setTimeout(() => {
      try {
        if (vista === 'privato') {
          leggiForm('prv', S);
          const err = E.validaPrivato({ eta: S.eta, ral: S.ral, anniContributi: S.anniContributi, etaPensione: S.etaPensione });
          if (err.length) { mostraErrori(err); return; }
          ultimoCalcolo = calcolaPrivato();
          rendiPrivato(ultimoCalcolo);
        } else {
          leggiForm('prva', SA);
          const err = E.validaAzienda({ dipendenti: SA.dipendenti, monteRetributivo: SA.monteRetributivo });
          if (err.length) { mostraErrori(err); return; }
          ultimoCalcolo = calcolaAzienda();
          rendiAzienda(ultimoCalcolo);
        }
      } catch (e) {
        console.error('Previdenza — errore di calcolo:', e);
        mostraErrori(['Si è verificato un errore nel calcolo. Controlla i valori inseriti.']);
      }
    }, 180);
  }

  function mostraErrori(err) {
    distruggiGrafici();
    const cont = out();
    if (cont) cont.innerHTML = `<div class="prv-errori">
      <div class="prv-errori-t"><i class="ti ti-alert-triangle"></i> Controlla i dati</div>
      <ul>${err.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
    </div>`;
  }

  function aggiornaCursore(id) {
    const el = $(id), lab = $(id + '-val');
    if (!el || !lab) return;
    const v = Number(el.value);
    if (id.indexOf('quotaConferita') >= 0) lab.textContent = v.toFixed(0) + '%';
    else if (id.indexOf('costoDenaro') >= 0) lab.textContent = v.toFixed(2) + '%';
    else lab.textContent = v.toFixed(1) + '% l\'anno';
  }

  function cambiaScenario(k) {
    S.scenario = k;
    document.querySelectorAll('#prv-scenari .prv-scen').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    ricalcola();
  }

  /* ══ SALVATAGGIO E REPORT ═══════════════════════════════════════════ */

  async function salva() {
    if (!ultimoCalcolo) return;
    if (!window.savePreventivo) { alert('Salvataggio non disponibile.'); return; }

    const nominativo = prompt('Nominativo del cliente per questa analisi:');
    if (nominativo == null) return;
    if (!nominativo.trim()) { alert('Indica il nominativo.'); return; }

    const rec = vista === 'privato'
      ? {
          modulo: 'previdenza', prodotto: 'Analisi previdenziale — Privato',
          cliente: nominativo.trim(),
          dati: {
            tipo: 'privato', versioneParametri: P.versione, input: { ...S },
            risultati: {
              pensioneMensileNetta: ultimoCalcolo.pensione.pensioneMensileNetta,
              gapMensileNetto: ultimoCalcolo.pensione.gapMensileNetto,
              tassoSostituzioneNetto: ultimoCalcolo.pensione.tassoSostituzioneNetto,
              tfrAziendaNetto: ultimoCalcolo.tfr.azienda.netto,
              tfrFondoNetto: ultimoCalcolo.tfr.fondo.netto,
              differenzaTfr: ultimoCalcolo.tfr.differenza,
              versamentoConsigliatoMensile: ultimoCalcolo.necessario ? ultimoCalcolo.necessario.versamentoMensile : 0
            },
            avvertenze: ultimoCalcolo.pensione.avvertenze
          }
        }
      : {
          modulo: 'previdenza', prodotto: 'Analisi previdenziale — Azienda',
          cliente: nominativo.trim(),
          dati: {
            tipo: 'azienda', versioneParametri: P.versione, input: { ...SA },
            risultati: {
              accantonamentoAnnuo: ultimoCalcolo.costo.accantonamentoAnnuo,
              fondoFinale: ultimoCalcolo.costo.fondoFinale,
              vantaggioAnnuoConferimento: ultimoCalcolo.vantaggio.vantaggioAnnuo,
              modalitaPiuEfficiente: ultimoCalcolo.erogazione.migliore
            }
          }
        };

    const id = await window.savePreventivo(rec);
    alert(id ? 'Analisi salvata.' : 'Analisi non salvata: controlla la connessione.');
  }

  function stampa() {
    if (!ultimoCalcolo) return;
    const cont = out();
    if (!cont) return;

    const titolo = vista === 'privato' ? 'Analisi previdenziale' : 'Analisi previdenziale per l\'azienda';
    const oggi = new Date().toLocaleDateString('it-IT');

    // I grafici sono SVG di ApexCharts: si portano nel report così come sono.
    const corpo = cont.cloneNode(true);
    corpo.querySelectorAll('.prv-azioni-finali').forEach(n => n.remove());
    corpo.querySelectorAll('details').forEach(d => d.setAttribute('open', 'open'));

    const w = window.open('', '_blank');
    if (!w) { alert('Il browser ha bloccato la finestra del report.'); return; }
    w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8">
      <title>${esc(titolo)}</title>
      <style>
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#2b3346;margin:28px;font-size:13px}
        h1{font-size:20px;margin:0 0 2px}
        .sub{color:#7a8399;font-size:12px;margin-bottom:20px}
        .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
        .stat-card{border:1px solid #e6e9f0;border-radius:10px;padding:12px}
        .stat-label{font-size:10px;color:#7a8399;text-transform:uppercase;font-weight:700;letter-spacing:.4px}
        .stat-value{font-size:19px;font-weight:800;margin-top:3px}
        .prv-stat-nota{font-size:10px;color:#7a8399;margin-top:3px}
        .prv-head-t{font-size:15px;font-weight:800;margin-top:22px}
        .prv-head-s{font-size:11px;color:#7a8399;margin-bottom:8px}
        table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
        th{text-align:left;background:#f6f7fb;padding:7px 9px;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#5b6479}
        td{padding:7px 9px;border-top:1px solid #eef0f5}
        tr.top td{background:#f2fbf5;font-weight:700}
        .prv-comp{display:block;font-size:10px;color:#7a8399;font-weight:400}
        .prv-azione{border:1px solid #e6e9f0;border-radius:10px;padding:13px;margin:12px 0;background:#fafbfe}
        .prv-azione-t{font-weight:800;font-size:13px;margin-bottom:8px}
        .prv-azione-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
        .prv-azione-l{font-size:10px;color:#7a8399;text-transform:uppercase;font-weight:700}
        .prv-azione-v{font-size:16px;font-weight:800}
        .prv-azione-v span{font-size:10px;font-weight:600;color:#7a8399}
        .prv-azione-n{font-size:10px;color:#7a8399;margin-top:8px}
        .prv-disclaimer{border:1px solid #e6e9f0;border-radius:10px;padding:12px;font-size:10.5px;color:#5b6479;margin-top:18px;background:#fbfbfd}
        .prv-avviso{border-left:3px solid #e8a33d;background:#fdf7ec;padding:8px 11px;font-size:11px;margin:7px 0;border-radius:0 6px 6px 0}
        details{margin:12px 0;font-size:11px}
        summary{font-weight:700;cursor:default;margin-bottom:5px}
        details ul{margin:5px 0 0 16px;padding:0;color:#5b6479}
        details li{margin-bottom:3px}
        .prv-graf-t{font-size:12px;font-weight:700;margin:14px 0 6px}
        .prv-errori,.prv-nota-catalogo,.prv-nota-ipotesi{display:none}
        svg{max-width:100%!important}
        @media print{ .prv-head-t{page-break-after:avoid} table{page-break-inside:avoid} }
      </style></head><body>
      <h1>${esc(titolo)}</h1>
      <div class="sub">With Us Assicurazioni · ${esc(oggi)} · parametri versione ${esc(P.versione)}</div>
      ${corpo.innerHTML}
      <script>window.onload=function(){setTimeout(function(){window.print();},600);};<\/script>
      </body></html>`);
    w.document.close();
  }

  /* ══ ESPORTAZIONE ═══════════════════════════════════════════════════ */

  window.PRVUI = {
    apri, apriPrivato, apriAzienda, ricalcola, aggiornaCursore, cambiaScenario, salva, stampa,
    // utile dalla console per capire su che numeri sta girando il modulo
    _stato: () => ({ P, CATALOGO, S, SA, ultimoCalcolo })
  };
  window.openPrevidenza = apri;
})();
