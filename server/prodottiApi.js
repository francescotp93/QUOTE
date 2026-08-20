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
};
