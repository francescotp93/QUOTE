// ═══════════════════════════════════════════════════════════════════════════════
//  IL CONTRATTO DEL MOTOR — l'unica forma che entra e l'unica che esce
//
//  Oggi ogni compagnia ha il suo dialetto: il moto/24H vuole targa+nascita+cf,
//  HDI vuole anche tipoGuida/massimale/frazionamento/residenza, e ognuno
//  costruisce la risposta a modo suo. Aggiungere una compagnia vuol dire
//  rimparare tutto da capo, e chi legge i preventivi non sa mai che forma
//  aspettarsi.
//
//  Questo file fissa UN input e UN output, uguali per tutte le compagnie.
//  È la parte che deve restare STABILE nel tempo: gli adapter cambiano, questo
//  no. Un adapter riceve `Preventivo` (input normalizzato) e restituisce
//  `Esito` (output normalizzato); quello che sta in mezzo — endpoint, mapping
//  dei campi, sequenza dei passi — è affar suo.
//
//  Fuori scope per ora (ma già previsti come VALORI di `scenario`, così si
//  aggiungono senza toccare questo file): bersani stesso proprietario, bersani
//  proprietario diverso, rinnovo.
//
//  Prove: scraper/verifica/contratto.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════

/* Gli SCENARI. Per ora si quota solo il cambio compagnia; gli altri sono
   dichiarati ma rifiutati, così il giorno che si implementano basta togliere
   la riga da NON_ANCORA — nessun adapter va riscritto. */
export const SCENARI = ['cambio_compagnia', 'bersani_stesso', 'bersani_diverso', 'rinnovo'];
export const SCENARI_ATTIVI = ['cambio_compagnia'];

/* I tipi di veicolo che il contratto conosce. L'adapter li traduce nei codici
   della sua compagnia (Motorcycle, CAR, …). */
export const VEICOLI = ['auto', 'moto', 'ciclomotore', 'autocarro'];

/* LA LISTA CHIUSA DEGLI ERRORI. Come per le API v1: chi legge un Esito ci
   scrive sopra dei comportamenti (riprovare, avvisare, fermarsi), e un codice
   inventato al volo diventa un ramo che nessuno ha previsto. */
export const ERRORI = [
  'INPUT_NON_VALIDO',   // manca o è malformato un campo obbligatorio del Preventivo
  'SESSIONE',           // la compagnia non è collegata / login scaduto
  'TIMEOUT',            // il portale non ha risposto entro il tempo
  'VEICOLO',            // targa non trovata / veicolo non quotabile
  'RIFIUTO_COMPAGNIA',  // la compagnia ha risposto ma non offre un premio (rischio non assunto)
  'SCENARIO_NON_SUPP',  // lo scenario chiesto non è ancora attivo
  'PROVIDER',           // errore tecnico dell'adapter/della compagnia
];

/* I PASSI del flusso, uguali per tutti a grandi linee. Servono al logging dei
   fallimenti: «dove» si è rotto è la prima cosa che si guarda in manutenzione. */
export const PASSI = ['sessione', 'veicolo', 'anagrafica', 'quotazione', 'lettura_premio'];

// ── INPUT: il Preventivo ─────────────────────────────────────────────────────
/* La forma che ogni adapter riceve. I campi facoltativi restano facoltativi:
   un adapter che non usa la residenza semplicemente la ignora, non si rompe. */
const CAMPI_CLIENTE_OBBL = ['dataNascita'];
const CAMPI_VEICOLO_OBBL = ['targa', 'tipo'];

/** Normalizza un input “sporco” (com'è oggi in giro) nella forma del contratto.
 *  Non inventa niente: riempie i default ovvi (scenario, tipo veicolo) e
 *  ripulisce spazi/maiuscole dove è sicuro. */
export function normalizzaInput(grezzo) {
  const g = grezzo || {};
  const c = g.cliente || g.contraente || {};
  const v = g.veicolo || {};
  const p = g.polizza || {};
  const pulisci = s => (s == null ? '' : String(s).trim());
  return {
    scenario: pulisci(g.scenario) || 'cambio_compagnia',
    cliente: {
      nome: pulisci(c.nome),
      cognome: pulisci(c.cognome),
      dataNascita: pulisci(c.dataNascita),            // ISO 'YYYY-MM-DD'
      codiceFiscale: pulisci(c.codiceFiscale || c.cf).toUpperCase(),
      email: pulisci(c.email),
      telefono: pulisci(c.telefono || c.cellulare),
      statoCivile: pulisci(c.statoCivile),
      professione: pulisci(c.professione),
      patenteAnno: pulisci(c.patenteAnno),
      indirizzo: {
        via: pulisci(c.indirizzo && typeof c.indirizzo === 'object' ? c.indirizzo.via : c.indirizzo),
        civico: pulisci(c.civico || (c.indirizzo && c.indirizzo.civico)),
        cap: pulisci(c.cap || (c.indirizzo && c.indirizzo.cap)),
        comune: pulisci(c.comune || (c.indirizzo && c.indirizzo.comune)),
        prov: pulisci(c.prov || (c.indirizzo && c.indirizzo.prov)),
        istat: pulisci(c.cittaIstat || c.istat || (c.indirizzo && c.indirizzo.istat)),
      },
    },
    veicolo: {
      targa: pulisci(v.targa || g.targa).toUpperCase(),
      tipo: (pulisci(v.tipo || g.tipoVeicolo) || 'auto').toLowerCase(),
    },
    polizza: {
      tipoGuida: pulisci(p.tipoGuida) || 'libera',
      massimale: pulisci(p.massimale),
      frazionamento: pulisci(p.frazionamento) || 'Annuale',
      rivalsa: p.rivalsa === undefined ? true : !!p.rivalsa,
      garanzie: Array.isArray(p.garanzie) ? p.garanzie.map(pulisci).filter(Boolean) : [],
    },
  };
}

