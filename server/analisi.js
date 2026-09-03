// ── QUOTO · Analisi previdenziale: lo strato che mette in fila i conti ─────────
/* server/pensione.js sa fare sette conti e non sa NIENTE del resto: non sa dove
   stanno i numeri di legge, non sa cos'e' un cliente, non sa in che ordine si
   fanno le cose. E' giusto cosi': quello e' il motore.

   Questo file e' la catena di montaggio. Prende i dati di una persona, i numeri
   ufficiali dalla tabella quote_parametri_previdenziali, le ipotesi commerciali
   scelte dall'operatore, e li mette in fila. Non calcola niente da solo: ogni
   numero che esce da qui esce da una funzione del motore.

   PERCHE' UN FILE A PARTE E NON UNA ROTTA CHE FA TUTTO: perche' la catena si
   deve poter collaudare senza accendere un server e senza database. La funzione
   analisiPrevidenziale() e' pura — le si passano i parametri, non li va a
   cercare. La rotta qui in fondo e' l'unica parte che parla con Supabase. */
import { Router } from 'express';
import {
  ORDINE_ITALIANO, ORDINE_FONDO,
  montanteContributivo, proiezioneRedditi, pensioneAnnua, tassoSostituzione,
  versamentoPerColmare, deduzioneFiscale, tassazionePrestazione, ipotesiUsate,
} from './pensione.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');

/* Le gestioni previdenziali con cui abbiamo a che fare. L'elenco sta qui e non
   nel motore perche' non e' un numero di legge: e' l'elenco delle chiavi con cui
   il parametro «aliquote_computo» e' scritto in tabella. Le due cose devono
   combaciare, e il controllo qui sotto lo verifica invece di sperarci. */
export const GESTIONI = [
  { k: 'dipendenti_privati',     l: 'Dipendente privato' },
  { k: 'dipendenti_pubblici',    l: 'Dipendente pubblico' },
  { k: 'artigiani',              l: 'Artigiano' },
  { k: 'commercianti',           l: 'Commerciante' },
  { k: 'gs_professionisti',      l: 'Gestione separata · professionista' },
  { k: 'gs_collaboratori',       l: 'Gestione separata · collaboratore' },
  { k: 'gs_con_altra_copertura', l: 'Gestione separata · con altra copertura' },
];

/* I dati che l'operatore deve compilare. Serve alla schermata per disegnare il
   modulo, e serve qui per dire quale manca: un elenco solo, non due. */
export const DA_COMPILARE = [
  { k: 'gestione',       l: 'Gestione previdenziale',            tipo: 'scelta', scelte: GESTIONI },
  { k: 'etaOggi',        l: 'Età oggi',                          tipo: 'anni' },
  { k: 'etaUscita',      l: 'Età di uscita prevista',            tipo: 'anni' },
  { k: 'redditoOggi',    l: 'Reddito annuo lordo di oggi',       tipo: 'euro' },
  { k: 'montanteIniziale', l: 'Montante già maturato',           tipo: 'euro', facoltativo: true,
    aiuto: "Lo si legge sull'estratto conto contributivo INPS. Se non lo si ha, si lascia vuoto e il conto parte da zero: la pensione che esce è quella dei soli anni futuri, e va detto al cliente." },
  { k: 'crescitaAnnua', l: 'Crescita annua del reddito',         tipo: 'frazione', ipotesi: true },
  { k: 'rendimento',    l: 'Rendimento annuo del fondo',         tipo: 'frazione', ipotesi: true },
  { k: 'costiAnnui',    l: 'Costi annui del fondo (ISC)',        tipo: 'frazione', ipotesi: true },
  { k: 'aliquotaIrpef', l: 'Aliquota IRPEF marginale',           tipo: 'frazione', ipotesi: true },
];

/* Le ipotesi commerciali NON hanno un valore di riserva in questo codice.
   Crescita del reddito, rendimento, costi e aliquota marginale non sono numeri
   di legge: sono scelte, cambiano da cliente a cliente e da prodotto a prodotto,
   e finiscono stampate sul foglio che il cliente si porta a casa. Un valore
   inventato qui sarebbe un'ipotesi commerciale scritta dal programmatore. */
export const IPOTESI_OBBLIGATORIE = DA_COMPILARE.filter(c => c.ipotesi).map(c => c.k);

// ── I numeri di legge: da parametro a valore usabile ──────────────────────────
/* Ogni funzione qui sotto fa UNA cosa: legge un parametro e, se non lo trova,
   dice quale manca e chi lo pubblica. Il messaggio e' scritto per Francesco,
   non per un log: se il coefficiente dell'eta' 72 non c'e', la risposta utile
   e' «il decreto arriva fino a 71», non «undefined». */
