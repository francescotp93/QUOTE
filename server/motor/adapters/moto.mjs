// ─────────────────────────────────────────────────────────────────────────────
//  ADAPTER MOTO / 24H (Moto Platinum) — avvolge il flusso ESISTENTE, non lo tocca
//
//  Non riscrive lo scraper moto: chiama il suo endpoint /quote (quello che oggi
//  funziona in produzione) e traduce la sua risposta nell'Esito del contratto.
//  Tutto ciò che è comune — retry, timeout, log, validazione — lo mette il
//  nucleo; qui c'è solo il DIALETTO del 24H: quale URL, quali parametri, come
//  si legge la sua risposta.
// ─────────────────────────────────────────────────────────────────────────────
import { esitoOk, esitoErrore } from '../../../scraper/comune/contratto.mjs';

const italiana = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
};

/** @param base URL dello scraper moto (es. http://127.0.0.1:4100) */
export function adapterMoto(base) {
  return {
    compagnia: 'Moto Platinum',
    prodotto: 'RC Moto',
    async quota(prev, ctx) {
      const c = prev.cliente, v = prev.veicolo;
      const q = new URLSearchParams({ targa: v.targa, nascita: italiana(c.dataNascita) });
      if (c.codiceFiscale) q.set('cf', c.codiceFiscale);
      if (c.indirizzo.comune) q.set('comune', c.indirizzo.comune);
      if (prev.polizza.garanzie.length) q.set('garanzie', prev.polizza.garanzie.join(','));

      // Una sola chiamata, ma col timeout/retry del nucleo: il portale 24H è lento.
      const r = await ctx.esegui(() => ctx.chiama(`${base}/quote?${q.toString()}`, { timeoutMs: 235000 }),
        { tentativi: 1, timeoutMs: 240000 });
      const d = (r && r.json) || {};

      if (!d.ok || d.premio_totale_num == null) {
        return esitoErrore(this.compagnia,
          /login|sessione/i.test(d.error || '') ? 'SESSIONE' : 'RIFIUTO_COMPAGNIA',
          d.error || 'Moto Platinum non ha restituito un premio.', 'lettura_premio');
      }
      return esitoOk(this.compagnia, {
        prodotto: this.prodotto,
        premio_annuo: d.premio_totale_num,
        frazionamento: 'Annuale',
        garanzie_incluse: ['Rinuncia alla rivalsa', ...(d.garanzie_incluse || [])],
        opzioni: d.opzione_incendio_furto != null
          ? [{ nome: 'Incendio e furto', premio_annuo: numIt(d.opzione_incendio_furto) }] : [],
        veicolo: d.veicolo || null,
      });
    },
  };
}

function numIt(s) { const n = Number(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; }
