-- =====================================================================
-- Prima Intermediari -> Supabase :: schema preventivi
-- Progetto: With Us / ecosistema Quoto
-- Idempotente: eseguibile piu' volte senza effetti collaterali.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tabella principale: un record per preventivo Prima
-- ---------------------------------------------------------------------
create table if not exists public.prima_preventivi (
  -- chiave naturale restituita dall'API Prima
  uuid                text primary key,
  quote_uuid          text,
  code                text not null,                 -- es. BL716506676
  reference           text,                          -- targa (Motor) / riferimento
  reference_hash      text,                          -- hash per lookup senza esporre la targa

  -- classificazione
  product_type        text not null,                 -- MOTOR | HOME
  vehicle_type        text,                          -- CAR | MOTORCYCLE | ...
  status              text not null,                 -- PURCHASABLE | PURCHASED | EXPIRED | DOCUMENTS_REQUIRED
  quote_type          text,                          -- NEW | RENEWAL_PROPOSAL | ...
  tariff              text,                          -- BLACK | ...
  guide_type          text,                          -- EXPERT | FREE | EXCLUSIVE
  color_case          text,                          -- GREEN | YELLOW | RED (semaforo rischio Prima)
  is_substitution     boolean default false,
  created_by_mass_quote boolean default false,
  has_flexibility_applied boolean default false,

  -- anagrafica minima (l'API di ricerca non espone email/telefono)
  contractor_name     text,
  mail_intermediario  text,                          -- collaboratore che ha calcolato

  -- date (timestamptz: l'API restituisce ISO con offset)
  created_at_source   timestamptz,                   -- quando e' stato calcolato
  effective_date      timestamptz,                   -- decorrenza
  expiration_date     timestamptz,                   -- scadenza validita' preventivo

  -- economics: somma di coverageAmounts.legal (= premio mostrato in UI)
  premium_legal       numeric(12,2),
  premium_presentation numeric(12,2),                -- prezzo "di presentazione"
  premium_full        numeric(12,2),                 -- prezzo pieno senza sconti
  early_discount      numeric(12,2),
  payment_frequency   text,                          -- annuale | semestrale ...
  issuing_company     text,

  -- dettaglio garanzie normalizzato + payload grezzo per audit/replay
  guarantees          jsonb not null default '[]'::jsonb,
  raw                 jsonb not null,

  -- housekeeping dello scraper
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  content_hash        text                            -- per saltare update inutili
);

comment on table public.prima_preventivi is
  'Preventivi estratti dal portale Prima Intermediari via API GraphQL interna (searchSavesNew).';
comment on column public.prima_preventivi.premium_legal is
  'Premio effettivo mostrato in UI: somma di installmentPrices[].coverageAmounts.legal';

create index if not exists prima_preventivi_status_idx        on public.prima_preventivi (status);
create index if not exists prima_preventivi_product_idx       on public.prima_preventivi (product_type);
create index if not exists prima_preventivi_created_idx       on public.prima_preventivi (created_at_source desc);
create index if not exists prima_preventivi_effective_idx     on public.prima_preventivi (effective_date);
create index if not exists prima_preventivi_reference_idx     on public.prima_preventivi (reference);
create index if not exists prima_preventivi_intermediario_idx on public.prima_preventivi (mail_intermediario);
create index if not exists prima_preventivi_type_idx          on public.prima_preventivi (quote_type);

-- ---------------------------------------------------------------------
-- Log delle esecuzioni: serve per accorgersi che lo scraper e' morto
-- ---------------------------------------------------------------------
create table if not exists public.prima_scrape_runs (
  id             uuid primary key default gen_random_uuid(),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running',  -- running | success | partial | failed | auth_required
  rows_fetched   integer default 0,
  rows_inserted  integer default 0,
  rows_updated   integer default 0,
  rows_unchanged integer default 0,
  segments       jsonb default '[]'::jsonb,        -- esito per ogni coppia (status, productType)
  error          text,
  duration_ms    integer
);

create index if not exists prima_scrape_runs_started_idx on public.prima_scrape_runs (started_at desc);

-- ---------------------------------------------------------------------
-- Row Level Security
--
-- Lo scraper scrive con la service_role key, che bypassa RLS. Qui si decide
-- chi LEGGE, e la regola non è «tutti quelli che sono entrati».
--
-- Questa tabella contiene il portafoglio preventivi dell'agenzia: nome del
-- contraente, premio e — per il ramo Motor — la TARGA, che è un dato
-- personale. «Ogni utente autenticato vede tutto» significa che l'ultimo
-- collaboratore aggiunto legge il portafoglio intero, comprese le trattative
-- degli altri. Nel resto del sistema non è così: si passa da iam_mio_ruolo()
-- e quote_vede(). Qui si fa lo stesso.
--
--   staff (admin, operatore)  → tutto
--   collaboratore             → soltanto i preventivi intestati a lui
--
-- Il log tecnico delle run non contiene dati di clienti, ma dice quando e
-- quanto giriamo sul portale di una compagnia: resta allo staff.
-- ---------------------------------------------------------------------
alter table public.prima_preventivi  enable row level security;
alter table public.prima_scrape_runs enable row level security;

-- L'email di chi sta chiedendo, presa dalla tabella e non dal token: un token
-- resta valido fino alla scadenza anche dopo che l'utenza è stata cambiata.
-- SECURITY DEFINER perché iam_utenti ha a sua volta la RLS: senza, la politica
-- che la interroga rientrerebbe in se stessa.
create or replace function public.iam_mia_email()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select lower(u.email) from public.iam_utenti u where u.id = auth.uid()
$$;

drop policy if exists prima_preventivi_read on public.prima_preventivi;
create policy prima_preventivi_read
  on public.prima_preventivi for select
  to authenticated
  using (
    public.iam_is_staff()
    or (
      public.iam_mia_email() is not null
      and mail_intermediario is not null
      and lower(mail_intermediario) = public.iam_mia_email()
    )
  );

drop policy if exists prima_scrape_runs_read on public.prima_scrape_runs;
create policy prima_scrape_runs_read
  on public.prima_scrape_runs for select
  to authenticated
  using (public.iam_is_staff());

-- ---------------------------------------------------------------------
-- Viste operative
-- ---------------------------------------------------------------------

-- Preventivi ancora acquistabili in scadenza: il target del recupero lead
create or replace view public.prima_preventivi_da_recuperare as
select
  uuid, code, reference, product_type, vehicle_type, contractor_name,
  mail_intermediario, quote_type, premium_legal,
  created_at_source, effective_date, expiration_date,
  (expiration_date::date - current_date) as giorni_alla_scadenza
from public.prima_preventivi
where status = 'PURCHASABLE'
  and expiration_date >= now()
order by expiration_date asc;

-- Conversion rate per collaboratore
create or replace view public.prima_conversion_per_intermediario as
select
  coalesce(mail_intermediario, 'n/d')                              as intermediario,
  product_type,
  count(*)                                                          as preventivi_totali,
  count(*) filter (where status = 'PURCHASED')                      as acquistati,
  round(
    100.0 * count(*) filter (where status = 'PURCHASED')
    / nullif(count(*), 0)
  , 2)                                                              as conversion_pct,
  round(avg(premium_legal) filter (where status = 'PURCHASED'), 2)  as premio_medio_acquistato,
  round(avg(premium_legal), 2)                                      as premio_medio_quotato
from public.prima_preventivi
group by 1, 2
order by preventivi_totali desc;

-- ATTENZIONE, non togliere queste due righe. Una vista è per difetto SECURITY
-- DEFINER: interrogherebbe con i permessi di chi l'ha creata invece di quelli
-- di chi legge, scavalcando tutta la RLS qui sopra — ogni utente collegato
-- vedrebbe il portafoglio di tutti, targhe comprese. Con security_invoker la
-- vista applica la RLS del lettore.
--
-- Non è un'ipotesi: la stessa falla è stata introdotta e corretta il
-- 29/07/2026 su quote_scadenzario (supabase/quote_polizze.sql), e l'ha trovata
-- il controllo di sicurezza di Supabase. Si esegue SEMPRE dopo una migrazione.
alter view public.prima_preventivi_da_recuperare     set (security_invoker = true);
alter view public.prima_conversion_per_intermediario set (security_invoker = true);

