-- ═══════════════════════════════════════════════════════════════════════════
--  CONVENZIONI E ASSOCIATI  —  Blocco 3, applicato il 1 settembre 2026
--
--  Gestisce le convenzioni (la prima e' Asia Sicilia) e le iscrizioni che
--  arrivano dal link pubblico. Solo aggiunte: nessuna tabella esistente e'
--  stata toccata.
--
--  DECISIONI PRESE CON FRANCESCO
--   · gli associati li legge TUTTO LO STAFF (non solo gli admin)
--   · il modulo pubblico chiede il minimo: nome, cognome, email, telefono e
--     la richiesta. Niente codice fiscale, niente data di nascita: si
--     raccolgono dopo, se la trattativa va avanti
--   · le iscrizioni rifiutate o mai completate si conservano 12 MESI
--
--  ROLLBACK
--    drop function if exists convenzione_pubblica(text);
--    drop table if exists quote_convenzione_associati;
--    drop table if exists quote_convenzioni;
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists quote_convenzioni (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  ente          text,
  referente     text,
  referente_email    text,
  referente_telefono text,
  valida_dal    date,
  valida_al     date,
  prodotti      text[]  not null default '{}',
  condizioni    text,
  -- Il token e' il link pubblico: 48 caratteri casuali, non indovinabile.
  token         text not null unique default encode(gen_random_bytes(24), 'hex'),
  attiva        boolean not null default true,
  creato_da     uuid,
  creato_il     timestamptz not null default now()
);
create index if not exists conv_attiva_idx on quote_convenzioni (attiva, valida_al);

alter table quote_convenzioni enable row level security;
create policy conv_select on quote_convenzioni for select using (iam_is_staff());
create policy conv_insert on quote_convenzioni for insert with check (iam_is_admin());
create policy conv_update on quote_convenzioni for update using (iam_is_admin());
create policy conv_delete on quote_convenzioni for delete using (iam_is_admin());

-- L'associato e' un soggetto DISTINTO da collaboratore e da utente IAM:
-- tabella propria, permessi propri. Non entra in iam_utenti.
create table if not exists quote_convenzione_associati (
  id             uuid primary key default gen_random_uuid(),
  convenzione_id uuid not null references quote_convenzioni(id) on delete cascade,
  nome           text not null,
  cognome        text not null,
  email          text not null,
  telefono       text,
  richiesta      text,
  stato          text not null default 'in_attesa'
                 check (stato in ('in_attesa','approvato','rifiutato')),
  verificato_da  uuid,
  verificato_il  timestamptz,
  nota_verifica  text,
  -- Accesso via OTP, come le firme: si salva l'impronta, mai il codice.
  otp_hash       text,
  otp_scade_il   timestamptz,
  ultimo_accesso timestamptz,
  creato_il      timestamptz not null default now(),
  -- Conservazione: 12 mesi. Chi viene approvato diventa un rapporto in corso;
  -- gli altri si cancellano alla scadenza (vedi la query di pulizia in fondo).
  conserva_fino  date not null default (current_date + interval '12 months')
);
create index if not exists assoc_conv_idx on quote_convenzione_associati (convenzione_id, stato);
create index if not exists assoc_pulizia_idx on quote_convenzione_associati (conserva_fino)
  where stato <> 'approvato';
create unique index if not exists assoc_una_iscrizione on quote_convenzione_associati
  (convenzione_id, lower(email));

alter table quote_convenzione_associati enable row level security;
create policy assoc_select on quote_convenzione_associati for select using (iam_is_staff());
create policy assoc_update on quote_convenzione_associati for update using (iam_is_staff());
create policy assoc_delete on quote_convenzione_associati for delete using (iam_is_admin());

-- L'iscrizione arriva dal modulo pubblico, senza login. Si puo' scrivere SOLO
-- su una convenzione attiva e non scaduta: senza questo vincolo chiunque
-- potrebbe riempire la tabella scrivendo su convenzioni chiuse o inventate.
create policy assoc_insert on quote_convenzione_associati for insert
  with check (exists (
    select 1 from quote_convenzioni c
    where c.id = convenzione_id and c.attiva
      and (c.valida_al is null or c.valida_al >= current_date)));

-- ── Cosa vede la pagina pubblica ──────────────────────────────────────────
-- Prima qui c'era una VISTA. L'analisi di sicurezza di Supabase l'ha segnalata
-- come errore (aggirava le protezioni), e aveva ragione anche per un motivo
-- piu' concreto: permetteva di ELENCARE tutte le convenzioni attive: bastava
-- interrogarla senza filtri.
--
-- Una funzione che VUOLE il token risolve entrambe le cose: senza token non
-- risponde, e restituisce solo nome ed ente. Condizioni, sconti riservati,
-- referenti e associati restano dietro le protezioni. E' lo stesso schema
-- gia' usato in questo database da posta_avvisi(p_token).
create or replace function convenzione_pubblica(p_token text)
returns table (id uuid, nome text, ente text)
language sql
security definer
set search_path = public
as $$
  select c.id, c.nome, c.ente
  from quote_convenzioni c
  where c.token = p_token
    and c.attiva
    and (c.valida_al is null or c.valida_al >= current_date)
    and (c.valida_dal is null or c.valida_dal <= current_date)
$$;
revoke all on function convenzione_pubblica(text) from public;
grant execute on function convenzione_pubblica(text) to anon, authenticated;

-- ── La pulizia dei 12 mesi ────────────────────────────────────────────────
-- NON e' automatica: va lanciata. Cancella solo chi non e' stato approvato e
-- ha superato la conservazione. Prima di cancellare, conta:
--
--   select count(*) from quote_convenzione_associati
--    where stato <> 'approvato' and conserva_fino < current_date;
--
--   delete from quote_convenzione_associati
--    where stato <> 'approvato' and conserva_fino < current_date;
