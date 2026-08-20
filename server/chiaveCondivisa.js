// ═══════════════════════════════════════════════════════════════════════════════
//  LA CHIAVE DEL PONTE — dove sta, e perché non sta in un file
//
//  L'API v1 si apre con una chiave condivisa fra i due lati del ponte. Il lato
//  QUOTO è questo backend. Il lato IAM NON è un server: IAM è un sito statico su
//  GitHub Pages, e nel browser un segreto non è un segreto — chiunque apra gli
//  strumenti di sviluppo se lo legge. Il pezzo di server dalla parte di IAM è una
//  Edge Function di Supabase.
//
//  Quindi la chiave deve stare in due posti. Farla copiare a mano vuol dire
//  farla passare per una chat, per un ramo di git o per un appunto sul telefono:
//  tre posti dove un segreto non torna più indietro. Invece la chiave NASCE
//  dentro Supabase (`ponte_segreti`, nessuna policy RLS: solo il service_role la
//  vede) e i due lati la leggono da lì, ognuno con la propria chiave di servizio,
//  che ce l'hanno già.
//
//  Nessuno la digita. Nessuno la incolla. Nessuno la vede.
//
//  RESTA VALIDA LA VARIABILE D'AMBIENTE. Se `INTERNAL_API_KEY` è impostata nel
//  .env, vince lei e Supabase non viene nemmeno interrogato: è la via di fuga se
//  un giorno il database non è raggiungibile e bisogna riaprire il ponte a mano.
//
//  SE NON SI RIESCE A LEGGERLA, LA PORTA RESTA CHIUSA. La funzione restituisce
//  stringa vuota, e il guardiano dell'API risponde 401 a tutto. Meglio un'API
//  che non si apre che una che si apre a chiunque perché il segreto non è
//  arrivato.
// ═══════════════════════════════════════════════════════════════════════════════

import crypto from 'crypto';

const RIPROVA_MS = 60 * 1000;      // se la lettura fallisce, si riprova al più ogni minuto
const RINFRESCA_MS = 30 * 60 * 1000; // e comunque si rilegge ogni mezz'ora: la chiave si può cambiare

export function chiaveCondivisa(conf) {
  const url = String((conf && conf.url) || '').replace(/\/+$/, '');
  const servizio = String((conf && conf.servizio) || '');
  const nome = (conf && conf.nome) || 'internal_api_key';
  const log = (conf && conf.log) || (() => {});
  const recupera = (conf && conf.recupera) || leggiDaSupabase;
  /* Regolabili solo per poterli mettere alla prova: in esercizio valgono i due
     numeri qui sopra. Una prova che deve aspettare mezz'ora non è una prova. */
  const riprovaMs = (conf && conf.riprovaMs != null) ? conf.riprovaMs : RIPROVA_MS;
  const rinfrescaMs = (conf && conf.rinfrescaMs != null) ? conf.rinfrescaMs : RINFRESCA_MS;

  /* La variabile d'ambiente vince, e se c'è non si interroga nessuno. */
  let valore = String(process.env.INTERNAL_API_KEY || '');
  const daAmbiente = !!valore;
  let letta = daAmbiente ? Date.now() : 0;
  let ultimoTentativo = 0;
  let inCorso = null;

  async function leggiDaSupabase() {
    const r = await fetch(url + '/rest/v1/ponte_segreti?select=valore&nome=eq.' + encodeURIComponent(nome), {
      headers: { apikey: servizio, Authorization: 'Bearer ' + servizio, Accept: 'application/json' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const righe = await r.json();
    const v = Array.isArray(righe) && righe[0] && righe[0].valore;
    if (!v) throw new Error('il segreto «' + nome + '» non c\'è in ponte_segreti');
    return String(v);
  }

  function aggiorna() {
    if (inCorso) return inCorso;
    ultimoTentativo = Date.now();
    inCorso = Promise.resolve()
      .then(() => {
        if (!url || !servizio) throw new Error('manca SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY nel .env');
        return recupera();
      })
      .then((v) => {
        const cambiata = v !== valore;
        valore = v; letta = Date.now();
        /* Non si scrive MAI il valore nel registro: solo l'impronta, che serve
           a confrontare i due lati del ponte senza mostrarne nessuno. */
        if (cambiata) log({ evento: 'chiave_letta', da: 'supabase', impronta: impronta(v), quando: new Date().toISOString() });
      })
      .catch((e) => {
        log({ evento: 'chiave_non_letta', motivo: String(e && e.message || e), quando: new Date().toISOString() });
      })
      .finally(() => { inCorso = null; });
    return inCorso;
  }

  if (!daAmbiente) aggiorna();

  /* Il guardiano dell'API chiama questa a ogni richiesta: deve costare niente e
     non può aspettare. Se la chiave manca o è vecchia, fa partire la lettura e
     intanto risponde con quello che ha — cioè, all'inizio, niente. */
  const dammi = function () {
    if (!daAmbiente) {
      const adesso = Date.now();
      const scaduta = adesso - letta >= rinfrescaMs;
      const puoRiprovare = adesso - ultimoTentativo >= riprovaMs;
      if ((!valore || scaduta) && puoRiprovare) aggiorna();
    }
    return valore;
  };
  /* «La chiave che mi hanno dato non corrisponde»: forse è stata cambiata e qui
     c'è ancora quella vecchia. Il guardiano chiama questa, che si limita da sé a
     un tentativo al minuto — così un cambio chiave si riassorbe in un minuto
     invece che in mezz'ora, e chi bussa a vuoto non può farne una tempesta. */
  dammi.rileggi = () => {
    if (daAmbiente) return;
    if (Date.now() - ultimoTentativo >= riprovaMs) aggiorna();
  };
  dammi.pronta = () => !!valore;
  dammi.impronta = () => impronta(valore);
  dammi.aspetta = () => (inCorso || Promise.resolve());
  return dammi;
}

/* Prime 12 cifre dello sha256: due copie della stessa chiave hanno la stessa
   impronta, e dall'impronta non si torna alla chiave. */
export function impronta(v) {
  if (!v) return null;
  return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 12);
}
