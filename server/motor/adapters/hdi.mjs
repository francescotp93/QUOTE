// ─────────────────────────────────────────────────────────────────────────────
//  ADAPTER HDI — il SECONDO adapter, la prova che l'astrazione regge
//
//  È deliberatamente minimo: avvolge la via diretta HDI (/premio-motor) che
//  esiste già. Il punto non è coprire ogni caso HDI, ma dimostrare che una
//  compagnia diversa si aggancia SENZA toccare il nucleo né il contratto. Se
//  per farlo servisse cambiare uno dei due, il confine sarebbe sbagliato.
//
//  Stesso schema del moto: qui c'è solo il dialetto HDI (URL, parametri, forma
//  della risposta). Retry/timeout/log/validazione stanno nel nucleo.
// ─────────────────────────────────────────────────────────────────────────────
import { esitoOk, esitoErrore } from '../../../scraper/comune/contratto.mjs';

const italiana = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
};

/** @param base URL dello scraper HDI (es. http://127.0.0.1:4400) */
export function adapterHdi(base) {
  return {
    compagnia: 'HDI Assicurazioni',
    prodotto: 'RC Motor',
    async quota(prev, ctx) {
      const c = prev.cliente, v = prev.veicolo, p = prev.polizza;
      const q = new URLSearchParams({ targa: v.targa, nascita: italiana(c.dataNascita) });
      q.set('linea', v.tipo === 'moto' || v.tipo === 'ciclomotore' ? 'moto' : 'auto');
      if (p.tipoGuida) q.set('tipoGuida', p.tipoGuida);
      if (p.massimale) q.set('massimale', p.massimale);
      if (p.frazionamento) q.set('frazionamento', p.frazionamento);
      if (p.garanzie.length) q.set('garanzie', p.garanzie.join(','));
      const ind = c.indirizzo;
      if (ind.prov) q.set('prov', ind.prov);
      if (ind.comune) q.set('comune', ind.comune);
      if (ind.cap) q.set('cap', ind.cap);

      const r = await ctx.esegui(() => ctx.chiama(`${base}/premio-motor?${q.toString()}`, { timeoutMs: 60000 }),
        { tentativi: 2, timeoutMs: 65000, attesaMs: 2500 });
      const d = (r && r.json) || {};

      if (d.premio_annuale_num == null) {
        return esitoErrore(this.compagnia,
          /login|sessione|token/i.test(d.error || '') ? 'SESSIONE' : 'RIFIUTO_COMPAGNIA',
          d.error || 'HDI non ha restituito un premio.', 'lettura_premio');
      }
      return esitoOk(this.compagnia, {
        prodotto: this.prodotto,
        premio_annuo: d.premio_annuale_num,
        frazionamento: p.frazionamento || 'Annuale',
        garanzie_incluse: d.garanzie || d.garanzie_incluse || [],
        veicolo: d.veicolo || null,
      });
    },
  };
}
