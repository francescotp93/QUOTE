// ═══════════════════════════════════════════════════════════════════════════════
//  FIRME — le due decisioni che si possono provare da sole
//
//  QUI DENTRO NON C'E' EXPRESS, ed e' il motivo per cui questo file esiste.
//  firmaCollab.js lo importa, e nel repository express non e' fra le
//  dipendenze: una prova che importasse quel file non girerebbe, uscirebbe
//  verde senza provare niente. E' il tipo di prova peggiore — meglio nessuna.
//
//  Le due cose che finiscono qui sono quelle che sbagliate costano mesi dopo:
//  a chi appartiene una firma (senza, l'area riservata del collaboratore resta
//  vuota per sempre) e se un POG e' completo (senza prodotto e versione, fra
//  un anno non si sa piu' a cosa si riferisce).
// ═══════════════════════════════════════════════════════════════════════════════

/* ── A CHI APPARTIENE QUESTA FIRMA (M2, 10/09/2026) ────────────────────────
   iam_firme portava solo team_id ed email. Perche' il collaboratore possa
   leggere i SUOI documenti serve il suo utente IAM: iam_mie_firme() filtra su
   utente_id, e senza quella colonna riempita non tornerebbe mai niente.

   La catena e' iam_team.collab_id -> quote_collaboratori.id -> .iam_id, con
   l'email come ripiego per le schede create prima che il collegamento
   esistesse — lo stesso ripiego che usa gia' schedaAnagrafica() in IAM.

   Se non si risolve NON e' un errore: un candidato puo' non avere ancora un
   accesso, e il documento va spedito lo stesso. Le colonne restano vuote e la
   firma si vede dallo staff, come sempre.

   `sbGet` arriva da fuori: e' quello che rende questa funzione provabile
   senza tirare su niente. */
export async function chiFirma(c, sbGet) {
  const out = { collab_id: null, utente_id: null };
  if (!c) return out;
  const email = String(c.email || '').toLowerCase();
  try {
    let collab = null;
    if (c._candidato) {
      collab = c;                                    // e' gia' quote_collaboratori
    } else if (c.collab_id) {
      const r = await sbGet(`quote_collaboratori?id=eq.${encodeURIComponent(c.collab_id)}&select=id,iam_id`);
      collab = Array.isArray(r) ? r[0] : null;
    }
    if (!collab && email) {
      const r = await sbGet(`quote_collaboratori?email=eq.${encodeURIComponent(email)}&select=id,iam_id&limit=1`);
      collab = Array.isArray(r) ? r[0] : null;
    }
    if (collab) { out.collab_id = collab.id || null; out.utente_id = collab.iam_id || null; }
    /* Ultimo ripiego: l'utente IAM con la stessa email. Serve per gli attivi
       storici, che in iam_team non hanno collab_id. */
    if (!out.utente_id && email) {
      const u = await sbGet(`iam_utenti?email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
      if (Array.isArray(u) && u[0]) out.utente_id = u[0].id;
    }
  } catch (e) {
    /* Non sapere di chi e' non giustifica non spedire il documento. */
    console.warn('firme/chiFirma:', e.message || e);
  }
  return out;
}

/* ── IL POG NON E' UN DOCUMENTO DEL PLICO D'INGRESSO ───────────────────────
   Sotto IDD (Reg. Delegato UE 2017/2358) l'obbligo e' PER PRODOTTO e PER
   VERSIONE: quando la compagnia aggiorna il POG, il distributore deve
   riceverlo di nuovo. Una firma POG senza quelle due cose e' una firma che
   fra un anno non si sa piu' a cosa si riferisca — e il controllo vale solo
   per il POG: un mandato non ha un prodotto, e pretenderlo bloccherebbe il
   plico d'ingresso. */
export function controllaPog({ tipo, prodottoId, versione } = {}) {
  if (tipo !== 'pog') return null;
  if (!prodottoId || !versione) {
    return 'Per una firma POG servono il prodotto e la versione: l\'obbligo IDD è per prodotto e per versione, non una tantum all\'ingresso.';
  }
  return null;
}
