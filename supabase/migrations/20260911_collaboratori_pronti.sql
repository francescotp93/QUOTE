-- ═══════════════════════════════════════════════════════════════════════════
--  M4 — CHI È PRONTO, E COSA GLI MANCA  (11/09/2026)
--
--  L'ultimo pezzo del percorso graduale: il collaboratore lascia i recapiti,
--  l'agenzia apre le credenziali, lui firma i documenti e registra le ore.
--  Qui si guarda il risultato e si dice, per ognuno, se è a posto.
--
--  ── NON SBLOCCA NIENTE DA SOLO, ED È VOLUTO ───────────────────────────────
--  Sarebbe comodo far scattare i permessi quando le tre condizioni diventano
--  verdi. Sarebbe anche il modo di dare accesso al preventivatore a qualcuno
--  perché una data è cambiata di notte, senza che nessuno lo abbia deciso.
--  Questa funzione dice CHI è pronto; ad aprire resta una persona.
--
--  ── LE TRE CONDIZIONI ─────────────────────────────────────────────────────
--    1. MANDATO firmato da entrambe le parti (iam_firme, stato 'completata').
--       Senza, non c'è un rapporto di collaborazione: c'è una conversazione.
--
--    2. RUI SEZIONE E, verificato da una persona. Art. 109 CAP: per conto di
--       un intermediario può operare solo chi è iscritto nella sezione E. Un
--       numero battuto in una casella NON è una verifica — chiunque può
--       scrivere dieci cifre. Serve che qualcuno l'abbia cercato sul registro
--       IVASS e abbia lasciato scritto quando. Per questo le colonne nuove
--       sono tre e non una: sezione, data, e CHI.
--
--       La verifica scade dopo 12 mesi. Non è un obbligo di legge, è che
--       un'iscrizione si può cancellare e una verifica di tre anni fa non
--       dice niente su oggi.
--
--    3. FORMAZIONE dell'anno in corso, ore VALIDATE (non dichiarate).
--
--  ── COSA HA TROVATO, GIRANDO SUI DATI VERI ────────────────────────────────
--  Prima ancora delle tre condizioni ci sono guai che le rendono impossibili,
--  e vanno detti per primi perché nessuna delle tre si risolve finché restano:
--
--    · un numero RUI intestato a DUE persone (E000749314). Un'iscrizione è
--      personale: una delle due righe è sbagliata, e finché non si sa quale
--      nessuna delle due è verificabile.
--    · due schede con la STESSA email. L'email è la chiave con cui i
--      documenti trovano il loro intestatario (collab_id è vuoto su tutte e
--      12 le schede): con due schede uguali, il mandato di uno finisce
--      nell'area riservata dell'altro.
--    · una scheda senza email: non può ricevere niente da firmare.
--    · una scheda senza numero RUI.
--
--  Non sono controlli teorici messi lì per completezza: al 11/09/2026 tutti e
--  quattro hanno un nome e un cognome in questo archivio.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La verifica del RUI si registra accanto al numero che verifica ────────
alter table public.iam_team
  add column if not exists rui_sezione      text,
  add column if not exists rui_verificato_il date,
  add column if not exists rui_verificato_da uuid,
  add column if not exists rui_nota          text;

-- ── Quanto dura una verifica ──────────────────────────────────────────────
--  In una funzione, come le ore: è una regola dell'agenzia, non di legge, e
--  cambiarla dev'essere un gesto solo.
create or replace function public.iam_rui_validita_mesi()
returns int language sql immutable as $$ select 12 $$;