export function aliquotaDellaGestione(aliquote, gestione) {
  const g = String(gestione || '').trim();
  if (!g) throw new Error('Manca la gestione previdenziale: senza sapere in quale cassa versa questa persona non si sa con che aliquota si calcola il montante.');
  if (!aliquote || typeof aliquote !== 'object') throw new Error('Il parametro «aliquote_computo» non è in tabella: va inserito nella schermata Parametri previdenziali.');
  const v = aliquote[g];
  if (v === undefined || v === null) {
    throw new Error(`La gestione «${g}» non ha un'aliquota in tabella. Ci sono: ${Object.keys(aliquote).join(', ')}.`);
  }
  return v;
}

export function coefficientePerEta(coefficienti, eta) {
  if (!coefficienti || typeof coefficienti !== 'object') throw new Error('Il parametro «coefficienti_trasformazione» non è in tabella: va inserito nella schermata Parametri previdenziali.');
  const chiavi = Object.keys(coefficienti).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const e = Math.trunc(Number(eta));
  const v = coefficienti[String(e)];
  if (v === undefined || v === null) {
    /* Fuori tabella non si interpola e non si prende il piu' vicino: sarebbe un
       coefficiente inventato, e finirebbe su un preventivo. */
    const dove = chiavi.length ? `il decreto in tabella copre da ${chiavi[0]} a ${chiavi[chiavi.length - 1]} anni` : 'in tabella non c\'è nessuna età';
    throw new Error(`Non c'è il coefficiente di trasformazione per ${eta} anni: ${dove}. Fuori da quell'intervallo il coefficiente non si può stimare, va preso dal decreto.`);
  }
  return v;
}

/* LA RIVALUTAZIONE DEGLI ANNI FUTURI. Nessuno la conosce: il tasso di un anno
   si sa a novembre dell'anno stesso. Se l'operatore non ne mette una, qui si usa
   la MEDIA GEOMETRICA degli ultimi anni pubblicati — geometrica e non aritmetica
   perche' sono tassi che si compongono, e la media aritmetica di tassi
   composti sovrastima sempre.

   Resta una scelta di riserva, non una previsione: esce dentro le ipotesi
   stampate, con scritto su quanti anni e' stata fatta. */
export function rivalutazioneDiRiserva(storico, quantiAnni = 5) {
  if (!storico || typeof storico !== 'object') throw new Error('Il parametro «rivalutazione_montante» non è in tabella: va inserito nella schermata Parametri previdenziali.');
  const anni = Object.keys(storico).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const usati = anni.slice(-Math.max(1, Math.trunc(quantiAnni)));
  if (!usati.length) throw new Error('Il parametro «rivalutazione_montante» non ha nessun anno dentro: non si può ricavare una media.');
  let prodotto = 1;
  for (const a of usati) {
    const t = Number(storico[String(a)]);
    if (!Number.isFinite(t) || t <= 0) throw new Error(`La rivalutazione dell'anno ${a} in tabella non è un coefficiente utilizzabile: c'è ${JSON.stringify(storico[String(a)])}, e qui serve un numero come 1.0175.`);
    prodotto *= t;
  }
  const media = Math.pow(prodotto, 1 / usati.length) - 1;
  return { tasso: media, anni: usati, comE: `media geometrica degli anni ${usati[0]}–${usati[usati.length - 1]}` };
}

// ── LA CATENA ─────────────────────────────────────────────────────────────────
/* Ordine: redditi futuri → montante → pensione → confronto con l'obiettivo →
   quanto versare → cosa fa il fisco. Ogni passo usa il risultato del precedente,
   e nessun passo indovina: se manca un numero si ferma e dice quale. */
