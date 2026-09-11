-- ═══════════════════════════════════════════════════════════════════════════
--  IL REGISTRO DELLA FORMAZIONE — le regole che non si vedono dall'interfaccia
--
--  Si incolla nell'editor SQL di Supabase e si guarda l'ultima colonna: deve
--  essere OK su ogni riga. Gira dentro una transazione che si annulla da sola,
--  quindi non lascia niente in archivio: si puo' rilanciare quando si vuole,
--  anche in produzione.
--
--  PERCHE' STA QUI E NON FRA LE PROVE IN JAVASCRIPT. Quelle girano sul codice
--  della pagina, e la pagina non e' il posto dove queste regole vivono: se
--  fossero solo li', basterebbe una chiamata fatta con le stesse credenziali
--  ma fuori da IAM — dal browser, con due righe — per scavalcarle tutte.
--  Quello che si prova qui e' che reggano nel DATABASE, cioe' anche quando
--  l'interfaccia non c'e'.
--
--  Le cinque cose che devono restare vere:
--
--    1. Un collaboratore dichiara le proprie ore.
--    2. NON se le valida da solo. E' il punto di tutto: un registro dove
--       ognuno si timbra le ore e' un foglio di autodichiarazioni, e davanti
--       a un'ispezione non vale niente.
--    3. Non intesta ore a un altro.
--    4. Non ritocca le ore DOPO che sono state validate — cambiarle lasciando
--       il timbro trasformerebbe una verifica in una firma in bianco.
--    5. Il timbro «validata da» lo mette il database, non chi scrive: anche
--       passando di proposito l'id di un altro, resta scritto chi ha validato
--       davvero.
--
--  Le prime quattro le tiene un TRIGGER, non le policy. Una policy si allarga
--  per sbaglio aggiungendone un'altra accanto; il trigger no.
--
--  Prima di lanciarlo: metti qui sotto due id veri, un collaboratore e uno
--  staff (select id, email, ruolo from iam_utenti).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create temp table param(collab uuid, staff uuid, altro uuid);
insert into param values (
  'c77e069a-6469-4838-a728-c128cdba338c',   -- un collaboratore
  'a5ab0cd0-0f1a-4abf-b314-e9d2f8a93329',   -- uno staff (admin/operatore)
  '604735ed-7338-4d84-ab09-cafc0b5d5ce4'    -- un altro collaboratore qualsiasi
);
create temp table esiti(n int, prova text, esito text);
grant all on param, esiti to authenticated;

-- ── 1. dichiara ───────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"c77e069a-6469-4838-a728-c128cdba338c","role":"authenticated"}';

insert into public.iam_formazione (utente_id, anno, tipo, ore, titolo)
select collab, 2026, 'aggiornamento', 12, 'PROVA — corso dichiarato' from param;
insert into esiti values (1, 'dichiara le proprie ore', 'OK');

-- ── 2. non se le valida da solo ───────────────────────────────────────────
update public.iam_formazione set stato = 'validata' where titolo = 'PROVA — corso dichiarato';
insert into esiti
select 2, 'NON se le valida da solo',
       case when stato = 'validata' then 'FALLITA — si è validato le ore da solo'
            else 'OK — resta «' || stato || '»' end
from public.iam_formazione where titolo = 'PROVA — corso dichiarato';

-- ── 3. non intesta ore a un altro ─────────────────────────────────────────
insert into public.iam_formazione (utente_id, anno, tipo, ore, titolo)
select staff, 2026, 'aggiornamento', 30, 'PROVA — ore di un altro' from param;
insert into esiti
select 3, 'non intesta ore a un altro',
       case when f.utente_id = p.staff then 'FALLITA — le ore risultano di un altro'
            else 'OK — riportate a chi le ha scritte' end
from public.iam_formazione f, param p where f.titolo = 'PROVA — ore di un altro';

-- ── 5. il timbro lo mette il database ─────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a5ab0cd0-0f1a-4abf-b314-e9d2f8a93329","role":"authenticated"}';
update public.iam_formazione f
   set stato = 'validata', validata_da = (select collab from param)   -- timbro falsificato di proposito
 where f.titolo = 'PROVA — corso dichiarato';
insert into esiti
select 5, 'il timbro dice chi ha validato davvero',
       case when f.validata_da = p.staff and f.validata_il is not null
            then 'OK — ' || f.stato || ', timbrata dallo staff'
            else 'FALLITA — timbro ' || coalesce(f.validata_da::text, 'assente') end
from public.iam_formazione f, param p where f.titolo = 'PROVA — corso dichiarato';

-- ── 4. non ritocca quelle già validate ────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c77e069a-6469-4838-a728-c128cdba338c","role":"authenticated"}';
do $$
begin
  update public.iam_formazione set ore = 99 where titolo = 'PROVA — corso dichiarato';
  insert into esiti values (4, 'non ritocca le ore già validate', 'FALLITA — è passata');
exception when others then
  insert into esiti values (4, 'non ritocca le ore già validate', 'OK — respinta dal database');
end $$;

-- ── e il saldo separa le due cose ─────────────────────────────────────────
insert into esiti
select 6, 'il saldo tiene separate dichiarate e validate',
       case when ore_validate = 30 and ore_dichiarate = 12
            then 'OK — validate ' || ore_validate || ', dichiarate ' || ore_dichiarate || ', richieste ' || ore_richieste
            else 'FALLITA — validate ' || ore_validate || ', dichiarate ' || ore_dichiarate end
from public.iam_mia_formazione_saldo(2026);

-- ── e nessun altro le vede ────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"604735ed-7338-4d84-ab09-cafc0b5d5ce4","role":"authenticated"}';
insert into esiti
select 7, 'un altro collaboratore non vede niente',
       case when count(*) = 0 then 'OK' else 'FALLITA — vede ' || count(*) || ' righe' end
from public.iam_formazione;

reset role;
select n, prova, esito from esiti order by n;

-- Non lascia niente: si puo' rilanciare quando si vuole.
rollback;
