-- ═══════════════════════════════════════════════════════════════════════════
--  M3 — IL REGISTRO DELLA FORMAZIONE  (11/09/2026)
--
--  Reg. IVASS 40/2018 chiede due cose diverse, e confonderle e' il primo modo
--  di sbagliare:
--
--    · art. 88 — FORMAZIONE INIZIALE: 60 ore prima dell'iscrizione al RUI.
--      Si fa una volta.
--    · art. 89 — AGGIORNAMENTO PROFESSIONALE: 30 ore OGNI ANNO, per gli
--      iscritti (sezioni A, B, E) e per chi opera per loro conto.
--
--  Qui si tengono tutte e due, distinte dal campo `tipo`, e solo
--  l'aggiornamento entra nel conto annuale.
--
--  ── COSA C'ERA PRIMA ──────────────────────────────────────────────────────
--  Un campo `anni` in iam_team: un elenco JSON di {anno, ore, files} che
--  scriveva lo staff dalla scheda del collaboratore. Su 12 schede era pieno
--  ZERO volte — mai usato da nessuno. Non c'e' niente da travasare, e per
--  questo il registro nuovo puo' essere l'unico invece di diventare il
--  secondo elenco con lo stesso nome.
--
--  Perche' non e' bastato: da li' il collaboratore non poteva caricare
--  niente (iam_team e' chiuso allo staff), non c'era l'attestato, non si
--  distingueva un'ora dichiarata da una verificata, e non si sapeva CHI
--  avesse verificato.
--
--  ── LA COSA CHE REGGE TUTTO ───────────────────────────────────────────────
--  Un registro dove ognuno si valida le proprie ore non vale niente davanti
--  a un'ispezione: e' un foglio di autodichiarazioni. Il collaboratore
--  DICHIARA e allega l'attestato; lo staff VALIDA. Che il collaboratore non
--  possa validarsi da solo e' il punto, e non e' affidato alla buona volonta'
--  dell'interfaccia: sta nelle policy E in un trigger, perche' una policy la
--  si puo' allargare per sbaglio aggiungendone un'altra, il trigger no.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.iam_formazione (
  id            uuid primary key default gen_random_uuid(),
  utente_id     uuid not null,          -- auth.users.id di chi ha fatto il corso
  collab_id     uuid,                   -- quote_collaboratori.id, quando c'e'
  anno          int  not null,          -- anno di competenza dell'aggiornamento
  tipo          text not null default 'aggiornamento',
  ore           numeric(5,1) not null,
  titolo        text not null,          -- il nome del corso
  ente          text,                   -- chi l'ha erogato
  modalita      text,                   -- aula / e-learning / webinar / altro
  svolto_dal    date,
  svolto_al     date,
  attestato_url text,                   -- nel deposito «formazione», che e' chiuso
  stato         text not null default 'dichiarata',
  validata_da   uuid,
  validata_il   timestamptz,
  nota          text,                   -- perche' e' stata respinta, di norma
  creato_il     timestamptz not null default now(),

  constraint iam_formazione_tipo_chk  check (tipo  in ('iniziale','aggiornamento')),
  constraint iam_formazione_stato_chk check (stato in ('dichiarata','validata','respinta')),
  -- Zero ore non e' un corso; 999 e' un errore di battitura, non un anno di
  -- studio. Il limite non e' normativo, e' un filtro contro le dita.
  constraint iam_formazione_ore_chk   check (ore > 0 and ore <= 999),
  constraint iam_formazione_anno_chk  check (anno between 2000 and 2100),
  constraint iam_formazione_date_chk  check (svolto_al is null or svolto_dal is null or svolto_al >= svolto_dal)
);

create index if not exists iam_formazione_utente_idx on public.iam_formazione (utente_id, anno);
create index if not exists iam_formazione_collab_idx on public.iam_formazione (collab_id);
create index if not exists iam_formazione_stato_idx  on public.iam_formazione (stato);

-- ── IL TRIGGER, che e' la vera guardia ────────────────────────────────────
--  Tre cose che non devono poter succedere, e nessuna e' impedita dalle sole
--  policy:
--    1. validarsi le proprie ore;
--    2. intestare le ore a un altro;
--    3. cambiare le ore DOPO che sono state validate, lasciando il timbro.
create or replace function public.iam_formazione_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff boolean := coalesce(public.iam_is_staff(), false);
begin
  if tg_op = 'INSERT' then
    -- Le ore si intestano a chi le ha fatte. Lo staff puo' registrarle per
    -- conto di un collaboratore (è il caso del corso organizzato in agenzia);
    -- chi non e' staff puo' registrare solo le proprie.
    if not staff then
      new.utente_id := auth.uid();
      new.stato := 'dichiarata';
      new.validata_da := null;
      new.validata_il := null;
    end if;

  elsif tg_op = 'UPDATE' then
    if not staff then
      -- Una riga gia' giudicata non si ritocca: cambiarle le ore lasciando il
      -- timbro «validata» trasformerebbe una verifica in una firma in bianco.
      if old.stato <> 'dichiarata' then
        raise exception 'Questa formazione è già stata verificata dall''agenzia: per correggerla, chiedi a loro.';
      end if;
      new.utente_id  := old.utente_id;
      new.stato      := 'dichiarata';
      new.validata_da := null;
      new.validata_il := null;
    end if;
    -- Il timbro lo mette il database, non chi scrive: cosi' «validata da» non
    -- puo' mai dire il nome di qualcun altro.
    if staff and new.stato is distinct from old.stato and new.stato in ('validata','respinta') then
      new.validata_da := auth.uid();
      new.validata_il := now();
    end if;
    if new.stato = 'dichiarata' then
      new.validata_da := null;
      new.validata_il := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists iam_formazione_guardia_trg on public.iam_formazione;
create trigger iam_formazione_guardia_trg
  before insert or update on public.iam_formazione
  for each row execute function public.iam_formazione_guardia();

-- ── LE POLICY ─────────────────────────────────────────────────────────────
alter table public.iam_formazione enable row level security;

drop policy if exists formaz_select on public.iam_formazione;
create policy formaz_select on public.iam_formazione for select
  using (utente_id = auth.uid() or public.iam_is_staff());

drop policy if exists formaz_insert on public.iam_formazione;
create policy formaz_insert on public.iam_formazione for insert
  with check (utente_id = auth.uid() or public.iam_is_staff());

drop policy if exists formaz_update on public.iam_formazione;
create policy formaz_update on public.iam_formazione for update
  using (utente_id = auth.uid() or public.iam_is_staff())
  with check (public.iam_is_staff() or stato = 'dichiarata');

-- Cancellare si puo' finche' nessuno l'ha guardata: dopo, e' una traccia.
drop policy if exists formaz_delete on public.iam_formazione;
create policy formaz_delete on public.iam_formazione for delete
  using (public.iam_is_staff() or (utente_id = auth.uid() and stato = 'dichiarata'));

-- ── QUANTE ORE SERVONO ────────────────────────────────────────────────────
--  Art. 89: 30 ore annue. Sta in una funzione e non sparso nel codice perche'
--  e' un numero di legge: se cambia — o se per qualcuno vale un regime
--  ridotto — si tocca QUI, una volta, invece di cercarlo in tre schermate.
--  Attenzione: i regimi ridotti e i vincoli di modalita' (aula, e-learning
--  con verifica) NON sono scritti qui. Vanno confermati con chi segue la
--  compliance prima di trasformarli in codice.
create or replace function public.iam_formazione_ore_richieste(p_anno int default null)
returns numeric
language sql
immutable
as $$ select 30::numeric $$;

