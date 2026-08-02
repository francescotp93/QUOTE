-- ═══════════════════════════════════════════════════════════════════════════════
--  SINISTRO STRUTTURATO (Blocco E) — applicato il 30/07/2026
--
--  Prima: `controparte` era un campo di testo e i danni due caselle
--  (danni_persone, danni_cose). Un tamponamento a catena con tre danneggiati,
--  ognuno con i suoi danni e i suoi importi, non ci entrava — e sono proprio i
--  sinistri che costano.
--
--  I campi vecchi RESTANO: il codice esistente continua a funzionare e la
--  scheda sintetica si legge come prima. La tabella era vuota: niente da migrare.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Controparti: chi altro c'è dentro ────────────────────────────────────────
create table if not exists public.quote_sinistro_controparti (
  id             uuid primary key default gen_random_uuid(),
  sinistro_id    uuid not null references public.quote_sinistri(id) on delete cascade,
  tipo           text not null default 'persona'
                 check (tipo in ('persona','veicolo','azienda','ente','altro')),
  nominativo     text,
  codice_fiscale text,
  targa          text,
  compagnia      text,
  numero_polizza text,
  -- chi ha ragione non lo decide il programma: si registra come sta la pratica
  responsabilita text check (responsabilita is null or responsabilita in ('nostra','controparte','concorsuale','da_definire')),
  contatti       text,
  note           text,
  creato_da      uuid not null default auth.uid(),
  creato_il      timestamptz not null default now()
);

comment on table public.quote_sinistro_controparti is
  'Le altre parti coinvolte nel sinistro. Multiple: un tamponamento a catena ne ha diverse.';

create index if not exists quote_sin_contro_idx on public.quote_sinistro_controparti(sinistro_id);

-- ── Partite di danno: che cosa si è rotto, e quanto ──────────────────────────
create table if not exists public.quote_sinistro_partite (
  id             uuid primary key default gen_random_uuid(),
  sinistro_id    uuid not null references public.quote_sinistri(id) on delete cascade,
  controparte_id uuid references public.quote_sinistro_controparti(id) on delete set null,
  tipo           text not null default 'cose'
                 check (tipo in ('cose','lesioni','veicolo','fabbricato','contenuto','altro')),
  descrizione    text,
  importo_richiesto numeric(12,2),
  importo_riservato numeric(12,2),   -- quanto la compagnia mette da parte
  importo_liquidato numeric(12,2),
  franchigia     numeric(12,2),
  stato          text not null default 'aperta'
                 check (stato in ('aperta','in_perizia','concordata','liquidata','respinta')),
  note           text,
  creato_da      uuid not null default auth.uid(),
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now()
);

comment on table public.quote_sinistro_partite is
  'Le voci di danno del sinistro, ognuna con i suoi importi e il suo stato. Un sinistro può liquidarne una e averne un''altra ancora in perizia.';

create index if not exists quote_sin_part_idx on public.quote_sinistro_partite(sinistro_id);
create index if not exists quote_sin_part_stato_idx on public.quote_sinistro_partite(stato);

drop trigger if exists quote_sin_part_tocca on public.quote_sinistro_partite;
create trigger quote_sin_part_tocca before update on public.quote_sinistro_partite
  for each row execute function public.quote_tocca_aggiornato_il();

-- ── Riservatezza: si eredita dal sinistro, come i titoli dalla polizza ──────
alter table public.quote_sinistro_controparti enable row level security;
alter table public.quote_sinistro_partite     enable row level security;

drop policy if exists sc_select on public.quote_sinistro_controparti;
drop policy if exists sc_insert on public.quote_sinistro_controparti;
drop policy if exists sc_update on public.quote_sinistro_controparti;
drop policy if exists sc_delete on public.quote_sinistro_controparti;
create policy sc_select on public.quote_sinistro_controparti for select
  using (exists (select 1 from public.quote_sinistri s where s.id = sinistro_id and quote_vede(s.creato_da)));
create policy sc_insert on public.quote_sinistro_controparti for insert
  with check (exists (select 1 from public.quote_sinistri s where s.id = sinistro_id and quote_vede(s.creato_da)));
create policy sc_update on public.quote_sinistro_controparti for update
  using (exists (select 1 from public.quote_sinistri s where s.id = sinistro_id and quote_vede(s.creato_da)))
  with check (exists (select 1 from public.quote_sinistri s where s.id = sinistro_id and quote_vede(s.creato_da)));
create policy sc_delete on public.quote_sinistro_controparti for delete using (iam_is_admin());

drop policy if exists sp_select on public.quote_sinistro_partite;
drop policy if exists sp_insert on public.quote_sinistro_partite;
drop policy if exists sp_update on public.quote_sinistro_partite;
drop policy if exists sp_delete on public.quote_sinistro_partite;
create policy sp_select on public.quote_sinistro_partite for select
  using (exists (select 1 from public.quote_sinistri s where s.id = sinistro_id and quote_vede(s.creato_da)));
create policy sp_insert on public.quote_sinistro_partite for insert
  with check (exists (select 1 from public.quote_sinistri s where s.id = sinistro_id and quote_vede(s.creato_da)));
create policy sp_update on public.quote_sinistro_partite for update
  using (exists (select 1 from public.quote_sinistri s where s.id = sinistro_id and quote_vede(s.creato_da)))
  with check (exists (select 1 from public.quote_sinistri s where s.id = sinistro_id and quote_vede(s.creato_da)));
create policy sp_delete on public.quote_sinistro_partite for delete using (iam_is_admin());

-- ── PER TORNARE INDIETRO ─────────────────────────────────────────────────────
--   drop table if exists public.quote_sinistro_partite;
--   drop table if exists public.quote_sinistro_controparti;
--   Nulla di esistente è stato toccato: quote_sinistri resta com'era.
