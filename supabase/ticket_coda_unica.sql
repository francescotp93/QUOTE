-- ═══════════════════════════════════════════════════════════════════════════════
--  UNA SOLA CODA DI TICKET (Blocco E) — applicata il 30/07/2026
--
--  iam_ticket (33) e quote_ticket (5) contenevano la stessa cosa — segnalazioni
--  di assistenza sulla piattaforma (Generale, KPI, Team / Richiesta funzione,
--  RCA, Infortuni) — divise solo per accidente di storia: due code, due
--  interfacce, e nessuno che sapeva dove guardare.
--
--  iam_ticket è la coda unica. quote_ticket NON viene cancellata: resta al suo
--  posto, così tornare indietro è immediato.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.iam_ticket add column if not exists origine text not null default 'iam';
alter table public.iam_ticket add column if not exists data_schedulazione date;
alter table public.iam_ticket add column if not exists cliente_id uuid;
alter table public.iam_ticket add column if not exists polizza_id uuid;
alter table public.iam_ticket add column if not exists preventivo_id uuid;

comment on column public.iam_ticket.origine is
  'Da quale applicazione è stato aperto: iam | quoto. Serve a leggere la storia, non a dividere la coda.';
comment on column public.iam_ticket.data_schedulazione is
  'Quando va lavorato. Un ticket può essere pianificato nel futuro: è anche gestione delle attività.';

create index if not exists iam_ticket_stato_idx on public.iam_ticket(stato);
create index if not exists iam_ticket_sched_idx on public.iam_ticket(data_schedulazione) where data_schedulazione is not null;
create index if not exists iam_ticket_cliente_idx on public.iam_ticket(cliente_id) where cliente_id is not null;

-- I ticket di QUOTO entrano nella coda unica conservando autore, date e stato.
insert into public.iam_ticket
  (titolo, descrizione, sezione, priorita, stato, segnalato_da, segnalato_nome,
   risolto_da, risolto_nome, risolto_il, creato_il, aggiornato_il, origine)
select q.titolo, q.descrizione, q.sezione, q.priorita, q.stato, q.segnalato_da, q.segnalato_nome,
       q.risolto_da, q.risolto_nome, q.risolto_il, q.creato_il, q.aggiornato_il, 'quoto'
from public.quote_ticket q
where not exists (
  select 1 from public.iam_ticket t
  where t.origine = 'quoto' and t.creato_il = q.creato_il and t.titolo is not distinct from q.titolo
);

-- ── Riservatezza: si adotta la politica PIÙ STRETTA delle due ────────────────
-- iam_ticket aveva "auth.uid() is not null": chiunque collegato leggeva,
-- modificava e CANCELLAVA qualsiasi ticket. quote_ticket era protetta.
-- Unificando si prende la protezione, mai il contrario: nessuno vede più di
-- quanto vedeva prima. Lo staff (admin/top_master/operatore/master, tramite
-- iam_mio_ruolo) continua a vedere tutto, quindi l'assistenza non cambia.
drop policy if exists ticket_all on public.iam_ticket;
drop policy if exists tk_select on public.iam_ticket;
drop policy if exists tk_insert on public.iam_ticket;
drop policy if exists tk_update on public.iam_ticket;
drop policy if exists tk_delete on public.iam_ticket;

create policy tk_select on public.iam_ticket for select
  using (quote_vede(segnalato_da) or assegnato_a = auth.uid());
create policy tk_insert on public.iam_ticket for insert
  with check ((segnalato_da = auth.uid()) or iam_is_staff());
create policy tk_update on public.iam_ticket for update
  using (quote_vede(segnalato_da) or assegnato_a = auth.uid())
  with check (quote_vede(segnalato_da) or assegnato_a = auth.uid());
create policy tk_delete on public.iam_ticket for delete using (iam_is_admin());

-- ── PER TORNARE INDIETRO ─────────────────────────────────────────────────────
--   delete from public.iam_ticket where origine = 'quoto';
--   drop policy tk_select on public.iam_ticket; (e le altre tre)
--   create policy ticket_all on public.iam_ticket for all
--     using (auth.uid() is not null) with check (auth.uid() is not null);
--   e nel codice di QUOTO: from('iam_ticket') -> from('quote_ticket')
