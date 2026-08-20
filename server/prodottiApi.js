// ═══════════════════════════════════════════════════════════════════════════════
//  I PRODOTTI ESPOSTI DALL'API v1 — un adattatore per prodotto
//
//  Ogni adattatore fa una cosa sola: prendere i dati nella forma del contratto,
//  chiedere il premio a chi lo sa calcolare, e restituire risultati nella forma
//  del contratto. Nessun calcolo qui dentro: la tariffa e i portali restano
//  dove sono gia'.
//
//  Aggiungere un prodotto = aggiungere una voce a PRODOTTI. Spegnerne uno =
//  mettere attivo:false. IAM lo scopre da GET /api/v1/products e non va toccato.
// ═══════════════════════════════════════════════════════════════════════════════
import { CASA_KEYS } from './moto.js';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const richiedi = createRequire(import.meta.url);

const HDI = process.env.HDI_SCRAPER_URL || 'http://127.0.0.1:4400';

/* CASA — passa dallo scraper HDI. E' il prodotto che ha imposto la forma a due
   tempi del contratto: la via diretta risponde in 1-2 secondi, ma il ripiego
   sul browser arriva a ~230, ben oltre il taglio del gateway. */
async function quotaCasa(dati) {
  const q = new URLSearchParams();
  for (const k of CASA_KEYS) {
    const v = dati[k] != null ? String(dati[k]).trim() : '';
    if (v) q.set(k, v);
  }
  let r, d;
  try {
    r = await fetch(HDI + '/premio-casa?' + q.toString());
    d = await r.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, errore: 'PROVIDER_UNAVAILABLE', provider: 'hdi',
             messaggio: 'Lo scraper HDI non risponde.' };
  }

  /* Il freno: dopo tre accessi falliti lo scraper smette di bussare al portale,
     per non far bloccare l'utenza dell'agenzia dalla compagnia. Quando e'
     tirato bisogna dire A CHI CHIAMA quando riprovare, altrimenti IAM ritenta
     subito e brucia i tentativi che restano. */
  if (d && d.freno && d.freno.bloccato) {
    return { ok: false, errore: 'PROVIDER_UNAVAILABLE', provider: 'hdi',
             messaggio: 'Accessi al portale HDI temporaneamente sospesi dopo alcuni tentativi falliti.',
             riprova_dopo: d.freno.riprova_dopo || null };
  }
  if (!d || !d.ok) {
    return { ok: false, errore: 'PROVIDER_UNAVAILABLE', provider: 'hdi',
             messaggio: (d && d.error) || 'Premio Casa HDI non disponibile (sessione scaduta? rifai il login da Fonti).' };
  }

  /* Il provider parla la sua lingua; qui si traduce nella lingua del contratto.
     E' l'unico punto in cui la forma di HDI e' ammessa. */
  const premio = Number(d.premio ?? d.totale ?? 0);
  const rate = Number(d.rate || 1);
  return {
    ok: true,
    risultati: [{
      compagnia: 'HDI',
      premio_annuo: premio,
      premio_frazionato: rate > 1 ? Math.round((premio / rate) * 100) / 100 : premio,
      frazionamento: d.frazionamento || 'annuale',
      garanzie: Array.isArray(d.garanzie) ? d.garanzie : [],
      note: d.note || '',
    }],
  };
}

/* CATASTROFALI — tariffa nostra, nessun portale: risponde in millisecondi.
   E' il primo prodotto a tariffa esposto, e serve anche a dimostrare che la
   forma a due tempi regge per chi risponde subito: la prima GET trova gia'
   «completo».

   Il calcolo NON e' qui: e' lo stesso file che carica il preventivatore nel
   browser (tariffe/motore/catastrofali.js). Un premio calcolato dall'API e uno
   calcolato a schermo sono lo stesso numero per costruzione. */
const catastrofali = richiedi(path.join(RADICE, 'tariffe/motore/catastrofali.js'));
let tariffaCatCaricata = false;
function preparaCatastrofali() {
  if (tariffaCatCaricata) return;
  const f = path.join(RADICE, 'tariffe/catastrofali_cap.json');
  catastrofali.caricaTariffa(JSON.parse(fs.readFileSync(f, 'utf8')));
  tariffaCatCaricata = true;
}

