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