export function analisiPrevidenziale({ persona = {}, parametri = {}, scelte = {}, obiettivo = {} } = {}) {
  const mancano = DA_COMPILARE
    .filter(c => !c.facoltativo)
    .filter(c => persona[c.k] === undefined || persona[c.k] === null || persona[c.k] === '')
    .map(c => c.l);
  if (mancano.length) throw new Error('Mancano dei dati: ' + mancano.join(', ') + '.');

  const etaOggi = Number(persona.etaOggi);
  const etaUscita = Number(persona.etaUscita);
  if (!Number.isFinite(etaOggi) || !Number.isFinite(etaUscita)) throw new Error('Le età devono essere numeri.');
  const anni = Math.trunc(etaUscita - etaOggi);
  if (anni <= 0) {
    throw new Error(`L'età di uscita (${etaUscita}) non è oltre l'età di oggi (${etaOggi}): non resta nessun anno da proiettare. Per chi è già in pensione, o ci arriva quest'anno, questa analisi non è lo strumento giusto.`);
  }

  const aliquota = aliquotaDellaGestione(parametri.aliquote_computo, persona.gestione);
  const coefficiente = coefficientePerEta(parametri.coefficienti_trasformazione, etaUscita);

  /* La rivalutazione attesa: quella scelta dall'operatore, altrimenti la media
     degli ultimi anni pubblicati. In entrambi i casi si ricorda quale delle due
     e' stata usata, perche' vada a finire sul foglio. */
  let rivalutazioneAttesa = persona.rivalutazioneAttesa;
  let comERivalutazione = 'scelta dall\'operatore';
  if (rivalutazioneAttesa === undefined || rivalutazioneAttesa === null || rivalutazioneAttesa === '') {
    const riserva = rivalutazioneDiRiserva(parametri.rivalutazione_montante, scelte.anniDiMedia || 5);
    rivalutazioneAttesa = riserva.tasso;
    comERivalutazione = riserva.comE + ' (scelta di riserva)';
  } else {
    rivalutazioneAttesa = Number(rivalutazioneAttesa);
  }

  const redditi = proiezioneRedditi({
    redditoOggi: Number(persona.redditoOggi),
    anni,
    crescitaAnnua: Number(persona.crescitaAnnua),
    crescitaDalPrimoAnno: scelte.crescitaDalPrimoAnno === true,
  });

  /* IL MASSIMALE CONTRIBUTIVO. Chi è entrato nel sistema dal 1996 versa solo
     fino a un tetto di reddito, e sopra quel tetto non matura montante: non
     applicarlo gonfia la pensione dei redditi alti. Il tetto si rivaluta ogni
     anno, quindi lo si fa crescere con la stessa ipotesi del montante — e' una
     scelta di modello, dichiarata, non un dettaglio nascosto. */
  const massimale = parametri.massimali && parametri.massimali.massimale_contributivo;
  const soggetto = persona.soggettoAlMassimale !== false;
  let tettoUsato = null;
  const storico = redditi.map((r, i) => {
    if (soggetto && Number.isFinite(Number(massimale))) {
      const tetto = Number(massimale) * Math.pow(1 + rivalutazioneAttesa, i);
      if (i === 0) tettoUsato = tetto;
      return { reddito: Math.min(r, tetto), reddito_pieno: r, anno: null };
    }
    return { reddito: r, reddito_pieno: r, anno: null };
  });

  const ordine = scelte.ordine === ORDINE_FONDO ? ORDINE_FONDO : ORDINE_ITALIANO;
  const mont = montanteContributivo({
    storico,
    aliquota,
    rivalutazioni: new Array(anni).fill(rivalutazioneAttesa),
    montanteIniziale: Number(persona.montanteIniziale || 0),
    ordine,
  });

  const pensione = pensioneAnnua({ montante: mont.montante, coefficiente });
  const ultimoReddito = redditi[redditi.length - 1];
  const tasso = tassoSostituzione({ pensione, ultimoReddito });

  /* L'OBIETTIVO. Di riserva: mantenere l'80% dell'ultimo reddito — e' la soglia
     con cui si ragiona di solito, ma resta una scelta e come tale si stampa.
     Chi vuole una cifra la mette in euro: quegli euro sono euro dell'anno di
     uscita, non di oggi, ed e' scritto sulla schermata. */
  const tipoObiettivo = obiettivo.tipo === 'euro' ? 'euro' : 'percentuale';
  let obiettivoAnnuo;
  if (tipoObiettivo === 'euro') {
    obiettivoAnnuo = Number(obiettivo.valore);
    if (!Number.isFinite(obiettivoAnnuo) || obiettivoAnnuo < 0) throw new Error('L\'obiettivo in euro non è un numero utilizzabile.');
  } else {
    const q = obiettivo.valore === undefined || obiettivo.valore === null || obiettivo.valore === '' ? 0.8 : Number(obiettivo.valore);
    if (!Number.isFinite(q) || q <= 0 || q > 1) throw new Error('L\'obiettivo in percentuale va scritto come frazione fra 0 e 1: l\'80% si scrive 0.8.');
    obiettivoAnnuo = ultimoReddito * q;
  }

  const gapAnnuo = obiettivoAnnuo - pensione;
  const versamento = versamentoPerColmare({
    gapAnnuo, anni,
    rendimento: Number(persona.rendimento),
    coefficiente,
    costiAnnui: Number(persona.costiAnnui),
    quando: scelte.quando === 'inizio' ? 'inizio' : 'fine',
  });

  const tetto = parametri.tetto_deducibilita;
  if (tetto === undefined || tetto === null) throw new Error('Il parametro «tetto_deducibilita» non è in tabella: senza il tetto annuo non si sa quanta parte del versamento si deduce.');
  const fisco = deduzioneFiscale({
    versato: versamento.annuo,
    tetto: Number(tetto),
    aliquotaIrpef: Number(persona.aliquotaIrpef),
  });

  const tp = parametri.tassazione_prestazione;
  if (!tp || typeof tp !== 'object') throw new Error('Il parametro «tassazione_prestazione» non è in tabella: senza non si sa con che aliquota viene tassata la rendita.');
  const aliquotaFinale = tassazionePrestazione({
    anni,
    aliquotaBase: tp.aliquotaBase,
    riduzionePerAnno: tp.riduzionePerAnno,
    aliquotaMinima: tp.aliquotaMinima,
    annoDaCuiSiRiduce: tp.annoDaCuiSiRiduce,
    soloAnniInteri: scelte.soloAnniInteri !== false,
  });

  /* Le ipotesi stampate: quelle del motore, piu' le tre decise qui. Una sola
     lista, letta dal motore stesso, cosi' il foglio del cliente non puo' dire
     una cosa diversa da quella con cui si e' fatto il conto. */
  const ipotesi = ipotesiUsate({
    aliquota, coefficiente, etaUscita,
    crescitaAnnua: Number(persona.crescitaAnnua),
    rendimento: Number(persona.rendimento),
    costiAnnui: Number(persona.costiAnnui),
    aliquotaIrpef: Number(persona.aliquotaIrpef),
    tetto: Number(tetto),
    rivalutazioni: rivalutazioneAttesa,
  });

  return {
    anni,
    aliquota, coefficiente,
    rivalutazioneAttesa, comERivalutazione,
    massimaleApplicato: soggetto && tettoUsato !== null ? tettoUsato : null,
    redditi,
    ultimoReddito,
    montante: mont.montante,
    contributi: mont.contributi,
    rivalutazioneMaturata: mont.rivalutazione,
    ordine,
    pensioneAnnua: pensione,
    pensioneMensile: pensione / 13,     // le pensioni si pagano in 13 rate
    tassoSostituzione: tasso,
    obiettivo: { tipo: tipoObiettivo, annuo: obiettivoAnnuo, mensile: obiettivoAnnuo / 13 },
    gapAnnuo,
    gapMensile: gapAnnuo / 13,
    versamento,
    fisco,
    aliquotaFinale,
    ipotesi,
  };
}

