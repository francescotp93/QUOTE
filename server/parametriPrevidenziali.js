// ── QUOTO · I numeri di legge del calcolo pensione, serviti alla schermata ────
/* La tabella quote_parametri_previdenziali e' l'archivio: coefficienti di
   trasformazione, aliquote di computo, tetto di deducibilita', tassazione della
   prestazione. Ognuno con la sua fonte e la data in cui va ricontrollato.

   Questo file la serve a chi calcola. UNA porta sola, per un motivo preciso:
   il motore (tariffe/motore/previdenza.js) tiene una copia di riserva dentro
   di se', e finche' esiste una copia esiste il rischio che le due divergano.
   Facendo passare la schermata sempre da qui, la copia di riserva resta quello
   che deve essere — il paracadute per quando il server non risponde — e non
   diventa una seconda verita'.

   NON si legge da Supabase con la chiave del browser: la protezione della
   tabella la riserva allo staff (iam_is_staff), e l'analisi previdenziale la
   fa anche il collaboratore della rete al suo cliente. Passando di qui la
   legge chiunque sia autenticato, e nessuno puo' scriverla. */
import { Router } from 'express';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
}

export async function leggiParametri() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/quote_parametri_previdenziali?select=chiave,valore,unita,fonte,aggiornato_il,scade_il,ricontrolla_il,derivato,nota`, { headers: sbHeaders() });
  if (!r.ok) throw new Error('Supabase select: ' + (await r.text()).slice(0, 200));
  const righe = await r.json();
  const valori = {}, schede = {}, fonti = {};
  for (const x of righe) { valori[x.chiave] = x.valore; schede[x.chiave] = x; fonti[x.chiave] = x.fonte || null; }
  return { valori, schede, fonti };
}

/* Un parametro scaduto NON blocca il calcolo: il giorno in cui l'ISTAT pubblica
   in ritardo l'agenzia deve poter lavorare lo stesso. Ma l'avviso viaggia col
   risultato e finisce stampato sul foglio del cliente — il motore lo porta
   avanti fino al report. Nascondere il ritardo sarebbe l'unica scelta davvero
   sbagliata: darebbe un documento che sembra definitivo e non lo e'. */
export function avvisiSuiParametri(schede, chiaviUsate, oggi = new Date()) {
  const giorno = oggi.toISOString().slice(0, 10);
  const fuori = [];
  for (const k of chiaviUsate) {
    const s = schede[k];
    if (!s) { fuori.push(`Il parametro «${k}» non è nella tabella dei parametri previdenziali: il calcolo sta usando la copia di riserva del programma.`); continue; }
    if (s.scade_il && s.scade_il < giorno) {
      fuori.push(`«${s.chiave}» è scaduto il ${s.scade_il}: il calcolo è stato fatto con il valore vecchio.`);
    } else if (s.ricontrolla_il && s.ricontrolla_il < giorno) {
      fuori.push(`«${s.chiave}» andava ricontrollato il ${s.ricontrolla_il}.`);
    }
    if (s.derivato === true) {
      fuori.push(`«${s.chiave}» è un valore ricavato da una norma, non copiato da una circolare: va confermato dal commercialista prima di consegnare il documento.`);
    }
  }
  return fuori;
}

// Le chiavi che il motore del browser sa usare. Le altre restano in tabella.
export const CHIAVI_USATE = ['coefficienti_trasformazione', 'aliquote_computo', 'tetto_deducibilita', 'tassazione_prestazione', 'tassazione_rendimenti'];

/* La tabella dei coefficienti nella forma che il motore si aspetta
   (`{ biennio, daVerificare, perEta }`), con dentro gli avvisi. Le chiavi di
   perEta sono numeri: in JSON arrivano come stringhe e il motore cerca per
   numero — la conversione va fatta QUI, non sperata. */
const giornoItaliano = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
};

export function tabellaCoefficienti(valori, schede, avvisi) {
  const grezzo = valori.coefficienti_trasformazione;
  if (!grezzo || typeof grezzo !== 'object') return null;
  const perEta = {};
  for (const k of Object.keys(grezzo)) {
    const eta = Number(k), v = Number(grezzo[k]);
    if (Number.isFinite(eta) && Number.isFinite(v)) perEta[eta] = v;
  }
  if (!Object.keys(perEta).length) return null;
  const s = schede.coefficienti_trasformazione || {};
  /* IL PERIODO NON SI INDOVINA LEGGENDO LA NOTA. Il primo tentativo pescava la
     prima coppia di anni che trovava nel testo, e la nota vera dice «Il decreto
     2027-2028 non è ancora pubblicato»: la tabella si dichiarava del biennio
     2027-2028 usando i coefficienti del 2025-2026, e quella scritta sarebbe
     finita sul report del cliente. Adesso il periodo esce da `scade_il`, che è
     un campo con un significato, non da una frase scritta a mano. */
  return {
    biennio: s.scade_il ? 'in vigore fino al ' + giornoItaliano(s.scade_il) : 'in vigore',
    /* Un valore che arriva dall'archivio, con la sua fonte e la sua data, e'
       verificato per definizione: e' l'archivio a dire qual e'. */
    daVerificare: false,
    fonte: s.fonte || null,
    nota: s.nota || null,
    aggiornato_il: s.aggiornato_il || null,
    avvisi: avvisi || [],
    perEta,
  };
}

export const parametriPrevRouter = Router();

// Tutto quello che serve alla schermata dell'analisi previdenziale, in un colpo.
parametriPrevRouter.get('/numeri', async (req, res) => {
  try {
    const { valori, schede, fonti } = await leggiParametri();
    const avvisi = avvisiSuiParametri(schede, CHIAVI_USATE);
    res.json({
      ok: true,
      numeri: {
        tetto_deducibilita: valori.tetto_deducibilita ?? null,
        tassazione_prestazione: valori.tassazione_prestazione ?? null,
        tassazione_rendimenti: valori.tassazione_rendimenti ?? null,
        aliquote_computo: valori.aliquote_computo ?? null,
        __fonti: fonti,
      },
      coefficienti: tabellaCoefficienti(valori, schede, avvisi),
      avvisi,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
