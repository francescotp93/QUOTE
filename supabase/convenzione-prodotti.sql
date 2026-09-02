-- ═══════════════════════════════════════════════════════════════════════════
--  PRODOTTI IN CONVENZIONE  —  applicato il 2 settembre 2026
--
--  Il primo pezzo dell'area riservata ai convenzionati: che cosa vede
--  l'associato quando entra, e che cosa puo' farci.
--
--  DECISIONI PRESE CON FRANCESCO (2 settembre 2026)
--   · LA MODALITA' E' DEL PRODOTTO, NON DELLA CONVENZIONE. Alcuni prodotti
--     l'associato li quota da solo e ne stampa il PDF («quotazione»); per altri
--     puo' solo chiedere, e il premio glielo diamo noi («richiesta»). Metterlo
--     sulla convenzione avrebbe costretto a scegliere una volta sola per tutti.
--   · IL PAGAMENTO E' PER I RINNOVI, E NON SI ACCENDE DA SOLO. La polizza che
--     quest'anno costa 200 l'anno prossimo puo' costare 199 o 201: il link di
--     pagamento resta spento finche' non lo accendiamo noi. Qui si dichiara
--     solo se il prodotto AMMETTE quella strada (`rinnovo_pagabile`); l'ok vero
--     e' sulla singola polizza e arrivera' col pezzo dei rinnovi.
--   · LE NOTE INFORMATIVE SI CARICANO DAL PANNELLO, non si scrivono nel codice:
--     un prodotto nuovo non deve richiedere una modifica al programma.
--
--  ROLLBACK
--    drop table if exists quote_convenzione_prodotti;
--    delete from storage.buckets where id = 'note-informative';
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists quote_convenzione_prodotti (
  id             uuid primary key default gen_random_uuid(),
  convenzione_id uuid not null references quote_convenzioni(id) on delete cascade,
  nome           text not null,
  -- L'emoji che identifica il prodotto a colpo d'occhio: l'auto una macchina,
  -- la casa una casa. Su un elenco di dodici voci si trova prima l'immagine
  -- del titolo, e chi entra nell'area riservata non conosce i nostri nomi.
  icona          text,
  descrizione    text,
  -- 'quotazione' = l'associato vede il premio e stampa il PDF
  -- 'richiesta'  = compila e aspetta noi
  modalita       text not null default 'richiesta'
                 check (modalita in ('quotazione','richiesta')),
  -- La nota informativa: percorso nel deposito, piu' il nome del file come
  -- l'ha caricato Francesco (per mostrarlo e per farlo scaricare col suo nome).
  nota_percorso  text,
  nota_nome      text,
  -- Ammette il pagamento del rinnovo? Non lo accende: dice solo che quella
  -- strada, per questo prodotto, esiste.
  rinnovo_pagabile boolean not null default false,
  ordine         int not null default 0,
  attivo         boolean not null default true,
  creato_da      uuid,
  creato_il      timestamptz not null default now()
);
create index if not exists convprod_conv_idx
  on quote_convenzione_prodotti (convenzione_id, attivo, ordine);
-- Due volte lo stesso prodotto nella stessa convenzione non ha senso e
-- confonde chi lo legge: si scrive una volta e si modifica.
create unique index if not exists convprod_nome_unico
  on quote_convenzione_prodotti (convenzione_id, lower(nome));

alter table quote_convenzione_prodotti enable row level security;
-- Lo staff li legge (serve a chi risponde alle richieste); crearli e
-- modificarli e' degli amministratori, come per la convenzione che li contiene.
create policy convprod_select on quote_convenzione_prodotti for select using (iam_is_staff());
create policy convprod_insert on quote_convenzione_prodotti for insert with check (iam_is_admin());
create policy convprod_update on quote_convenzione_prodotti for update using (iam_is_admin());
create policy convprod_delete on quote_convenzione_prodotti for delete using (iam_is_admin());

-- ── Cosa vede l'area riservata ────────────────────────────────────────────
-- Stessa forma di convenzione_pubblica(): una funzione che PRETENDE il token,
-- non una vista che si puo' interrogare senza filtri. Restituisce solo cio'
-- che serve a disegnare l'elenco: niente `creato_da`, niente id interni oltre
-- al proprio, e SOLO i prodotti attivi di una convenzione attiva.
create or replace function convenzione_prodotti_pubblici(p_token text)
returns table (id uuid, nome text, icona text, descrizione text,
               modalita text, nota_percorso text, nota_nome text,
               rinnovo_pagabile boolean, ordine int)
language sql
security definer
set search_path = public
as $$
  select p.id, p.nome, p.icona, p.descrizione, p.modalita,
         p.nota_percorso, p.nota_nome, p.rinnovo_pagabile, p.ordine
  from quote_convenzione_prodotti p
  join quote_convenzioni c on c.id = p.convenzione_id
  where c.token = p_token
    and c.attiva and p.attivo
    and (c.valida_al is null or c.valida_al >= current_date)
    and (c.valida_dal is null or c.valida_dal <= current_date)
  order by p.ordine, p.nome
$$;
revoke all on function convenzione_prodotti_pubblici(text) from public;
grant execute on function convenzione_prodotti_pubblici(text) to anon, authenticated;

-- ── Il deposito delle note informative ────────────────────────────────────
-- PUBBLICO di proposito. Una nota informativa non e' un documento riservato:
-- e' il fascicolo che la compagnia pubblica sul proprio sito e che per legge
-- deve essere consegnato PRIMA della sottoscrizione. Tenerlo dietro un link
-- firmato che scade complicherebbe la vita a chi deve leggerlo — e con i link
-- che scadono un PDF mandato via email smette di aprirsi il giorno dopo.
-- Nel deposito ci vanno SOLO note informative: nessun dato di cliente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-informative', 'note-informative', true, 15728640, array['application/pdf'])
on conflict (id) do update
  set public = true, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];

-- Chiunque legge (e' pubblico); carica e cancella solo chi amministra.
drop policy if exists note_leggi on storage.objects;
create policy note_leggi on storage.objects for select
  using (bucket_id = 'note-informative');
drop policy if exists note_carica on storage.objects;
create policy note_carica on storage.objects for insert
  with check (bucket_id = 'note-informative' and iam_is_admin());
drop policy if exists note_aggiorna on storage.objects;
create policy note_aggiorna on storage.objects for update
  using (bucket_id = 'note-informative' and iam_is_admin());
drop policy if exists note_cancella on storage.objects;
create policy note_cancella on storage.objects for delete
  using (bucket_id = 'note-informative' and iam_is_admin());