// ── LA ROTTA ──────────────────────────────────────────────────────────────────
/* L'unica parte che parla con il database. Tutto quello che sopra e' un conto,
   qui e' solo: leggi i parametri, chiama la catena, salva se richiesto. */
function sbHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(extra || {}) };
}
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error('Supabase select: ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function sbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Supabase insert: ' + (await r.text()).slice(0, 300));
  return r.json();
}

/* I numeri di legge, letti dalla tabella e messi nella forma che la catena si
   aspetta: chiave → valore. Insieme torna la scadenza di ognuno, perche' un
   parametro scaduto va DETTO a chi sta per stampare un foglio, non ignorato. */
export async function leggiParametri() {
  const righe = await sbGet('quote_parametri_previdenziali?select=chiave,valore,unita,fonte,aggiornato_il,scade_il,ricontrolla_il,derivato,nota');
  const valori = {};
  const schede = {};
  for (const r of righe) { valori[r.chiave] = r.valore; schede[r.chiave] = r; }
  return { valori, schede };
}

/* Un parametro scaduto non blocca il conto — bloccarlo vorrebbe dire che il
   giorno in cui l'ISTAT ritarda la pubblicazione l'agenzia non lavora. Ma
   l'avviso viaggia insieme al risultato e finisce anche sul foglio. */
export function avvisiSuiParametri(schede, chiaviUsate, oggi = new Date()) {
  const giorno = oggi.toISOString().slice(0, 10);
  const fuori = [];
  for (const k of chiaviUsate) {
    const s = schede[k];
    if (!s) { fuori.push({ chiave: k, come: 'manca', testo: `Il parametro «${k}» non è in tabella.` }); continue; }
    if (s.scade_il && s.scade_il < giorno) {
      fuori.push({ chiave: k, come: 'scaduto', testo: `«${s.chiave}» è scaduto il ${s.scade_il}: il calcolo è stato fatto con il valore vecchio.` });
    } else if (s.ricontrolla_il && s.ricontrolla_il < giorno) {
      fuori.push({ chiave: k, come: 'da_ricontrollare', testo: `«${s.chiave}» andava ricontrollato il ${s.ricontrolla_il}.` });
    }
    if (s.derivato === true) {
      fuori.push({ chiave: k, come: 'derivato', testo: `«${s.chiave}» è un valore ricavato da una norma, non copiato da una circolare: va confermato dal commercialista.` });
    }
  }
  return fuori;
}