/** Dice se un Preventivo è quotabile. Torna { ok:true } oppure
 *  { ok:false, error_code, messaggio } — con un codice della lista chiusa. */
export function validaInput(prev) {
  const p = prev || {};
  if (!SCENARI.includes(p.scenario)) return no('INPUT_NON_VALIDO', 'scenario sconosciuto: ' + p.scenario);
  if (!SCENARI_ATTIVI.includes(p.scenario)) return no('SCENARIO_NON_SUPP', 'scenario non ancora attivo: ' + p.scenario);
  if (!VEICOLI.includes((p.veicolo || {}).tipo)) return no('INPUT_NON_VALIDO', 'tipo veicolo sconosciuto');
  for (const k of CAMPI_VEICOLO_OBBL) if (!(p.veicolo || {})[k]) return no('INPUT_NON_VALIDO', 'manca veicolo.' + k);
  for (const k of CAMPI_CLIENTE_OBBL) if (!(p.cliente || {})[k]) return no('INPUT_NON_VALIDO', 'manca cliente.' + k);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.cliente.dataNascita)) return no('INPUT_NON_VALIDO', 'dataNascita non è YYYY-MM-DD');
  return { ok: true };
}

// ── OUTPUT: l'Esito ──────────────────────────────────────────────────────────
/** Costruisce un Esito RIUSCITO normalizzato. Il premio ANNUO è la verità di
 *  riferimento; la rata si ricava dal frazionamento. */
export function esitoOk(compagnia, dati) {
  const d = dati || {};
  const annuo = num(d.premio_annuo);
  return {
    esito: 'ok',
    compagnia: String(compagnia || ''),
    prodotto: String(d.prodotto || ''),
    premio: {
      annuo,
      rata: d.premio_rata != null ? num(d.premio_rata) : annuo,
      rate: d.rate != null ? (parseInt(d.rate, 10) || 1) : 1,
      frazionamento: String(d.frazionamento || 'Annuale'),
    },
    garanzie_incluse: (d.garanzie_incluse || []).map(x => String(x).trim()).filter(Boolean),
    opzioni: (d.opzioni || []).map(o => ({
      nome: String(o.nome || ''),
      premio_annuo: o.premio_annuo != null ? num(o.premio_annuo) : null,
    })),
    veicolo: d.veicolo || null,
  };
}

/** Costruisce un Esito FALLITO normalizzato — con il codice chiuso e il passo. */
export function esitoErrore(compagnia, error_code, messaggio, passo) {
  return {
    esito: 'errore',
    compagnia: String(compagnia || ''),
    error_code: ERRORI.includes(error_code) ? error_code : 'PROVIDER',
    messaggio: String(messaggio || ''),
    passo: PASSI.includes(passo) ? passo : null,
  };
}

/** Verifica che un Esito rispetti il contratto (usata dalle prove e, volendo,
 *  a runtime prima di consegnare la risposta a chi ha chiesto il preventivo). */
export function validaEsito(e) {
  if (!e || typeof e !== 'object') return no('PROVIDER', 'esito assente');
  if (e.esito === 'ok') {
    if (!(e.premio && Number.isFinite(e.premio.annuo) && e.premio.annuo > 0))
      return no('PROVIDER', 'esito ok senza premio annuo valido');
    return { ok: true };
  }
  if (e.esito === 'errore') {
    if (!ERRORI.includes(e.error_code)) return no('PROVIDER', 'error_code fuori dalla lista chiusa: ' + e.error_code);
    return { ok: true };
  }
  return no('PROVIDER', 'campo esito non è né ok né errore: ' + e.esito);
}

// ── LOGGING STRUTTURATO DEI FALLIMENTI ───────────────────────────────────────
/* Ogni fallimento salva le quattro cose che servono a capirlo dopo: cosa si è
   mandato, cosa è tornato grezzo, dove si è rotto, quando. Il payload e la
   risposta vengono RIPULITI dai dati personali (targhe, nomi, date di nascita)
   prima di finire nel log: un log non è il posto dove tenere i dati dei
   clienti. La ripulitura vera vive in scraper/comune/riservatezza.mjs; qui si
   accetta una funzione così il contratto non dipende da come è fatta. */
export function fallimento({ compagnia, passo, error_code, payload, rispostaGrezza, quando, ripulisci }) {
  const oscura = typeof ripulisci === 'function' ? ripulisci : (x => x);
  return {
    tipo: 'motor_fallimento',
    compagnia: String(compagnia || ''),
    passo: PASSI.includes(passo) ? passo : null,
    error_code: ERRORI.includes(error_code) ? error_code : 'PROVIDER',
    payload: oscura(payload),
    risposta: oscura(typeof rispostaGrezza === 'string' ? rispostaGrezza.slice(0, 4000) : rispostaGrezza),
    quando: quando || null,   // il chiamante passa il timestamp (qui non si legge l'orologio, per i test)
  };
}

// ── utilità ──────────────────────────────────────────────────────────────────
function no(error_code, messaggio) { return { ok: false, error_code, messaggio }; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }
