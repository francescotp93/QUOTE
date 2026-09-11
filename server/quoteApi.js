// ═══════════════════════════════════════════════════════════════════════════════
//  API DI QUOTAZIONE v1 — il contratto fra IAM, QUOTO e Lab
//
//  Il patto: IAM non deve sapere QUALE prodotto sta chiamando per interpretare
//  la risposta. Stessa forma per tutti, sempre — anche quando le cose vanno
//  male. Ogni prodotto che risponde a modo suo rimette dentro IAM la logica per
//  prodotto, cioè esattamente ciò da cui questa architettura sta scappando.
//
//  PERCHÉ DUE TEMPI (POST che accetta, GET che consegna).
//  Un prodotto a tariffa risponde in millisecondi; uno che passa da un portale
//  può metterci minuti — la Casa HDI arriva a ~230 secondi quando ripiega sul
//  browser, e il gateway taglia molto prima. Una POST che aspetta il risultato
//  funzionerebbe per i primi e fallirebbe per i secondi, e IAM dovrebbe sapere
//  quali sono quali. Accettando sempre e consegnando dopo, la differenza sparisce
//  dalla parte di IAM: chiede, riceve un identificativo, torna a chiedere.
//
//  QUI NON SI ARCHIVIA NIENTE DI CLIENTI. Lo storico sta in IAM, agganciato a
//  cliente e trattativa: un solo posto da presidiare per il GDPR. Quello che
//  resta qui è un lavoro in corso, in memoria, che scade da solo.
// ═══════════════════════════════════════════════════════════════════════════════
import express from 'express';
import crypto from 'crypto';
import { ERRORI, ok, ko, ora, chiaveInterna } from './apiComune.js';

/* Riesportato: chi importava ERRORI da qui continua a trovarlo. */
export { ERRORI };

const TTL_LAVORI = 15 * 60 * 1000;   // un lavoro finito resta leggibile un quarto d'ora
const SCADENZA_PROVIDER = 240 * 1000; // oltre, si dichiara TIMEOUT invece di restare appesi

/* Un risultato ha sempre gli stessi campi, anche quando il provider ne
   restituisce meno: IAM legge posizioni fisse, non «se c'è».
   `esito_id` (dal 11/09/2026) e' ADDITIVO: e' la riga del registro degli
   esiti (server/esiti.js) e serve a segnalare un premio che non torna. Puo'
   essere null se il registro non ha scritto; i sei campi del contratto non
   cambiano. */
function normalizzaRisultato(r, esito_id) {
  return {
    compagnia: String(r && r.compagnia || ''),
    premio_annuo: Number(r && r.premio_annuo || 0),
    premio_frazionato: Number(r && r.premio_frazionato || 0),
    frazionamento: ['annuale', 'semestrale', 'mensile'].includes(r && r.frazionamento) ? r.frazionamento : 'annuale',
    garanzie: Array.isArray(r && r.garanzie) ? r.garanzie : [],
    note: String(r && r.note || ''),
    esito_id: esito_id == null ? null : esito_id,
  };
}

