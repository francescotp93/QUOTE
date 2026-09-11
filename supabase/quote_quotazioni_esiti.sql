-- ════════════════════════════════════════════════════════════════════════════
--  QUOTO · Registro degli esiti di quotazione — quote_quotazioni_esiti
--
--  Una riga per COMPAGNIA per ogni TENTATIVO di quotazione (scraper e
--  tariffe), riuscito o no. È il posto dove finisce quello che oggi arriva al
--  browser e sparisce: serve alla revisione serale degli scraper e al
--  collaudo delle correzioni con preventivi veri.
--
--  ZONA ROSSA: eseguire nel SQL editor di Supabase (o con la migrazione MCP)
--  SOLO dopo l'ok di Francesco. Idempotente e ADDITIVA: nessuna tabella
--  esistente viene toccata, nessun backfill. Ordine di rilascio: prima questa
--  tabella, poi il codice del backend (che senza tabella scrive nel giornale
--  «riga non scritta» e la quotazione va avanti lo stesso).
--
--  Dentro NON entrano dati del cliente: mai nome, cognome, codice fiscale,
--  data di nascita, indirizzo. La targa sì (dato dell'agenzia, serve a
--  riprodurre). Chi scrive (il backend, con la chiave di servizio) ripulisce
--  richiesta e diagnostica prima di inserire (server/esiti.js).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists quote_quotazioni_esiti (
  id             bigserial primary key,
  creato_il      timestamptz not null default now(),
  utente_id      uuid,                 -- chi ha chiesto il preventivo (dal token)
  utente_nome    text,
  modulo         text,                 -- rca | casa | vita | api_v1 ...
  prodotto       text,                 -- es. 'Guidamica Autovetture', 'RC Auto (In Prima Classe)'
  compagnia      text,                 -- es. 'HDI Assicurazioni', 'Groupama', 'Allianz'
  linea          text,                 -- auto | moto | autocarro | casa | vita ...
  targa          text,
  richiesta      jsonb,                -- parametri: guida, massimale, frazionamento, garanzie, bersani... MAI dati personali
  esito          text not null check (esito in ('ok', 'errore', 'timeout', 'non_quotabile')),
  premio         numeric,              -- premio annuo lordo letto dallo scraper/tariffa
  fonte          text,                 -- da dove è stato letto: diretta | browser | mii | summary | pagina | tariffa
  durata_ms      integer,
  errore         text,
  diagnostica    jsonb,                -- tutto il resto della risposta: segnalazioni, avvisi, bloccanti, garanzie, pacchetto...
  premio_portale numeric,              -- SEGNALAZIONE operatore: il premio letto a mano sul portale
  nota_operatore text,
  segnalato_il   timestamptz,
  segnalato_da   text,
  revisionato_il timestamptz,          -- REVISIONE serale
  revisione_note text
);

create index if not exists idx_esiti_creato_il on quote_quotazioni_esiti (creato_il desc);
create index if not exists idx_esiti_compagnia on quote_quotazioni_esiti (compagnia);
create index if not exists idx_esiti_esito     on quote_quotazioni_esiti (esito);

-- ── RLS: scrive SOLO il backend (service_role, che le policy non le vede).
--    Legge lo staff di IAM (admin, operatore), come per quote_log. Nessuna
--    policy di insert/update/delete per authenticated: l'aggiornamento di
--    premio_portale / nota_operatore passa dal backend (POST /esiti/:id/segnalazione).
alter table quote_quotazioni_esiti enable row level security;
drop policy if exists "esiti_select" on quote_quotazioni_esiti;
create policy "esiti_select" on quote_quotazioni_esiti for select to authenticated using (iam_is_staff());

-- ── La vista per la revisione serale: le ultime 24 ore, le più recenti in alto.
--    security_invoker: chi la legge passa dalle policy della tabella.
create or replace view quote_quotazioni_esiti_giorno
  with (security_invoker = true) as
  select id, creato_il, utente_nome, modulo, linea, compagnia, prodotto, targa,
         esito, premio, premio_portale,
         case when premio_portale is not null and premio is not null then round(premio - premio_portale, 2) end as scarto,
         fonte, durata_ms, errore, nota_operatore, segnalato_da, revisionato_il, revisione_note,
         richiesta, diagnostica
  from quote_quotazioni_esiti
  where creato_il > now() - interval '1 day'
  order by creato_il desc;

-- ── Query pronte per la revisione serale (da incollare nel SQL editor):
--
--  1) tutto il giorno, per compagnia:
--     select compagnia, esito, count(*) as n, round(avg(durata_ms)/1000) as sec_medi
--       from quote_quotazioni_esiti where creato_il > now() - interval '1 day'
--       group by compagnia, esito order by compagnia, esito;
--
--  2) gli errori e le segnalazioni degli operatori ancora da rivedere:
--     select * from quote_quotazioni_esiti_giorno
--       where (esito <> 'ok' or premio_portale is not null) and revisionato_il is null;
--
--  3) chiudere una riga dopo averla guardata (dal SQL editor, con il ruolo di servizio):
--     update quote_quotazioni_esiti set revisionato_il = now(), revisione_note = '...' where id = <id>;
