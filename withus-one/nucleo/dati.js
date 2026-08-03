/* ═══════════════════════════════════════════════════════════════════════════
   DATI — il collegamento a Supabase e al backend
   Un client solo per tutta l'applicazione: due client significano due sessioni
   che si contendono lo stesso token, ed è così che si perde il login.
   ═══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://ekjxrnsfqxnfxzrthdcf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVranhybnNmcXhuZnh6cnRoZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzU4NjcsImV4cCI6MjA5NTAxMTg2N30.2OF2COAcLgM22xbmtqLWXgaDcVLtNh3AuX5MQ4_L02I';
const BACKEND = 'https://api.withusassicurazioni.it';
const SUPER_ADMIN = 'francesco.oddo199307@gmail.com';

/* In un riquadro servito da un altro dominio il browser NEGA il magazzino:
   leggerlo SOLLEVA un errore, non restituisce vuoto. È già costato un bug
   in produzione (29/07/2026): qui si mette la rete prima di ogni altra cosa. */
(function reteMagazzino() {
  const inMemoria = () => {
    let m = {};
    return {
      getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); },
      removeItem: k => { delete m[k]; },
      clear: () => { m = {}; },
      key: i => Object.keys(m)[i] || null,
      get length() { return Object.keys(m).length; }
    };
  };
  ['sessionStorage', 'localStorage'].forEach(nome => {
    let ok = false;
    try { const s = window[nome]; s.setItem('__w1', '1'); s.removeItem('__w1'); ok = true; } catch (e) {}
    if (!ok) { try { Object.defineProperty(window, nome, { value: inMemoria(), configurable: true, writable: true }); } catch (e) {} }
  });
})();

export let db = null;
export let utente = null;

export function avviaDb() {
  if (db) return db;
  if (!window.supabase) throw new Error('Servizio di accesso non disponibile. Ricarica la pagina.');
  /* Dentro un riquadro di un'altra applicazione questo programma è OSPITE:
     non salva e non rinnova la sessione, perché ruotando il token farebbe
     revocare la sessione a chi lo ospita (già successo, 29/07/2026). */
  const ospite = window.self !== window.top;
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY,
    ospite ? { auth: { persistSession: false, autoRefreshToken: false } } : undefined);
  return db;
}

/* Se si arriva da un'altra applicazione con i token nell'indirizzo, si
   ripristina la sessione e si ripulisce subito la barra: un token che resta
   scritto nell'indirizzo finisce nella cronologia del browser. */
export async function raccogliSessioneDaIndirizzo() {
  try {
    const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const at = h.get('at'), rt = h.get('rt');
    if (at && rt) {
      await db.auth.setSession({ access_token: at, refresh_token: rt });
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch (e) { console.warn('ripristino sessione non riuscito:', e.message || e); }
}

export async function caricaUtente(sessione) {
  const u = sessione.user || sessione;
  let profilo = null;
  try {
    const { data } = await db.from('iam_utenti').select('*').eq('id', u.id).maybeSingle();
    profilo = data;
  } catch (e) { console.warn('profilo non leggibile:', e.message || e); }

  const email = (u.email || '').toLowerCase();
  const ruolo = (profilo && profilo.ruolo) || 'collaboratore';
  /* Gli stessi nomi che usa la riservatezza del database (iam_mio_ruolo):
     top_master conta come admin, master come operatore. Se qui si scrivesse
     un elenco diverso, l'interfaccia mostrerebbe cose che il database poi
     rifiuta — o peggio il contrario. */
  const admin = ['admin', 'top_master'].includes(ruolo) || email === SUPER_ADMIN;
  const staff = admin || ['operatore', 'master'].includes(ruolo);

  utente = {
    id: u.id, email,
    nome: (profilo && profilo.nome) || u.user_metadata?.full_name || email.split('@')[0] || 'Utente',
    ruolo, staff, admin,
    attivo: profilo ? profilo.attivo !== false : true,
    rete: profilo ? profilo.rete : null
  };
  return utente;
}

/* ── Backend sul VPS ────────────────────────────────────────────────────────
   Tutto ciò che richiede un segreto (Brevo, pagamenti, scraper) passa da qui:
   le chiavi stanno nel .env del server, mai in questa pagina che è pubblica. */
async function token() {
  try { const { data } = await db.auth.getSession(); return data?.session?.access_token || ''; }
  catch (e) { return ''; }
}

async function chiama(percorso, opzioni = {}) {
  const r = await fetch(BACKEND + percorso, {
    ...opzioni,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (await token()), ...(opzioni.headers || {}) }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('Errore ' + r.status));
  return d;
}

export const api = {
  get: (p) => chiama(p),
  post: (p, corpo) => chiama(p, { method: 'POST', body: JSON.stringify(corpo || {}) })
};

export default { avviaDb, caricaUtente, raccogliSessioneDaIndirizzo, api };
