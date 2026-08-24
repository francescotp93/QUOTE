-- Il ponte fra IAM e QUOTO ha bisogno di una chiave condivisa (X-Internal-Key).
-- IAM e' un sito statico su GitHub Pages: nel browser un segreto non e' un
-- segreto. Il pezzo di server dalla parte di IAM e' la Edge Function `quoto`,
-- che legge la chiave da qui con il service_role; il backend di QUOTO legge la
-- stessa riga (server/chiaveCondivisa.js).
--
-- Nessuna policy RLS, di proposito: senza policy anon e authenticated non
-- leggono niente, e il service_role passa comunque. La revoca esplicita e' una
-- seconda serratura sulla stessa porta.
--
-- Applicata il 20/08/2026. Qui per memoria: lo schema non e' sotto migrazioni
-- in questo repository, ma una tabella che regge l'autenticazione fra due
-- servizi non puo' esistere solo dentro un database.
create table if not exists public.ponte_segreti (
  nome          text primary key,
  valore        text not null,
  impronta      text,
  aggiornato_il timestamptz not null default now(),
  aggiornato_da text
);

comment on table public.ponte_segreti is
  'Segreti del ponte IAM<->QUOTO (chiave interna API v1). Solo service_role. Non deve mai arrivare al browser.';
comment on column public.ponte_segreti.impronta is
  'Prime 12 cifre dello sha256 del valore: serve a confrontare due copie senza stamparne nessuna.';

alter table public.ponte_segreti enable row level security;
revoke all on public.ponte_segreti from anon, authenticated;

-- La chiave NASCE qui dentro e non esce: nessuno la copia, nessuno la incolla,
-- non passa per una chat ne' per un ramo di git.
insert into public.ponte_segreti (nome, valore, impronta, aggiornato_da)
select 'internal_api_key', encode(gen_random_bytes(32), 'hex'), null, 'generata-in-db'
where not exists (select 1 from public.ponte_segreti where nome = 'internal_api_key');

update public.ponte_segreti
   set impronta = substr(encode(digest(valore, 'sha256'), 'hex'), 1, 12)
 where nome = 'internal_api_key' and impronta is null;