const CHIAVI_USATE = ['aliquote_computo', 'coefficienti_trasformazione', 'rivalutazione_montante', 'tetto_deducibilita', 'tassazione_prestazione', 'massimali'];

export const analisiRouter = Router();

// Cosa serve alla schermata per disegnare il modulo, e con che numeri lavora.
analisiRouter.get('/preparazione', async (req, res) => {
  try {
    const { valori, schede } = await leggiParametri();
    let riserva = null;
    try { riserva = rivalutazioneDiRiserva(valori.rivalutazione_montante); } catch { /* lo dira' l'avviso */ }
    res.json({
      ok: true,
      daCompilare: DA_COMPILARE,
      gestioni: GESTIONI,
      etaDisponibili: Object.keys(valori.coefficienti_trasformazione || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b),
      tettoDeducibilita: valori.tetto_deducibilita ?? null,
      rivalutazioneDiRiserva: riserva,
      avvisi: avvisiSuiParametri(schede, CHIAVI_USATE),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function calcola(req) {
  const { valori, schede } = await leggiParametri();
  const risultato = analisiPrevidenziale({
    persona: req.body.persona || {},
    obiettivo: req.body.obiettivo || {},
    scelte: req.body.scelte || {},
    parametri: valori,
  });
  return { risultato, avvisi: avvisiSuiParametri(schede, CHIAVI_USATE), valori };
}

/* Il conto senza salvare: e' quello che si usa mentre si parla col cliente e si
   provano i numeri. Un errore qui e' una spiegazione (400), non un guasto. */
analisiRouter.post('/calcola', async (req, res) => {
  try {
    const { risultato, avvisi } = await calcola(req);
    res.json({ ok: true, risultato, avvisi });
  } catch (e) {
    const suoi = /Manca|mancano|non c'è|non è in tabella|frazione|nessun anno|zero/i.test(e.message);
    res.status(suoi ? 400 : 500).json({ error: e.message });
  }
});

// Il conto salvato, con dentro la copia dei numeri di legge usati.
analisiRouter.post('/salva', async (req, res) => {
  try {
    const { risultato, avvisi, valori } = await calcola(req);
    const usati = {};
    for (const k of CHIAVI_USATE) usati[k] = valori[k] ?? null;
    const riga = {
      anagrafica_id: req.body.anagrafica_id || null,
      creato_da: req.user && req.user.id,
      titolo: String(req.body.titolo || '').slice(0, 200) || null,
      nota: String(req.body.nota || '').slice(0, 2000) || null,
      dati: req.body.persona || {},
      obiettivo: req.body.obiettivo || {},
      scelte: req.body.scelte || {},
      risultato: { ...risultato, avvisi },
      parametri_usati: usati,
    };
    const out = await sbPost('quote_analisi_previdenziali', riga);
    res.json({ ok: true, id: out[0] && out[0].id, risultato, avvisi });
  } catch (e) {
    const suoi = /Manca|mancano|non c'è|non è in tabella|frazione|nessun anno|zero/i.test(e.message);
    res.status(suoi ? 400 : 500).json({ error: e.message });
  }
});

// Le analisi salvate: tutte, o quelle di un cliente.
analisiRouter.get('/elenco', async (req, res) => {
  try {
    const p = new URLSearchParams();
    p.set('select', 'id,anagrafica_id,creata_il,titolo,dati,risultato,creato_da');
    p.set('order', 'creata_il.desc');
    p.set('limit', String(Math.min(200, Number(req.query.limit) || 50)));
    if (req.query.anagrafica_id) p.set('anagrafica_id', 'eq.' + String(req.query.anagrafica_id));
    res.json({ ok: true, items: await sbGet(`quote_analisi_previdenziali?${p.toString()}`) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Una sola, con tutto quello che serve a ristamparla identica.
analisiRouter.get('/una/:id', async (req, res) => {
  try {
    const rows = await sbGet(`quote_analisi_previdenziali?id=eq.${encodeURIComponent(req.params.id)}&select=*&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Analisi non trovata.' });
    res.json({ ok: true, item: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
