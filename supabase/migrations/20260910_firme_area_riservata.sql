-- ═══════════════════════════════════════════════════════════════════════════
--  M2 — LE FIRME DIVENTANO LEGGIBILI DA CHI LE HA FIRMATE  (10/09/2026)
--
--  Questo file mette in chiaro quello che era stato applicato in produzione
--  senza lasciarne traccia nel repository. Non e' burocrazia: iam_mie_firme()
--  e' la funzione da cui il collaboratore legge i suoi documenti, e finche'
--  esiste solo dentro il database nessuno che legga il codice puo' sapere
--  perche' l'area riservata funzioni — ne' accorgersi se qualcuno la cambia.
--
--  Si puo' rieseguire: ogni pezzo e' idempotente.
--
--  ── Perche' le colonne nuove ───────────────────────────────────────────
--  iam_firme portava solo team_id ed email. Tre cose mancavano, e ognuna
--  serve mesi dopo la firma:
--
--    utente_id     a chi appartiene. Senza, iam_mie_firme() non torna mai
--                  niente e l'area riservata resta vuota per sempre.
--    versione      quale versione. Sostituire il file in doc_url quando
--                  cambiano le tabelle provvigionali, lasciando la stessa
--                  riga, rende impossibile dimostrare a quali condizioni una
--                  provvigione era maturata.
--    prodotto_id   per il POG: sotto IDD (Reg. Delegato UE 2017/2358)
--                  l'obbligo e' PER PRODOTTO e PER VERSIONE.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.iam_firme
  add column if not exists utente_id      uuid,   -- auth.users.id di chi firma
  add column if not exists collab_id      uuid,   -- quote_collaboratori.id
  add column if not exists versione       text,   -- versione del documento firmato
  add column if not exists prodotto_id    uuid,   -- solo POG: a quale prodotto
  add column if not exists valido_dal     date,   -- da quando vale
  add column if not exists sostituisce_id uuid;   -- la firma che rimpiazza

create index if not exists iam_firme_utente_idx on public.iam_firme (utente_id);
create index if not exists iam_firme_collab_idx on public.iam_firme (collab_id);

-- ── L'ELENCO CHE VEDE IL COLLABORATORE ────────────────────────────────────
--  Le policy di iam_firme aprono la tabella allo STAFF e a nessun altro, ed e'
--  giusto cosi': quella tabella porta anche il token con cui si apre un
--  documento e si firma. Il collaboratore non legge la tabella: chiama questa
--  funzione, che gira con auth.uid() e non puo' tornare le righe di un altro
--  nemmeno sbagliando una condizione.
--
--  Le colonne le sceglie chi scrive la funzione, e `token` NON c'e'. Non e'
--  una dimenticanza: aggiungerlo «per comodita'» porterebbe la chiave dei
--  documenti nel browser, negli appunti, in uno screenshot. Il documento si
--  apre dalla rotta /firma-collab/mio/doc, che autorizza per identita'.
create or replace function public.iam_mie_firme()
returns table (
  id uuid, tipo text, titolo text, versione text, doc_url text, stato text,
  valido_dal date, firmato_collab_il timestamptz, firmato_agente_il timestamptz,
  creato_il timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.tipo, f.titolo, f.versione, f.doc_url, f.stato, f.valido_dal,
         f.firmato_collab_il, f.firmato_agente_il, f.creato_il
  from public.iam_firme f
  where f.utente_id = auth.uid()
  order by f.creato_il desc
$$;

-- Chi ha un accesso, e nessun altro. `create or replace` rimette i permessi
-- di partenza (PUBLIC puo' eseguire), quindi la revoca va RIPETUTA ogni volta
-- che si tocca la funzione: senza queste tre righe la si riaprirebbe ad `anon`
-- ricaricando questo file, ed e' il modo piu' silenzioso di sbagliare.
revoke all on function public.iam_mie_firme() from public, anon;
grant execute on function public.iam_mie_firme() to authenticated;
grant execute on function public.iam_mie_firme() to service_role;