async function quotaCatastrofali(dati) {
  preparaCatastrofali();
  const q = catastrofali.calcCatPremio(String(dati.cap), Number(dati.valore), {
    terrCont: !!dati.contenuto_terremoto,
    alluFabb: !!dati.alluvione_fabbricato,
    alluCont: !!dati.alluvione_contenuto,
    frazionamento: dati.frazionamento === 'semestrale' ? 'Semestrale' : 'Annuale',
  });
  /* null vuol dire «CAP non in tariffa» oppure «valore mancante»: e' un dato
     sbagliato di chi chiede, non un guasto del servizio. Va detto cosi', se no
     IAM riprova all'infinito una richiesta che non puo' funzionare. */
  if (!q) {
    return { ok: false, errore: 'INVALID_INPUT',
             messaggio: 'CAP ' + dati.cap + ' non presente nella tariffa catastrofali, oppure valore assicurato mancante.' };
  }
  return {
    ok: true,
    risultati: [{
      compagnia: 'Rischi catastrofali',
      premio_annuo: q.premio,
      premio_frazionato: q.semestrale != null ? q.semestrale : q.premio,
      frazionamento: q.semestrale != null ? 'semestrale' : 'annuale',
      garanzie: q.garanzie,
      note: 'Premio minimo di polizza ' + catastrofali.RCAB_PMIN + ' €.',
    }],
  };
}

/* RC PROFESSIONALE · NON REGOLAMENTATE — tariffa nostra, nessun portale.
   Stesso modulo che usa il preventivatore a schermo. */
const rcnonreg = richiedi(path.join(RADICE, 'tariffe/motore/rcnonreg.js'));
let tariffaNRCaricata = null;
function tariffaNonReg() {
  if (!tariffaNRCaricata) {
    tariffaNRCaricata = JSON.parse(fs.readFileSync(path.join(RADICE, 'tariffe/rc_non_regolamentate.json'), 'utf8'));
  }
  return tariffaNRCaricata;
}

async function quotaRcNonReg(dati) {
  const t = tariffaNonReg();
  const q = rcnonreg.calcolaRcNonReg({
    categoria: dati.categoria, fatturato: dati.fatturato, massimale: dati.massimale,
  }, t);
  if (!q) {
    /* Combinazione non quotabile: categoria sconosciuta, oppure quel massimale
       non esiste per quella fascia di fatturato. E' un dato sbagliato di chi
       chiede, non un guasto — se no IAM riprova all'infinito. */
    return { ok: false, errore: 'INVALID_INPUT',
             messaggio: 'Combinazione non disponibile: categoria «' + dati.categoria + '», massimale «' + dati.massimale + '», fatturato ' + dati.fatturato + '.' };
  }
  return {
    ok: true,
    risultati: [{
      compagnia: 'RC Professionale · non regolamentate',
      premio_annuo: q.lordo,
      premio_frazionato: q.lordo,
      frazionamento: 'annuale',
      garanzie: [{ nome: 'Massimale per anno', valore: q.mass }],
      note: 'Premio netto ' + q.netto + ' €, fascia di fatturato fino a ' + q.band + ' €.' +
            (q.overflow ? ' Fatturato oltre l\'ultima fascia: quotazione da confermare con la Direzione.' : ''),
    }],
  };
}

/* AMTRUST — 11 prodotti, cinque motori di calcolo. Nessun portale: tariffa
   nostra, risposta in millisecondi. E' lo stesso modulo che usa il
   preventivatore a schermo.

   Il motore giusto si sceglie come lo sceglie la pagina: dalla chiave del
   prodotto. Le liste stanno nella tariffa, non qui, cosi' aggiungere un
   prodotto non richiede di toccare questo file. */
