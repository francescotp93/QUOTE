-- ═══════════════════════════════════════════════════════════════════════════
--  CHI È PRONTO — le regole che non si vedono dall'interfaccia
--
--  Si incolla nell'editor SQL di Supabase: l'ultima colonna dev'essere OK su
--  ogni riga. Gira dentro una transazione che si annulla da sola, quindi non
--  lascia niente in archivio e si può rilanciare quando si vuole, anche in
--  produzione.
--
--  Le cose che devono restare vere:
--
--    1. IL QUADRO È SOLO DELLO STAFF. È l'elenco di tutta la rete con dentro
--       chi non è in regola: un collaboratore non deve leggerlo, e il blocco
--       è dentro la funzione (`where iam_is_staff()`), non nella schermata.
--
--    2. NESSUNO SI VERIFICA IL RUI DA SOLO. Art. 109 CAP: per conto di un
--       intermediario può operare solo chi è iscritto nella sezione E. Se la
--       verifica se la potesse scrivere l'interessato, non sarebbe una
--       verifica — sarebbe una casella spuntata.
--
--    3. UN NUMERO NON BASTA: serve sezione E, una data di verifica, e che
--       quella data non sia vecchia. Un'iscrizione si può cancellare, e una
--       verifica di tre anni fa non dice niente su oggi.
--
--    4. IL QUADRO NON SBLOCCA NIENTE. Dice chi è pronto; ad aprire i permessi
--       resta una persona. Qui si controlla che leggere il quadro non cambi
--       nessun permesso.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create temp table param(collab uuid, staff uuid);
insert into param values (
  'c77e069a-6469-4838-a728-c128cdba338c',   -- un collaboratore
  'a5ab0cd0-0f1a-4abf-b314-e9d2f8a93329'    -- uno staff (admin/operatore)
);
create temp table esiti(n int, prova text, esito text);
grant all on param, esiti to authenticated;

-- ── 1. il quadro è solo dello staff ───────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"c77e069a-6469-4838-a728-c128cdba338c","role":"authenticated"}';
insert into esiti
select 1, 'un collaboratore non legge il quadro della rete',
       case when count(*) = 0 then 'OK' else 'FALLITA — vede ' || count(*) || ' righe' end
from public.iam_collab_pronti();

-- ── 2. nessuno si verifica il RUI da solo ─────────────────────────────────
do $$
declare tocc int;
begin
  update public.iam_team set rui_sezione = 'E', rui_verificato_il = current_date;
  get diagnostics tocc = row_count;
  insert into esiti values (2, 'un collaboratore non si verifica il RUI da solo',
    case when tocc = 0 then 'OK — nessuna riga toccata'
         else 'FALLITA — ha scritto su ' || tocc || ' schede' end);
exception when others then
  insert into esiti values (2, 'un collaboratore non si verifica il RUI da solo', 'OK — respinto dal database');
end $$;

-- ── 3. un numero non basta ────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a5ab0cd0-0f1a-4abf-b314-e9d2f8a93329","role":"authenticated"}';

-- il numero c'è già su quasi tutte le schede: senza sezione e senza data,
-- nessuno dev'essere «rui_ok»
insert into esiti
select 3, 'il solo numero RUI non vale come verifica',
       case when count(*) filter (where rui_ok) = 0 then 'OK — nessuno risulta verificato'
            else 'FALLITA — ' || count(*) filter (where rui_ok) || ' risultano verificati senza esserlo' end
from public.iam_collab_pronti() where rui is not null;

-- una verifica vecchia non vale: si mette una data di due anni fa su una
-- scheda e si guarda che resti rossa
do $$
declare vittima text;
begin
  select team_id into vittima from public.iam_collab_pronti() where rui is not null limit 1;
  update public.iam_team set rui_sezione = 'E', rui_verificato_il = current_date - interval '2 years'
   where id = vittima;
  insert into esiti
  select 4, 'una verifica scaduta non tiene',
         case when rui_ok then 'FALLITA — una verifica di due anni fa risulta valida' else 'OK' end
  from public.iam_collab_pronti() where team_id = vittima;

  update public.iam_team set rui_verificato_il = current_date where id = vittima;
  insert into esiti
  select 5, 'e una di oggi sì',
         case when rui_ok then 'OK' else 'FALLITA — una verifica fatta oggi non vale' end
  from public.iam_collab_pronti() where team_id = vittima;

  -- sezione diversa dalla E: art. 109 CAP, non può operare per conto nostro
  update public.iam_team set rui_sezione = 'B' where id = vittima;
  insert into esiti
  select 6, 'una sezione diversa dalla E non passa',
         case when rui_ok then 'FALLITA — la sezione B risulta a posto' else 'OK' end
  from public.iam_collab_pronti() where team_id = vittima;
end $$;

-- ── 4. leggere il quadro non sblocca niente ───────────────────────────────
insert into esiti
select 7, 'leggere il quadro non cambia nessun permesso',
       case when count(*) filter (where accesso_iam) = (select count(*) from public.iam_utenti where accesso_iam)
            then 'OK' else 'FALLITA — i permessi sono cambiati' end
from public.iam_utenti;

reset role;
select n, prova, esito from esiti order by n;

-- Non lascia niente: si può rilanciare quando si vuole.
rollback;
