-- ═════════════════════════════════════════════════════════════
--  SSF ADAPTER — estensioni schema per l'import dei flussi SHARE/SSF V12
--  (AssiEasy / compagnie -> Quoto + IM). Idempotente.
--
--  ⚠️  ZONA ROSSA: NON APPLICARE senza OK di Francesco (migrazioni DB di produzione).
--      Da eseguire in: Supabase -> SQL Editor -> New query -> Run.
--
--  Dipendenze: quote_anagrafiche (quote_schema.sql), quote_polizze (quote_polizze.sql,
--  qui ricreata create-if-not-exists per autoconsistenza), quote_preventivi.
-- ═════════════════════════════════════════════════════════════

-- ── 1. quote_anagrafiche: chiave SSF + consensi GDPR dai flussi ──
alter table quote_anagrafiche add column if not exists ssf_id_anagrafica     text;
alter table quote_anagrafiche add column if not exists consenso_privacy       boolean;
alter table quote_anagrafiche add column if not exists consenso_commerciale   boolean;
alter table quote_anagrafiche add column if not exists consenso_comm_terzi    boolean;
alter table quote_anagrafiche add column if not exists consenso_profilazione  boolean;
create unique index if not exists uq_anag_ssf_id on quote_anagrafiche (ssf_id_anagrafica) where ssf_id_anagrafica is not null;

-- ── 2. quote_polizze: base (se non esiste) + colonne SSF (chiave, veicolo/RCA) ──
create table if not exists quote_polizze (
  id             uuid primary key default gen_random_uuid(),
  anagrafica_id  uuid references quote_anagrafiche(id) on delete set null,
  contraente     text,
  compagnia      text,
  ramo           text,
  prodotto       text,
  numero_polizza text,
  targa          text,
  decorrenza     date,
  scadenza       date,
  frazionamento  text,
  premio         numeric(10,2),
  provvigione    numeric(10,2),
  stato          text not null default 'attiva',
  intermediario  text,
  note           text,
  preventivo_id  uuid references quote_preventivi(id) on delete set null,
  creato_da      uuid,
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz
);
alter table quote_polizze enable row level security;
drop policy if exists "quote_pol_select" on quote_polizze;
drop policy if exists "quote_pol_insert" on quote_polizze;
drop policy if exists "quote_pol_update" on quote_polizze;
drop policy if exists "quote_pol_delete" on quote_polizze;
create policy "quote_pol_select" on quote_polizze for select to authenticated using (true);
create policy "quote_pol_insert" on quote_polizze for insert to authenticated with check (true);
create policy "quote_pol_update" on quote_polizze for update to authenticated using (true);
create policy "quote_pol_delete" on quote_polizze for delete to authenticated using (true);
create index if not exists idx_pol_scadenza   on quote_polizze (scadenza);
create index if not exists idx_pol_anagrafica on quote_polizze (anagrafica_id);
create index if not exists idx_pol_stato      on quote_polizze (stato);
create index if not exists idx_pol_numero     on quote_polizze (numero_polizza);
-- colonne SSF nuove
alter table quote_polizze add column if not exists ssf_id_polizza    text;
alter table quote_polizze add column if not exists ssf_id_anagrafica text;   -- link all'anagrafica lato compagnia
alter table quote_polizze add column if not exists compagnia_ania    text;
alter table quote_polizze add column if not exists agenzia           text;
alter table quote_polizze add column if not exists tacito_rinnovo    boolean;
alter table quote_polizze add column if not exists data_emissione    date;
alter table quote_polizze add column if not exists telaio            text;
alter table quote_polizze add column if not exists marca             text;
alter table quote_polizze add column if not exists modello           text;
alter table quote_polizze add column if not exists classe_merito     text;
alter table quote_polizze add column if not exists bonus_malus       text;
alter table quote_polizze add column if not exists uso               text;
create unique index if not exists uq_pol_ssf_id on quote_polizze (ssf_id_polizza) where ssf_id_polizza is not null;

-- ── 3. IM: titoli (contabilita) ──
create table if not exists iam_titoli (
  id                        uuid primary key default gen_random_uuid(),
  ssf_id_titolo             text,
  ssf_id_polizza            text,
  numero_polizza            text,
  ramo                      text,
  tipo_titolo               text,
  stato                     text,
  effetto                   date,
  data_pagamento_cliente    date,
  data_competenza_contabile date,
  lordo                     numeric(12,2),
  provvigioni               numeric(12,2),
  giorni_mora               integer,
  collaboratore             text,
  creato_il                 timestamptz not null default now()
);
alter table iam_titoli enable row level security;
drop policy if exists "iam_titoli_select" on iam_titoli;
create policy "iam_titoli_select" on iam_titoli for select to authenticated using (true);
create unique index if not exists uq_imtit_ssf_id on iam_titoli (ssf_id_titolo) where ssf_id_titolo is not null;
create index if not exists idx_imtit_polizza on iam_titoli (ssf_id_polizza);

-- ── 4. IM: incassi (dettaglio per garanzia) ──
create table if not exists iam_incassi (
  id             uuid primary key default gen_random_uuid(),
  ssf_id_incasso text,
  ssf_id_titolo  text,
  garanzia       text,
  lordo          numeric(12,2),
  provvigioni    numeric(12,2),
  creato_il      timestamptz not null default now()
);
alter table iam_incassi enable row level security;
drop policy if exists "iam_incassi_select" on iam_incassi;
create policy "iam_incassi_select" on iam_incassi for select to authenticated using (true);
create unique index if not exists uq_iminc_ssf_id on iam_incassi (ssf_id_incasso) where ssf_id_incasso is not null;
create index if not exists idx_iminc_titolo on iam_incassi (ssf_id_titolo);

-- NB: il backend accede con service_role (RLS bypassata). Le policy sopra sono la
--     baseline; la doppia vista staff/collaboratore va garantita nel codice (come in preventivi.js).
