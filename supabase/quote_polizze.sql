-- ═══════════════════════════════════════════════════════════════════════════════
--  CRM WITH US ONE — Punto 1: la polizza diventa un'entità
--  (vedi CRM-WITH-US-ONE.md §6 Punto 1)
--
--  Oggi la polizza vive come due colonne su quote_preventivi (polizza_emessa,
--  polizza_il). Senza data di scadenza non esistono scadenzario, rinnovi né
--  contabilità di rata: è il vuoto da cui dipende tutto il resto del piano.
--
--  Tre tabelle nuove:
--    quote_polizze            il contratto, con i QUATTRO STATI indipendenti
--    quote_titoli             le rate: prima rata, rate, quietanze, appendici
--    quote_pratica_documenti  il documentale DI PRATICA, da cui la checklist
--
--  SOLO AGGIUNTE. Non tocca, non altera e non svuota nulla di esistente:
--  polizza_emessa e polizza_il restano al loro posto, quindi il codice attuale
--  continua a funzionare identico. Per tornare indietro basta il blocco in
--  fondo a questo file.
--
--  RLS: si riusano le funzioni già in uso nelle altre tabelle quote_* —
--  quote_vede(owner) per leggere/modificare, iam_is_staff() per inserire,
--  iam_is_admin() per cancellare. Nessuna politica nuova da inventare.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. POLIZZE ───────────────────────────────────────────────────────────────
create sequence if not exists quote_polizze_numero_seq;

