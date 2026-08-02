-- ════════════════════════════════════════════════════════════════════════════
--  QUOTO · Preventivatore M1 — estensione di quote_preventivi (data-driven)
--  ZONA ROSSA: eseguire nel SQL editor di Supabase SOLO dopo review. Idempotente.
--  Presuppone quote_prodotti_catalogo (quote_prodotti_catalogo.sql) e
--  quote_anagrafiche (quote_schema.sql).
-- ════════════════════════════════════════════════════════════════════════════

alter table quote_preventivi add column if not exists prodotto_id  uuid references quote_prodotti_catalogo(id);
-- cliente_id puo gia esistere (quote_preventivi_numerazione.sql): IF NOT EXISTS lo rende sicuro.
alter table quote_preventivi add column if not exists cliente_id   uuid references quote_anagrafiche(id);
alter table quote_preventivi add column if not exists stato        text not null default 'bozza';  -- bozza|quotato|richiesto|emesso
alter table quote_preventivi add column if not exists offerta      jsonb;      -- risposte step "Offerta"
alter table quote_preventivi add column if not exists compagnie_sel text[];    -- compagnie selezionate per il giro
alter table quote_preventivi add column if not exists coperture    jsonb;      -- garanzie/coperture scelte

create index if not exists idx_prev_prodotto on quote_preventivi(prodotto_id);
create index if not exists idx_prev_stato    on quote_preventivi(stato);
create index if not exists idx_prev_cliente_id on quote_preventivi(cliente_id);