-- ── IL QUADRO ─────────────────────────────────────────────────────────────
--  Solo per lo staff: è l'elenco di tutta la rete con dentro chi non è in
--  regola, e non è roba che si mostra a un collaboratore.
create or replace function public.iam_collab_pronti()
returns table (
  team_id           text,
  nome              text,
  cognome           text,
  email             text,
  utente_id         uuid,
  rui               text,
  rui_sezione       text,
  rui_verificato_il date,
  rui_ok            boolean,
  mandato_ok        boolean,
  mandato_il        timestamptz,
  ore_validate      numeric,
  ore_richieste     numeric,
  formazione_ok     boolean,
  pronto            boolean,
  guai              text[]
)
language sql
stable
security definer
set search_path = public
as $$
with
  -- Chi ha l'email in comune con qualcun altro: l'email è la chiave con cui i
  -- documenti trovano il loro intestatario, quindi un doppione qui non è un
  -- dettaglio anagrafico.
  email_doppie as (
    select lower(btrim(email)) as e from public.iam_team
    where email is not null and btrim(email) <> ''
    group by 1 having count(*) > 1
  ),
  rui_doppi as (
    select btrim(rui) as r from public.iam_team
    where rui is not null and btrim(rui) <> ''
    group by 1 having count(*) > 1
  ),
  -- L'utente IAM si trova per email, ma SOLO se l'email è di una sola persona:
  -- con un doppione si sceglierebbe a caso, ed è esattamente come un documento
  -- finisce nell'area riservata di un altro.
  utente as (
    select t.id as team_id, u.id as uid
    from public.iam_team t
    join public.iam_utenti u on lower(btrim(u.email)) = lower(btrim(t.email))
    where t.email is not null and btrim(t.email) <> ''
      and lower(btrim(t.email)) not in (select e from email_doppie)
  ),
  mandato as (
    select f.utente_id, max(f.firmato_agente_il) as il
    from public.iam_firme f
    where f.tipo = 'mandato' and f.stato = 'completata' and f.utente_id is not null
    group by f.utente_id
  ),
  ore as (
    select f.utente_id, sum(f.ore) as ore
    from public.iam_formazione f
    where f.stato = 'validata' and f.tipo = 'aggiornamento'
      and f.anno = extract(year from current_date)::int
    group by f.utente_id
  )
select
  t.id, t.nome, t.cogn, t.email, u.uid, t.rui, t.rui_sezione, t.rui_verificato_il,
  -- RUI: sezione E, verificato, e verificato di recente. Le tre cose insieme.
  ( upper(coalesce(t.rui_sezione, '')) = 'E'
    and t.rui_verificato_il is not null
    and t.rui_verificato_il > (current_date - (public.iam_rui_validita_mesi() || ' months')::interval)
  ) as rui_ok,
  (m.il is not null) as mandato_ok,
  m.il,
  coalesce(o.ore, 0) as ore_validate,
  public.iam_formazione_ore_richieste(null) as ore_richieste,
  (coalesce(o.ore, 0) >= public.iam_formazione_ore_richieste(null)) as formazione_ok,
  ( upper(coalesce(t.rui_sezione, '')) = 'E'
    and t.rui_verificato_il is not null
    and t.rui_verificato_il > (current_date - (public.iam_rui_validita_mesi() || ' months')::interval)
    and m.il is not null
    and coalesce(o.ore, 0) >= public.iam_formazione_ore_richieste(null)
  ) as pronto,
  -- I guai vengono prima delle tre condizioni: finché restano, nessuna delle
  -- tre si può risolvere.
  array_remove(array[
    case when t.email is null or btrim(t.email) = ''
         then 'Senza email: non può ricevere niente da firmare.' end,
    case when lower(btrim(coalesce(t.email,''))) in (select e from email_doppie)
         then 'Questa email è su più schede: i documenti firmati finirebbero alla persona sbagliata.' end,
    case when t.rui is null or btrim(t.rui) = ''
         then 'Senza numero RUI.' end,
    case when btrim(coalesce(t.rui,'')) in (select r from rui_doppi)
         then 'Questo numero RUI risulta su più schede: un''iscrizione è personale, una delle due è sbagliata.' end,
    case when u.uid is null and t.email is not null and btrim(t.email) <> ''
         then 'Nessun accesso IAM con questa email: non vede la sua area riservata.' end
  ], null) as guai
from public.iam_team t
left join utente  u on u.team_id = t.id
left join mandato m on m.utente_id = u.uid
left join ore     o on o.utente_id = u.uid
where public.iam_is_staff()     -- fail-closed: a chi non è staff non torna niente
order by t.cogn, t.nome
$$;

revoke all on function public.iam_collab_pronti() from public, anon;
grant execute on function public.iam_collab_pronti() to authenticated;
grant execute on function public.iam_collab_pronti() to service_role;