create table if not exists public.quote_polizze (
  id               uuid primary key default gen_random_uuid(),
  -- numerazione: progressivo interno sempre presente, numero di compagnia
  -- quando lo comunica (all'inizio può mancare)
  numero           bigint not null default nextval('quote_polizze_numero_seq'),
  numero_polizza   text,

  -- collegamenti
  preventivo_id    uuid references public.quote_preventivi(id)        on delete set null,
  cliente_id       uuid references public.quote_anagrafiche(id)       on delete restrict,
  prodotto_id      uuid references public.quote_prodotti_catalogo(id) on delete set null,

  -- descrittivi, tenuti anche in chiaro come su quote_preventivi: il catalogo
  -- cambia nel tempo, la polizza deve restare leggibile com'era il giorno
  -- dell'emissione
  modulo           text,
  prodotto         text,
  compagnia        text,

  -- durata ed economia
  data_effetto     date not null,
  data_scadenza    date,           -- NULL = da confermare (non si inventa: §4 regola 2)
  frazionamento    text,           -- Annuale | Semestrale | Quadrimestrale | Trimestrale | Mensile
  tacito_rinnovo   boolean not null default false,
  premio_annuo     numeric(12,2),
  premio_rata      numeric(12,2),

  -- ── I QUATTRO STATI INDIPENDENTI (CRM-WITH-US-ONE.md §5.1) ────────────────
  -- Non un solo stato: quattro dimensioni che avanzano separatamente. In lista
  -- diventano quattro pallini per riga, ognuno con la sua spiegazione.
  stato_pagamento  text not null default 'non_pagato'
                   check (stato_pagamento in ('non_pagato','sospeso','pagato','annullata')),
  perfezionata     boolean not null default false,   -- calcolata dai documenti mancanti
  rendicontata     boolean not null default false,   -- legata all'estratto conto
  copertura_dal    date,
  copertura_al     date,

  -- sostituzione come RELAZIONE, non come modifica in place (§5.11):
  -- la storia non si sovrascrive mai
  sostituisce_id   uuid references public.quote_polizze(id) on delete set null,
  motivo_emissione text,

  note             text,
  dati             jsonb not null default '{}'::jsonb,

  creato_da        uuid not null default auth.uid(),
  creato_nome      text,
  creato_il        timestamptz not null default now(),
  aggiornato_il    timestamptz not null default now()
);

comment on table  public.quote_polizze is
  'Polizze emesse. Quattro stati indipendenti: pagamento, perfezionamento, rendicontazione, copertura.';
comment on column public.quote_polizze.data_scadenza is
  'NULL = da confermare. Da qui dipendono scadenzario e rinnovi: non va mai indovinata.';
comment on column public.quote_polizze.sostituisce_id is
  'Polizza sostituita da questa. Relazione, non modifica: la storia resta.';

create unique index if not exists quote_polizze_numero_uidx on public.quote_polizze(numero);
create unique index if not exists quote_polizze_numero_polizza_uidx
  on public.quote_polizze(numero_polizza) where numero_polizza is not null;
create index if not exists quote_polizze_cliente_idx    on public.quote_polizze(cliente_id);
create index if not exists quote_polizze_preventivo_idx on public.quote_polizze(preventivo_id);
create index if not exists quote_polizze_creato_da_idx  on public.quote_polizze(creato_da);
-- l'indice che regge lo scadenzario (Punto 4)
create index if not exists quote_polizze_scadenza_idx
  on public.quote_polizze(data_scadenza) where data_scadenza is not null;

-- ── 2. TITOLI (le rate) ──────────────────────────────────────────────────────
create table if not exists public.quote_titoli (
  id              uuid primary key default gen_random_uuid(),
  polizza_id      uuid not null references public.quote_polizze(id) on delete cascade,
  tipo            text not null default 'rata'
                  check (tipo in ('prima_rata','rata','quietanza','appendice')),
  data_decorrenza date not null,
  data_scadenza   date,
  importo_lordo   numeric(12,2) not null,
  provvigione     numeric(12,2),
  stato           text not null default 'aperto'
                  check (stato in ('aperto','incassato','insoluto','stornato')),
  mezzo_pagamento text check (mezzo_pagamento is null or mezzo_pagamento in
                  ('contante','assegno','bonifico','pos','carta_credito')),
  pagatore        text,
  incassato_il    date,
  note            text,
  creato_da       uuid not null default auth.uid(),
  creato_il       timestamptz not null default now()
);

comment on table public.quote_titoli is
  'Rate di una polizza. Base della contabilità di rata (Punto 7): incassi ed estratti conto.';

create index if not exists quote_titoli_polizza_idx  on public.quote_titoli(polizza_id);
create index if not exists quote_titoli_scadenza_idx on public.quote_titoli(data_scadenza);
create index if not exists quote_titoli_stato_idx    on public.quote_titoli(stato);

-- ── 3. DOCUMENTALE DI PRATICA ────────────────────────────────────────────────
-- Attenzione: quote_documenti (esistente) è il documentale di PRODOTTO.
-- Questa è un'altra cosa: i documenti di UNA pratica, ognuno con il suo stato.
-- Un documento qui non è un file: è un REQUISITO che può essere mancante.
create table if not exists public.quote_pratica_documenti (
  id           uuid primary key default gen_random_uuid(),
  entita       text not null check (entita in ('polizza','preventivo','cliente','sinistro')),
  entita_id    uuid not null,
  categoria    text not null,   -- identita | privacy | presa_visione | polizza_firmata | quietanza | altro
  nome         text,
  url          text,            -- NULL quando il documento è ancora da acquisire
  firmato      boolean not null default false,
  obbligatorio boolean not null default false,
  anno         int,             -- per raggruppare le quietanze
  creato_da    uuid not null default auth.uid(),
  creato_il    timestamptz not null default now()
);

comment on table public.quote_pratica_documenti is
  'Documentale di pratica: da qui si calcola la checklist "cosa manca" e il perfezionamento.';
comment on column public.quote_pratica_documenti.url is
  'NULL = requisito previsto ma non ancora acquisito (è ciò che rende possibile la checklist).';

create index if not exists quote_pratica_doc_entita_idx
  on public.quote_pratica_documenti(entita, entita_id);

-- ── 4. Aggiornamento automatico di aggiornato_il ─────────────────────────────
-- search_path fissato come nelle altre funzioni del progetto: un search_path
-- modificabile è una via per dirottare le chiamate (segnalato dal controllo
-- di sicurezza di Supabase alla prima stesura).
create or replace function public.quote_tocca_aggiornato_il()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.aggiornato_il = now();
  return new;
end $$;

drop trigger if exists quote_polizze_tocca on public.quote_polizze;
create trigger quote_polizze_tocca before update on public.quote_polizze
  for each row execute function public.quote_tocca_aggiornato_il();

-- ── 5. RLS — le stesse politiche delle altre tabelle quote_* ─────────────────
alter table public.quote_polizze            enable row level security;
alter table public.quote_titoli             enable row level security;
alter table public.quote_pratica_documenti  enable row level security;

drop policy if exists pol_select on public.quote_polizze;
drop policy if exists pol_insert on public.quote_polizze;
drop policy if exists pol_update on public.quote_polizze;
drop policy if exists pol_delete on public.quote_polizze;
create policy pol_select on public.quote_polizze for select using (quote_vede(creato_da));
create policy pol_insert on public.quote_polizze for insert with check ((creato_da = auth.uid()) or iam_is_staff());
create policy pol_update on public.quote_polizze for update using (quote_vede(creato_da)) with check (quote_vede(creato_da));
create policy pol_delete on public.quote_polizze for delete using (iam_is_admin());

-- Sui titoli e sui documenti di pratica si eredita la visibilità dalla polizza:
-- chi vede la polizza vede le sue rate e i suoi documenti, e nessun altro.
drop policy if exists tit_select on public.quote_titoli;
drop policy if exists tit_insert on public.quote_titoli;
drop policy if exists tit_update on public.quote_titoli;
drop policy if exists tit_delete on public.quote_titoli;
create policy tit_select on public.quote_titoli for select
  using (exists (select 1 from public.quote_polizze p where p.id = polizza_id and quote_vede(p.creato_da)));
create policy tit_insert on public.quote_titoli for insert
  with check (exists (select 1 from public.quote_polizze p where p.id = polizza_id and quote_vede(p.creato_da)));
create policy tit_update on public.quote_titoli for update
  using (exists (select 1 from public.quote_polizze p where p.id = polizza_id and quote_vede(p.creato_da)))
  with check (exists (select 1 from public.quote_polizze p where p.id = polizza_id and quote_vede(p.creato_da)));
create policy tit_delete on public.quote_titoli for delete using (iam_is_admin());

drop policy if exists pdoc_select on public.quote_pratica_documenti;
drop policy if exists pdoc_insert on public.quote_pratica_documenti;
drop policy if exists pdoc_update on public.quote_pratica_documenti;
drop policy if exists pdoc_delete on public.quote_pratica_documenti;
-- per i documenti di polizza si controlla la polizza; per le altre entità
-- si ricade sul proprietario del documento
create policy pdoc_select on public.quote_pratica_documenti for select using (
  case when entita = 'polizza'
       then exists (select 1 from public.quote_polizze p where p.id = entita_id and quote_vede(p.creato_da))
       else quote_vede(creato_da) end);
create policy pdoc_insert on public.quote_pratica_documenti for insert
  with check ((creato_da = auth.uid()) or iam_is_staff());
create policy pdoc_update on public.quote_pratica_documenti for update
  using (quote_vede(creato_da)) with check (quote_vede(creato_da));
create policy pdoc_delete on public.quote_pratica_documenti for delete using (iam_is_admin());

-- ── 6. Vista di comodo per lo scadenzario (Punto 4) ──────────────────────────
-- Non aggiunge dati: rende leggibile in una riga ciò che serve ai rinnovi,
-- incluso il preventivo che sta già sostituendo la polizza.
create or replace view public.quote_scadenzario as
select
  p.id, p.numero, p.numero_polizza, p.cliente_id, p.modulo, p.prodotto, p.compagnia,
  p.data_effetto, p.data_scadenza, p.frazionamento, p.tacito_rinnovo,
  p.premio_annuo, p.stato_pagamento, p.perfezionata, p.rendicontata, p.creato_da,
  (p.data_scadenza - current_date)                       as giorni_alla_scadenza,
  -- quante volte è già stata riquotata/sostituita: è l'avanzamento del rinnovo (§5.9)
  (select count(*) from public.quote_polizze s where s.sostituisce_id = p.id) as sostituzioni
  -- il conteggio dei ticket collegati arriva al Punto 6: oggi quote_ticket non
  -- ha un collegamento alla polizza, e non lo si aggiunge qui per non
  -- anticipare l'unificazione delle due code di ticket
from public.quote_polizze p
where p.stato_pagamento <> 'annullata';

-- ATTENZIONE, non togliere questa riga. Una vista è per difetto SECURITY
-- DEFINER: interrogherebbe con i permessi di chi l'ha creata invece di quelli
-- di chi legge, scavalcando tutta la RLS qui sopra — ogni utente collegato
-- vedrebbe le polizze di tutti. Con security_invoker la vista applica la RLS
-- del lettore. (Falla introdotta e corretta il 29/07/2026, trovata dal
-- controllo di sicurezza di Supabase: si esegue SEMPRE dopo una migrazione.)
alter view public.quote_scadenzario set (security_invoker = true);

-- ═══════════════════════════════════════════════════════════════════════════════
--  PER TORNARE INDIETRO (nulla di esistente è stato toccato, quindi basta questo)
--
--  drop view if exists public.quote_scadenzario;
--  drop table if exists public.quote_pratica_documenti;
--  drop table if exists public.quote_titoli;
--  drop table if exists public.quote_polizze;
--  drop sequence if exists quote_polizze_numero_seq;
--  drop function if exists public.quote_tocca_aggiornato_il();
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
--  SEGUITO — durata del contratto e completamento dello storico
--  (decisioni di Francesco del 29/07/2026)
-- ═══════════════════════════════════════════════════════════════════════════════

-- La scadenza si calcola dalla durata dichiarata sul prodotto: nessuno la
-- digita, nessuno la dimentica. NULL = durata non stabilita: la polizza nasce
-- senza scadenza e si mostra come "scadenza da confermare", che è sempre
-- meglio di una data sbagliata.
alter table public.quote_prodotti_catalogo
  add column if not exists durata_mesi int check (durata_mesi is null or durata_mesi > 0);

comment on column public.quote_prodotti_catalogo.durata_mesi is
  'Durata del contratto in mesi. NULL = da stabilire: la scadenza non viene calcolata.';

-- Annuali i rami danni (norma di mercato, confermata da Francesco).
update public.quote_prodotti_catalogo
set durata_mesi = 12
where codice in ('auto_rca','moto_rca','autocarro_rca','casa_multirischio',
                 'infortuni_individuale','attivita_multirischio')
  and durata_mesi is null;

-- I due prodotti vita (tcm_vita, vita_risparmio) restano volutamente senza
-- durata: sono contratti pluriennali e il numero di anni è un dato ufficiale
-- che nessuno ha ancora fornito. Non si indovina.

-- Le 5 polizze migrate dallo storico: annuali con tacito rinnovo (confermato).
update public.quote_polizze
set data_scadenza = (data_effetto + interval '1 year')::date,
    tacito_rinnovo = true,
    dati = (dati - 'scadenza_da_confermare')
           || jsonb_build_object('scadenza_confermata', 'annuale — confermato da Francesco il 2026-07-29')
where data_scadenza is null;