const amtrust = richiedi(path.join(RADICE, 'tariffe/motore/amtrust.js'));
let tariffaAmt = null;
function tariffaAmtrust() {
  if (!tariffaAmt) tariffaAmt = JSON.parse(fs.readFileSync(path.join(RADICE, 'tariffe/amtrust.json'), 'utf8'));
  return tariffaAmt;
}
const AMT_SPEC = ['medico_protetto', 'dentista_protetto'];
const AMT_COMBO = ['farmacista_protetto'];
const AMT_RATE = ['studi_dentistici', 'poliambulatori', 'residenze_sanitarie', 'farmacie'];

async function quotaAmtrust(dati) {
  const t = tariffaAmtrust();
  const key = String(dati.prodotto || '');
  const prod = (t.prodotti || {})[key];
  if (!prod) {
    return { ok: false, errore: 'INVALID_INPUT',
             messaggio: 'Prodotto AmTrust «' + key + '» inesistente. Chiedi /api/v1/products per l\'elenco.' };
  }
  const amt = { key: key, cat: dati.categoria || 0, retro: dati.retroattivita || null, sogg: dati.soggetto || 'singolo', area: dati.area || null };
  let q = null;
  if (key === 'pubblico_impiego') q = amtrust.calcolaPi(prod, dati);
  else if (AMT_SPEC.indexOf(key) >= 0) q = amtrust.calcolaSpec(prod, dati, amt);
  else if (AMT_COMBO.indexOf(key) >= 0) q = amtrust.calcolaCombo(prod, dati);
  else if (AMT_RATE.indexOf(key) >= 0) q = amtrust.calcolaRate(prod, dati, amt);
  else q = amtrust.calcolaGen(prod, dati, amt);

  if (!q) {
    return { ok: false, errore: 'INVALID_INPUT',
             messaggio: 'Combinazione non quotabile per «' + (prod.nome || key) + '»: dati insufficienti o quotazione riservata alla Direzione.' };
  }
  return {
    ok: true,
    risultati: [{
      compagnia: 'AmTrust · ' + (prod.nome || key),
      premio_annuo: q.totale,
      premio_frazionato: q.totale,
      frazionamento: 'annuale',
      garanzie: q.garanzie || [],
      note: (q.corrLbl && q.corrLbl.length) ? 'Correzioni applicate: ' + q.corrLbl.join(', ') + '.' : '',
    }],
  };
}

/* I prodotti a tariffa semplice: nessun portale, calcolo in millisecondi,
   stesso modulo che usa il preventivatore a schermo. */
const tutelalegale = richiedi(path.join(RADICE, 'tariffe/motore/tutelalegale.js'));
const animali = richiedi(path.join(RADICE, 'tariffe/motore/animali.js'));
const rcrd = richiedi(path.join(RADICE, 'tariffe/motore/rcrischidiversi.js'));
const viaggio = richiedi(path.join(RADICE, 'tariffe/motore/viaggio.js'));
const salute = richiedi(path.join(RADICE, 'tariffe/motore/salute.js'));

/* Un premio a zero non e' un premio: per questi prodotti significa «prodotto
   sconosciuto» o «dati che non bastano». Meglio dirlo che consegnare a IAM un
   preventivo da zero euro. */
function daPremio(nome, premio, garanzie, note) {
  if (!premio || !isFinite(premio)) {
    return { ok: false, errore: 'INVALID_INPUT',
             messaggio: 'Dati insufficienti o combinazione inesistente per ' + nome + '.' };
  }
  return { ok: true, risultati: [{
    compagnia: nome, premio_annuo: premio, premio_frazionato: premio,
    frazionamento: 'annuale', garanzie: garanzie || [], note: note || '',
  }] };
}

async function quotaTutelaLegale(d) {
  return daPremio('Tutela legale · ' + (d.prodotto || ''), tutelalegale.calcolaTutelaLegale(d));
}

async function quotaAnimali(d) {
  const pack = animali.petPack(d);
  return daPremio('Dottorpet · ' + (pack ? pack.key : ''), animali.calcolaAnimali(d),
    d.rc ? [{ nome: 'RC verso terzi', premio: animali.PET_RC.premio }] : []);
}

