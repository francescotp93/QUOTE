// ═══════════════════════════════════════════════════════════════════════════════
//  DESTINATARI — chi riceve una campagna, e come ci arriva
//
//  Prima una campagna poteva partire solo su una lista Brevo: un elenco costruito
//  fuori dal gestionale, che invecchia da solo. I gruppi (Famiglia Rossi, Studio
//  X) vivevano in anagrafica e il marketing non li vedeva.
//
//  Qui un destinatario puo' essere tre cose:
//    · una LISTA Brevo, come prima;
//    · un GRUPPO di anagrafiche (quote_gruppi);
//    · un SEGMENTO, cioe' dei filtri salvati (quote_segmenti).
//
//  Gruppi e segmenti si risolvono AL MOMENTO, non quando sono stati creati: si
//  guarda chi c'e' dentro adesso e lo si riversa in una lista Brevo dedicata.
//  La lista resta il binario di Brevo — statistiche, click, disiscrizioni — ma
//  la verita' su chi ne fa parte sta in Supabase.
//
//  Due regole non negoziabili, applicate qui e non nell'interfaccia (una regola
//  che vive solo in una schermata si aggira con una chiamata fatta a mano):
//    1. CONSENSO. Chi non ha `consenso_marketing = true` non entra in nessuna
//       lista. Mai. Un invio commerciale senza consenso tracciato e' un rischio
//       che ricade sull'agenzia.
//    2. VISIBILITA'. Le letture su Supabase viaggiano con il token di CHI
//       CHIEDE, non con la chiave di servizio: cosi' la Row Level Security vale
//       anche qui, e nessuno sincronizza un gruppo che non potrebbe vedere.
// ═══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const BREVO = 'https://api.brevo.com/v3';

/* ── Supabase con il token dell'utente ─────────────────────────────────────────
   `apikey` serve solo al gateway; il ruolo e i permessi li decide il Bearer,
   cioe' la sessione della persona che ha aperto la pagina. */
function sbHeaders(token) {
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('SUPABASE_ANON_KEY non configurata sul server.');
  return { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
}

export async function sbGet(token, path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(token) });
  const t = await r.text();
  if (!r.ok) throw new Error('Supabase: ' + (t.slice(0, 200) || r.status));
  return t ? JSON.parse(t) : [];
}

export async function sbPatch(token, path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...sbHeaders(token), Prefer: 'return=representation' }, body: JSON.stringify(body)
  });
  const t = await r.text();
  if (!r.ok) throw new Error('Supabase: ' + (t.slice(0, 200) || r.status));
  return t ? JSON.parse(t) : [];
}

export async function sbPost(token, path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST', headers: { ...sbHeaders(token), Prefer: 'return=representation' }, body: JSON.stringify(body)
  });
  const t = await r.text();
  if (!r.ok) throw new Error('Supabase: ' + (t.slice(0, 200) || r.status));
  return t ? JSON.parse(t) : [];
}

export async function sbDelete(token, path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'DELETE', headers: sbHeaders(token) });
  if (!r.ok) throw new Error('Supabase: ' + ((await r.text()).slice(0, 200) || r.status));
}

/* PostgREST: virgole e parentesi dentro un valore romperebbero il filtro. */
const pulisci = (s) => String(s == null ? '' : s).replace(/[(),]/g, ' ').trim();

/* ── L'elenco dei campi che ci servono di un'anagrafica ───────────────────── */
const CAMPI_ANAG = 'id,nominativo,cognome,nome,email,consenso_marketing,privacy_firma,data_nascita,tipo,'
  + 'sposato,ha_figli,casa_proprieta,stato_civile,professione,comune,provincia,intermediario_id,lead';

/* Il consenso vale se c'è il campo OPPURE se la privacy è stata firmata con la
   spunta del marketing elettronico. La seconda strada non è un'eccezione di
   comodo: è la forma più forte di consenso che l'agenzia possiede, e c'erano
   anagrafiche firmate prima che il campo esistesse. Alla firma il campo viene
   scritto (server/sign.js), quindi le due strade convergono da sole; questa
   resta per lo storico e perché IAM conta i «buchi» con la stessa regola. */