-- ── IL SALDO, COM'E' OGGI ─────────────────────────────────────────────────
--  Le ore DICHIARATE e quelle VALIDATE si contano separate, e non e' un
--  dettaglio: davanti a un'ispezione valgono solo le seconde. Una schermata
--  che somma tutto mostrerebbe «30 su 30» a chi non ha ancora consegnato un
--  attestato, ed e' esattamente l'informazione che fa stare tranquilli
--  sbagliando.
create or replace function public.iam_mia_formazione_saldo(p_anno int default null)
returns table (anno int, ore_validate numeric, ore_dichiarate numeric, ore_richieste numeric)
language sql
stable
security definer
set search_path = public
as $$
  select f.anno,
         coalesce(sum(f.ore) filter (where f.stato = 'validata'), 0)   as ore_validate,
         coalesce(sum(f.ore) filter (where f.stato = 'dichiarata'), 0) as ore_dichiarate,
         public.iam_formazione_ore_richieste(f.anno)                   as ore_richieste
  from public.iam_formazione f
  where f.utente_id = auth.uid()
    and f.tipo = 'aggiornamento'          -- le 60 ore iniziali non sono annuali
    and (p_anno is null or f.anno = p_anno)
  group by f.anno
  order by f.anno desc
$$;

revoke all on function public.iam_mia_formazione_saldo(int) from public, anon;
grant execute on function public.iam_mia_formazione_saldo(int) to authenticated;
grant execute on function public.iam_mia_formazione_saldo(int) to service_role;

-- ── IL DEPOSITO DEGLI ATTESTATI ───────────────────────────────────────────
--  CHIUSO. Un attestato porta nome, cognome e data di nascita di una persona:
--  nel deposito pubblico sarebbe raggiungibile da chiunque indovini
--  l'indirizzo, senza nessun accesso. Ognuno scrive e legge dentro la propria
--  cartella, che si chiama come il suo id; lo staff legge tutto.
insert into storage.buckets (id, name, public, file_size_limit)
values ('formazione', 'formazione', false, 20971520)
on conflict (id) do update set public = false;

drop policy if exists formaz_file_read on storage.objects;
create policy formaz_file_read on storage.objects for select
  using (bucket_id = 'formazione'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.iam_is_staff()));

drop policy if exists formaz_file_write on storage.objects;
create policy formaz_file_write on storage.objects for insert
  with check (bucket_id = 'formazione'
              and ((storage.foldername(name))[1] = auth.uid()::text or public.iam_is_staff()));

drop policy if exists formaz_file_delete on storage.objects;
create policy formaz_file_delete on storage.objects for delete
  using (bucket_id = 'formazione'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.iam_is_staff()));