async function quotaRcRischiDiversi(d) {
  const a = rcrd.rcrdAtt(d);
  return daPremio('RC rischi diversi · ' + (a ? a.nome || a.key : ''), rcrd.calcolaRcRischiDiversi(d),
    [], 'Premio minimo di polizza ' + rcrd.RCRD_MIN + ' €.');
}

async function quotaViaggio(d) {
  const area = viaggio.vgArea(d), gg = viaggio.vgGiorni(d);
  return daPremio('Viaggio · ' + (d.livello || ''), viaggio.calcolaViaggio(d), [],
    area ? (area.nome + ' · ' + gg + ' giorni · ' + (d.nAssicurati || 1) + ' assicurati') : '');
}

async function quotaSalute(d) {
  const ltc = d.tipo === 'ltc';
  const p = salute.SAL_PRODOTTI[d.tipo];
  if (!ltc && !p) {
    return { ok: false, errore: 'INVALID_INPUT',
             messaggio: 'Prodotto salute sconosciuto: ' + d.tipo + '. Ammessi: ' +
                        Object.keys(salute.SAL_PRODOTTI).join(', ') + ', ltc.' };
  }
  const liv = ltc ? salute.salLtc(d) : salute.salLiv(d);
  const nome = ltc ? ('Aglea Salus · ' + liv.nome)
                   : ('Aglea Salus · ' + p.nome + ' ' + liv.nome +
                      ' (' + (d.comp === 'nucleo' ? 'Nucleo' : 'Singolo') + ')' +
                      (d.tipo === 'medici' && d.upgrade ? ' + Upgrade' : ''));
  const gar = ltc ? [{ nome: liv.desc }]
                  : liv.gar.split(';').map(x => ({ nome: x.trim() })).filter(x => x.nome);
  /* L'eta' massima d'ingresso e' un limite della tariffa, non un dato del
     preventivo: chi chiama la API l'eta' ce l'ha, quindi gliela si dice. */
  const nota = 'Ingresso ammesso fino a ' + salute.salEtaMax(d) + ' anni.';
  return daPremio(nome, salute.calcolaSalute(d), gar, nota);
}

export const PRODOTTI = {
  casa: {
    attivo: true,
    tipo: 'quotazione',
    provider: 'hdi',
    /* Il minimo senza cui non ha senso disturbare il portale. Non e' la
       validazione completa: quella la fa HDI, che e' l'unico che sa davvero
       cosa accetta. Qui si evita solo di consumare un tentativo a vuoto. */
    obbligatori: ['provincia', 'mq'],
    quota: quotaCasa,
  },
  tutelalegale: {
    attivo: true, tipo: 'quotazione', provider: null,
    obbligatori: ['prodotto'], quota: quotaTutelaLegale,
  },
  animali: {
    attivo: true, tipo: 'quotazione', provider: null,
    obbligatori: ['tipo', 'pacchetto'], quota: quotaAnimali,
  },
  rcrischidiversi: {
    attivo: true, tipo: 'quotazione', provider: null,
    obbligatori: ['attivita', 'massimale', 'fatturato'], quota: quotaRcRischiDiversi,
  },
  viaggio: {
    attivo: true, tipo: 'quotazione', provider: null,
    obbligatori: ['dest', 'livello', 'dataPartenza', 'dataRientro'], quota: quotaViaggio,
  },
  salute: {
    attivo: true, tipo: 'quotazione', provider: null,
    obbligatori: ['tipo'], quota: quotaSalute,
  },
  amtrust: {
    attivo: true,
    tipo: 'quotazione',
    provider: null,
    obbligatori: ['prodotto'],
    quota: quotaAmtrust,
  },
  rcnonreg: {
    attivo: true,
    tipo: 'quotazione',
    provider: null,
    obbligatori: ['categoria', 'fatturato', 'massimale'],
    quota: quotaRcNonReg,
  },
  catastrofali: {
    attivo: true,
    tipo: 'quotazione',
    provider: null,
    obbligatori: ['cap', 'valore'],
    quota: quotaCatastrofali,
  },
};