function haConsenso(a) {
  if (a.consenso_marketing === true) return true;
  const pf = a.privacy_firma;
  return !!(pf && pf.stato === 'firmata' && pf.consensi && pf.consensi.marketing_elettronico === true);
}

/* Un contatto vale per una campagna solo se ha un indirizzo E il consenso.
   Le due cose si contano separate perche' dicono due cose diverse: «manca la
   mail» e' lavoro di segreteria, «manca il consenso» e' una domanda da fare al
   cliente. */
function smista(righe) {
  const contattabili = [], senzaEmail = [], senzaConsenso = [];
  for (const a of righe || []) {
    const mail = String(a.email || '').trim();
    if (!mail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { senzaEmail.push(a); continue; }
    if (!haConsenso(a)) { senzaConsenso.push(a); continue; }
    contattabili.push({ ...a, email: mail.toLowerCase() });
  }
  return { contattabili, senzaEmail, senzaConsenso, totale: (righe || []).length };
}

/* ── GRUPPO: chi ne fa parte adesso ───────────────────────────────────────── */
export async function membriGruppo(token, gruppoId) {
  const membri = await sbGet(token, `quote_gruppi_membri?gruppo_id=eq.${encodeURIComponent(gruppoId)}&select=anagrafica_id`);
  const ids = [...new Set((membri || []).map(m => m.anagrafica_id))];
  if (!ids.length) return smista([]);
  const anag = await sbGet(token, `quote_anagrafiche?id=in.(${ids.join(',')})&select=${CAMPI_ANAG}`);
  return smista(anag);
}

/* ── SEGMENTO: chi risponde ai criteri adesso ─────────────────────────────────
   I filtri sull'anagrafica li fa il database (sono indicizzati e riducono
   subito le righe). Quelli che dipendono dalle polizze — «ha una polizza auto»,
   «scade a settembre», «NON ha la casa» — arrivano dopo, incrociando in memoria:
   sono insiemi piccoli e una join qui costerebbe piu' complicazione che tempo.

   `senza_prodotto` e' il filtro che vale piu' di tutti gli altri messi insieme:
   e' il cross-selling, cioe' i clienti che hanno una cosa sola e potrebbero
   averne due. */
export async function membriSegmento(token, filtri) {
  const f = filtri || {};
  const q = [`select=${CAMPI_ANAG}`];

  if (f.tipo) q.push(`tipo=eq.${encodeURIComponent(f.tipo)}`);
  if (f.solo_clienti) q.push('lead=eq.false');
  if (f.solo_lead) q.push('lead=eq.true');
  if (f.sposato === true || f.sposato === false) q.push(`sposato=is.${f.sposato}`);
  if (f.ha_figli === true || f.ha_figli === false) q.push(`ha_figli=is.${f.ha_figli}`);
  if (f.casa_proprieta === true || f.casa_proprieta === false) q.push(`casa_proprieta=is.${f.casa_proprieta}`);
  if (f.intermediario_id) q.push(`intermediario_id=eq.${encodeURIComponent(f.intermediario_id)}`);
  if (f.provincia) q.push(`provincia=ilike.*${encodeURIComponent(pulisci(f.provincia))}*`);
  if (f.comune) q.push(`comune=ilike.*${encodeURIComponent(pulisci(f.comune))}*`);
  if (f.professione) q.push(`professione=ilike.*${encodeURIComponent(pulisci(f.professione))}*`);

  /* L'eta' e' una data di nascita al contrario: chi ha almeno 40 anni e' nato
     PRIMA di oggi-40anni. Invertire i due estremi qui e' l'errore classico. */
  const oggi = new Date();
  const menoAnni = (n) => new Date(oggi.getFullYear() - n, oggi.getMonth(), oggi.getDate()).toISOString().slice(0, 10);
  if (Number.isFinite(Number(f.eta_min))) q.push(`data_nascita=lte.${menoAnni(Number(f.eta_min))}`);
  if (Number.isFinite(Number(f.eta_max))) q.push(`data_nascita=gte.${menoAnni(Number(f.eta_max) + 1)}`);

  let anag = await sbGet(token, 'quote_anagrafiche?' + q.join('&'));

  /* Appartenenza a un gruppo, o a un tipo di gruppo (tutte le famiglie). */
  if (f.gruppo_id || f.gruppo_tipo) {
    let gids = [];
    if (f.gruppo_id) gids = [f.gruppo_id];
    else {
      const gr = await sbGet(token, `quote_gruppi?tipo=eq.${encodeURIComponent(f.gruppo_tipo)}&select=id`);
      gids = (gr || []).map(g => g.id);
    }
    const dentro = gids.length
      ? await sbGet(token, `quote_gruppi_membri?gruppo_id=in.(${gids.join(',')})&select=anagrafica_id`)
      : [];
    const set = new Set((dentro || []).map(m => m.anagrafica_id));
    anag = anag.filter(a => set.has(a.id));
  }

  /* I filtri di portafoglio. Una sola lettura delle polizze, poi si incrocia. */
  const usaPolizze = f.prodotto || f.senza_prodotto || f.compagnia || f.scadenza_da || f.scadenza_a || f.con_polizze;
  if (usaPolizze && anag.length) {
    const ids = anag.map(a => a.id);
    const p = ['select=cliente_id,prodotto,compagnia,data_scadenza', `cliente_id=in.(${ids.join(',')})`];
    if (f.compagnia) p.push(`compagnia=ilike.*${encodeURIComponent(pulisci(f.compagnia))}*`);
    if (f.scadenza_da) p.push(`data_scadenza=gte.${encodeURIComponent(f.scadenza_da)}`);
    if (f.scadenza_a) p.push(`data_scadenza=lte.${encodeURIComponent(f.scadenza_a)}`);
    const pol = await sbGet(token, 'quote_polizze?' + p.join('&'));

    const combacia = (x, nome) => String(x.prodotto || '').toLowerCase().includes(String(nome).toLowerCase());
    if (f.prodotto) {
      const set = new Set(pol.filter(x => combacia(x, f.prodotto)).map(x => x.cliente_id));
      anag = anag.filter(a => set.has(a.id));
    }
    if (f.compagnia || f.scadenza_da || f.scadenza_a || f.con_polizze) {
      const set = new Set(pol.map(x => x.cliente_id));
      anag = anag.filter(a => set.has(a.id));
    }
    /* Il «non ce l'ha» si guarda su TUTTE le sue polizze, non su quelle filtrate
       da compagnia o scadenza: uno che ha la casa con un'altra compagnia la casa
       ce l'ha lo stesso, e mandargli l'offerta casa e' una figura. */
    if (f.senza_prodotto) {
      const tutte = await sbGet(token, `quote_polizze?select=cliente_id,prodotto&cliente_id=in.(${ids.join(',')})`);
      const hanno = new Set(tutte.filter(x => combacia(x, f.senza_prodotto)).map(x => x.cliente_id));
      anag = anag.filter(a => !hanno.has(a.id));
    }
  }

  return smista(anag);
}

/* ═══ IL PONTE VERSO BREVO ══════════════════════════════════════════════════ */

export function brevoFetch(percorso, opzioni = {}) {
  const k = process.env.BREVO_API_KEY;
  if (!k) throw new Error('BREVO_API_KEY non configurata sul server.');
  return fetch(BREVO + percorso, {
    ...opzioni,
    headers: { 'api-key': k, 'content-type': 'application/json', accept: 'application/json', ...(opzioni.headers || {}) }
  }).then(async (r) => {
    const testo = await r.text();
    let corpo = null;
    try { corpo = testo ? JSON.parse(testo) : null; } catch (e) { corpo = { raw: testo.slice(0, 300) }; }
    if (!r.ok) {
      const err = new Error('Brevo: ' + ((corpo && (corpo.message || corpo.code)) || ('HTTP ' + r.status)));
      err.stato = r.status;
      throw err;
    }
    return corpo;
  });
}

/* Le liste generate dal gestionale stanno in una cartella loro: chi apre Brevo
   deve capire in un colpo d'occhio cosa e' nato qui e cosa e' stato caricato a
   mano, altrimenti fra sei mesi nessuno sa piu' quale lista si puo' toccare. */
const CARTELLA = 'IAM · generate dal gestionale';
async function cartellaIam() {
  const d = await brevoFetch('/contacts/folders?limit=50');
  const trovata = (d.folders || []).find(f => f.name === CARTELLA);
  if (trovata) return trovata.id;
  const nuova = await brevoFetch('/contacts/folders', { method: 'POST', body: JSON.stringify({ name: CARTELLA }) });
  return nuova.id;
}

async function listaEsiste(id) {
  if (!id) return false;
  try { await brevoFetch('/contacts/lists/' + id); return true; } catch (e) { return false; }
}

/* Tutti gli iscritti attuali della lista, per capire chi va tolto. */
async function iscrittiLista(id) {
  const out = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const d = await brevoFetch(`/contacts/lists/${id}/contacts?limit=500&offset=${offset}`);
    const c = d.contacts || [];
    out.push(...c.map(x => String(x.email || '').toLowerCase()));
    if (c.length < 500) break;
  }
  return out;
}

