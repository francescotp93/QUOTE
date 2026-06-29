-- ════════════════════════════════════════════════════════════════
--  QUOTO — Banca dati VEICOLI + ALLESTIMENTI (alimentata dallo scraper)
--  Esegui in: Supabase → SQL Editor → New query → Run
--
--  Ogni recupero targa (endpoint backend /moto/hub-veicolo) alimenta:
--   • quote_veicoli       → cache per targa (1 riga per targa)
--   • quote_allestimenti  → catalogo riutilizzabile marca|modello|allestimento
--  Così, preventivo dopo preventivo, costruiamo una banca dati nostra.
-- ════════════════════════════════════════════════════════════════

-- ── Cache veicolo per targa (upsert su `targa`) ──
create table if not exists quote_veicoli (
  targa            text primary key,
  marca            text,
  modello          text,
  allestimento     text,            -- versione attualmente selezionata/risolta
  alimentazione    text,
  cilindrata       numeric,
  kilowatt         numeric,
  immatricolazione text,
  valore           numeric(12,2),   -- valore assicurato
  codice_motornet  text,            -- codice Infocar/MotorNet
  allestimenti     jsonb,           -- elenco completo versioni [{descrizione,valore}]
  raw              jsonb,           -- dump grezzo dello scraper (debug/usi futuri)
  fonte            text not null default 'italiana',
  creato_il        timestamptz not null default now(),
  aggiornato_il    timestamptz not null default now()
);
alter table quote_veicoli enable row level security;
drop policy if exists "quote_veic_select" on quote_veicoli;
drop policy if exists "quote_veic_insert" on quote_veicoli;
drop policy if exists "quote_veic_update" on quote_veicoli;
drop policy if exists "quote_veic_delete" on quote_veicoli;
create policy "quote_veic_select" on quote_veicoli for select to authenticated using (true);
create policy "quote_veic_insert" on quote_veicoli for insert to authenticated with check (true);
create policy "quote_veic_update" on quote_veicoli for update to authenticated using (true);
create policy "quote_veic_delete" on quote_veicoli for delete to authenticated using (true);
create index if not exists idx_veic_marca_modello on quote_veicoli (marca, modello);
create index if not exists idx_veic_aggiornato on quote_veicoli (aggiornato_il);

-- ── Catalogo allestimenti (upsert su marca|modello|allestimento) ──
create table if not exists quote_allestimenti (
  id              uuid primary key default gen_random_uuid(),
  marca           text not null,
  modello         text not null,
  descrizione     text not null,   -- testo dell'allestimento/versione
  valore          numeric(12,2),   -- valore assicurato della versione
  codice_motornet text,
  fonte           text not null default 'italiana',
  creato_il       timestamptz not null default now(),
  aggiornato_il   timestamptz not null default now(),
  unique (marca, modello, descrizione)
);
alter table quote_allestimenti enable row level security;
drop policy if exists "quote_allest_select" on quote_allestimenti;
drop policy if exists "quote_allest_insert" on quote_allestimenti;
drop policy if exists "quote_allest_update" on quote_allestimenti;
drop policy if exists "quote_allest_delete" on quote_allestimenti;
create policy "quote_allest_select" on quote_allestimenti for select to authenticated using (true);
create policy "quote_allest_insert" on quote_allestimenti for insert to authenticated with check (true);
create policy "quote_allest_update" on quote_allestimenti for update to authenticated using (true);
create policy "quote_allest_delete" on quote_allestimenti for delete to authenticated using (true);
create index if not exists idx_allest_marca_modello on quote_allestimenti (marca, modello);
