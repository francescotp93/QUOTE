-- ════════════════════════════════════════════════════════════════
--  QUOTO — Catalogo VEICOLI per CODICE (banca dati auto-aggiornante)
--  Esegui in: Supabase → SQL Editor → New query → Run
--
--  Idea: la chiave NON è la targa, è il CODICE veicolo (MotorNet/Infocar).
--  Quel codice identifica un mezzo preciso → marca, modello, allestimento,
--  cilindrata, cavalli, alimentazione, valore. Ogni recupero targa via
--  /moto/hub-veicolo riversa qui i codici visti (upsert su `codice`), così la
--  banca dati cresce e si aggiorna da sola, preventivo dopo preventivo.
-- ════════════════════════════════════════════════════════════════

create table if not exists quote_catalogo_veicoli (
  codice          text primary key,        -- codice MotorNet/Infocar (chiave)
  marca           text,
  modello         text,
  allestimento    text,                    -- descrizione versione
  cilindrata      numeric,
  kilowatt        numeric,
  cavalli         numeric,
  alimentazione   text,
  valore          numeric(12,2),           -- valore assicurato (quando noto)
  fonte           text not null default 'italiana',
  visto_count     integer not null default 1,
  creato_il       timestamptz not null default now(),
  aggiornato_il   timestamptz not null default now()
);
alter table quote_catalogo_veicoli enable row level security;
drop policy if exists "quote_cat_select" on quote_catalogo_veicoli;
drop policy if exists "quote_cat_insert" on quote_catalogo_veicoli;
drop policy if exists "quote_cat_update" on quote_catalogo_veicoli;
drop policy if exists "quote_cat_delete" on quote_catalogo_veicoli;
create policy "quote_cat_select" on quote_catalogo_veicoli for select to authenticated using (true);
create policy "quote_cat_insert" on quote_catalogo_veicoli for insert to authenticated with check (true);
create policy "quote_cat_update" on quote_catalogo_veicoli for update to authenticated using (true);
create policy "quote_cat_delete" on quote_catalogo_veicoli for delete to authenticated using (true);
create index if not exists idx_cat_marca_modello on quote_catalogo_veicoli (marca, modello);
create index if not exists idx_cat_aggiornato on quote_catalogo_veicoli (aggiornato_il);