export function creaApiQuotazione(conf) {
  const prodotti = conf.prodotti || {};
  const chiave = conf.chiave || '';
  const log = conf.log || (() => {});
  /* Il registro degli esiti: una riga per compagnia per tentativo, riuscito o
     no. Chi non lo passa (le prove) ha un registro muto: non deve mai far
     fallire una quotazione, quindi qualunque suo errore si ferma qui. */
  const registra = async (e) => { try { return await (conf.esiti || (async () => null))(e); } catch (_) { return null; } };
  const lavori = new Map();

  function pulisci() {
    const adesso = Date.now();
    for (const [id, l] of lavori) if (adesso - l.nato > TTL_LAVORI) lavori.delete(id);
  }

  const r = express.Router();

  r.use(chiaveInterna(chiave, log));

  /* Quali prodotti sono attivi. Spegnere il motor si fa QUI, e IAM se ne
     accorge da solo: nessuna modifica dall'altra parte. */
  r.get('/products', (req, res) => {
    res.json(ok({
      prodotti: Object.keys(prodotti).map(codice => ({
        codice,
        attivo: !!prodotti[codice].attivo,
        tipo: prodotti[codice].tipo || 'quotazione',
      })),
    }));
  });

  r.post('/quote/:prodotto', (req, res) => {
    pulisci();
    const codice = String(req.params.prodotto || '').toLowerCase();
    const p = prodotti[codice];
    if (!p || !p.attivo) {
      return res.status(404).json(ko('NOT_FOUND', 'Prodotto «' + codice + '» non disponibile. Chiedi /api/v1/products per l\'elenco attivo.'));
    }
    const dati = req.body || {};
    const mancanti = (p.obbligatori || []).filter(c => dati[c] == null || dati[c] === '');
    if (mancanti.length) {
      return res.status(400).json(ko('INVALID_INPUT', 'Dati mancanti: ' + mancanti.join(', ') + '.'));
    }
    if (!Object.keys(dati).length) {
      return res.status(400).json(ko('INVALID_INPUT', 'Nessun dato ricevuto: serve almeno il minimo per quotare.'));
    }

    const id = crypto.randomUUID();
    const lavoro = { stato: 'in_corso', prodotto: codice, risultati: [], nato: Date.now() };
    lavori.set(id, lavoro);
    /* Chi ha premuto, quando la chiamata arriva da IAM: la Edge Function lo
       scrive in X-Operatore dal token verificato. Qui e' solo un nome per il
       registro degli esiti, non un permesso. */
    const operatore = String(req.headers['x-operatore'] || '').trim() || null;
    const t0 = Date.now();
    const base = { modulo: 'api_v1', prodotto: codice, richiesta: dati, utente_nome: operatore, fonte: p.provider ? null : 'tariffa' };

    /* Il lavoro parte e non si aspetta: chi ha chiamato ha gia' il suo
       identificativo. Nessun await qui dentro, per costruzione. */
    (async () => {
      try {
        const esito = await Promise.race([
          p.quota(dati),
          new Promise((_, no) => setTimeout(() => no(Object.assign(new Error('scaduto'), { scaduto: true })), SCADENZA_PROVIDER)),
        ]);
        const durata_ms = Date.now() - t0;
        if (esito && esito.ok) {
          /* Una riga per compagnia: il registro e' per compagnia, non per chiamata. */
          const righe = [];
          for (const r of (esito.risultati || [])) {
            righe.push(normalizzaRisultato(r, await registra(Object.assign({}, base, {
              compagnia: r && r.compagnia, premio: r && r.premio_annuo, risposta: r, durata_ms,
            }))));
          }
          lavoro.risultati = righe;
          lavoro.stato = 'completo';
        } else {
          lavoro.stato = 'fallito';
          lavoro.errore = ko(
            (esito && esito.errore) || 'PROVIDER_UNAVAILABLE',
            (esito && esito.messaggio) || 'Il provider non ha restituito un preventivo.',
            (esito && esito.provider) || null,
            (esito && esito.riprova_dopo) ? { riprova_dopo: esito.riprova_dopo } : {}
          );
          lavoro.errore.esito_id = await registra(Object.assign({}, base, {
            compagnia: (esito && esito.provider) || p.provider || codice,
            esito: (esito && esito.errore) === 'INVALID_INPUT' ? 'non_quotabile' : ((esito && esito.errore) === 'TIMEOUT' ? 'timeout' : 'errore'),
            errore: ((esito && esito.errore) || 'PROVIDER_UNAVAILABLE') + ': ' + ((esito && esito.messaggio) || 'Il provider non ha restituito un preventivo.'),
            risposta: esito, durata_ms,
          }));
        }
      } catch (e) {
        /* Il messaggio interno del guasto NON esce: puo' contenere indirizzi,
           tracce e frammenti di pagina del portale. Chi chiama riceve un codice
           su cui puo' decidere; il dettaglio resta nel log tecnico. */
        log({ evento: 'guasto_provider', prodotto: codice, dettaglio: String(e && e.message || e), quando: ora() });
        lavoro.stato = 'fallito';
        lavoro.errore = e && e.scaduto
          ? ko('TIMEOUT', 'Il provider non ha risposto entro il tempo massimo.', p.provider || null)
          : ko('PROVIDER_UNAVAILABLE', 'Il provider non è raggiungibile.', p.provider || null);
        lavoro.errore.esito_id = await registra(Object.assign({}, base, {
          compagnia: p.provider || codice, esito: e && e.scaduto ? 'timeout' : 'errore',
          errore: String(e && e.message || e), durata_ms: Date.now() - t0,
        }));
      }
    })();

    res.status(202).json(ok({ quote_id: id, prodotto: codice, stato: 'in_corso', risultati: [] }));
  });

  r.get('/quote/:quote_id', (req, res) => {
    pulisci();
    const l = lavori.get(String(req.params.quote_id));
    if (!l) {
      return res.status(404).json(ko('NOT_FOUND', 'Quotazione non trovata: identificativo sconosciuto o scaduto.'));
    }
    if (l.stato === 'fallito') {
      return res.status(200).json(Object.assign({}, l.errore, { quote_id: req.params.quote_id, prodotto: l.prodotto, stato: 'fallito', risultati: [] }));
    }
    res.json(ok({ quote_id: req.params.quote_id, prodotto: l.prodotto, stato: l.stato, risultati: l.risultati }));
  });

  return r;
}