/* ── La sincronizzazione ──────────────────────────────────────────────────────
   Idempotente di proposito: la stessa lista viene riusata a ogni invio, si
   aggiungono i nuovi e si tolgono quelli che non fanno piu' parte del gruppo.
   Creare una lista nuova ogni volta riempirebbe Brevo di «Famiglia Rossi (7)»
   e spezzerebbe le statistiche fra l'una e l'altra. */
export async function sincronizza({ nomeLista, listIdEsistente, contattabili }) {
  let listId = (await listaEsiste(listIdEsistente)) ? listIdEsistente : null;
  if (!listId) {
    const folderId = await cartellaIam();
    const l = await brevoFetch('/contacts/lists', { method: 'POST', body: JSON.stringify({ name: nomeLista, folderId }) });
    listId = l.id;
  }

  const volute = contattabili.map(c => c.email);
  const dentro = await iscrittiLista(listId);
  const daTogliere = dentro.filter(e => !volute.includes(e));

  if (volute.length) {
    /* `updateExistingContacts` aggiorna nome e cognome di chi c'e' gia';
       `emptyContactsAttributes: false` evita di cancellare gli attributi di un
       contatto che qui non abbiamo valorizzato. */
    await brevoFetch('/contacts/import', {
      method: 'POST',
      body: JSON.stringify({
        listIds: [listId],
        updateExistingContacts: true,
        emptyContactsAttributes: false,
        jsonBody: contattabili.map(c => ({
          email: c.email,
          attributes: {
            NOME: c.nome || (c.nominativo || '').split(' ')[0] || '',
            COGNOME: c.cognome || '',
            NOMINATIVO: c.nominativo || ''
          }
        }))
      })
    });
  }

  if (daTogliere.length) {
    /* A blocchi di 100: Brevo rifiuta le richieste troppo grandi, e con 2.000
       indirizzi in un colpo l'errore arriverebbe a meta' lavoro. */
    for (let i = 0; i < daTogliere.length; i += 100) {
      try {
        await brevoFetch(`/contacts/lists/${listId}/contacts/remove`, {
          method: 'POST', body: JSON.stringify({ emails: daTogliere.slice(i, i + 100) })
        });
      } catch (e) { /* uno gia' tolto non deve fermare gli altri */ }
    }
  }

  /* L'import di Brevo e' asincrono: si aspetta che il conteggio della lista
     arrivi a quello atteso, ma senza restare appesi in eterno. Chi chiama
     ricontrolla comunque il numero vero prima dell'invio. */
  let iscritti = 0, allineata = false;
  for (let tentativo = 0; tentativo < 10; tentativo++) {
    const l = await brevoFetch('/contacts/lists/' + listId);
    iscritti = l.uniqueSubscribers || 0;
    if (iscritti === volute.length) { allineata = true; break; }
    await new Promise(r => setTimeout(r, 1500));
  }

  return { listId, iscritti, attesi: volute.length, allineata, rimossi: daTogliere.length };
}

export const _perTest = { smista, pulisci };
