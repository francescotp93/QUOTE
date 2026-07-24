-- ═════════════════════════════════════════════════════════════
--  QUOTO — Portafoglio polizze (quote_polizze)
--  Secondo pilastro del CRM "lato gestore" (modello Plurima: Portafoglio → Polizze emesse).
--  Collegata a quote_anagrafiche (il contraente). Convenzioni identiche a quote_schema.sql.
--
--  ⚠️  NON APPLICARE senza OK di Francesco (guardrail: migrazioni DB di produzione).
--  Da eseguire in: Supabase → SQL Editor → New query → Run.
-- ═════════════════════════════════════════════════════════════

create table if not exists quote_polizze (
  id             uuid primary key default gen_random_uuid(),
  -- Contraente: FK verso l'anagrafica + nominativo denormalizzato per liste veloci
  anagrafica_id  uuid references quote_anagrafiche(id) on delete set null,
  contraente     text,
  -- Dati polizza
  compagnia      text,
  ramo           text,                 -- RC Auto | Infortuni | Casa | RC Professionale ...
  prodotto       text,
  numero_polizza text,
  targa          text,                 -- valorizzata per i rami auto/moto
  -- Date e importi
  decorrenza     date,
  scadenza       date,
  frazionamento  text,                 -- annuale | semestrale | quadrimestrale | mensile | unica
  premio         numeric(10,2),
  provvigione    numeric(10,2),
  -- Gestione
  stato          text not null default 'attiva',   -- attiva | scaduta | disdetta | sospesa | sostituita
  intermediario  text,                 -- sotto-agente / rete (multi-intermediario, modello Plurima)
  note           text,
  -- Legame opzionale al preventivo di origine (quando la polizza nasce da un preventivo Quoto)
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

-- Indici: scadenza → gestione rinnovi; anagrafica → polizze del cliente; stato/numero → filtri e ricerca.
create index if not exists idx_pol_scadenza    on quote_polizze (scadenza);
create index if not exists idx_pol_anagrafica  on quote_polizze (anagrafica_id);
create index if not exists idx_pol_stato       on quote_polizze (stato);
create index if not exists idx_pol_numero      on quote_polizze (numero_polizza);
