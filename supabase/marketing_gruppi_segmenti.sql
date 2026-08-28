-- ═══════════════════════════════════════════════════════════════════════════════
--  CAMPAGNE PER GRUPPO E PER SEGMENTO
--
--  Da eseguire una volta sola nell'editor SQL di Supabase. Si puo' rilanciare
--  senza danni.
--
--  Com'era. Le campagne partivano solo sulle liste gia' esistenti su Brevo:
--  elenchi congelati, costruiti fuori dal gestionale, che invecchiano da soli.
--  I gruppi (Famiglia Rossi, Studio X) vivevano in anagrafica e il marketing non
--  li vedeva; i filtri del portafoglio si rifacevano a mano ogni volta.
--
--  Cosa cambia. Il destinatario di una campagna puo' essere un GRUPPO di
--  anagrafiche o un SEGMENTO (dei filtri salvati). Al momento dell'invio il
--  server risolve chi c'e' dentro adesso e lo riversa in una lista Brevo
--  dedicata: la lista resta il binario di Brevo (statistiche, click,
--  disiscrizioni), ma la verita' su chi ne fa parte sta qui.
--
--  Il consenso. Un invio commerciale senza consenso tracciato e' un rischio che
--  ricade sull'agenzia, non su Brevo. Da qui in avanti il consenso e' un campo:
--  chi non ce l'ha non entra in nessuna lista, per nessun gruppo e nessun
--  segmento. Il valore di partenza e' `false` per tutti — di proposito: un
--  consenso che non e' mai stato chiesto non si puo' dare per acquisito.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Il consenso marketing ─────────────────────────────────────────────────
--  Tre colonne e non una: il "si" da solo non basta a dimostrare niente. Serve
--  sapere QUANDO e DA DOVE arriva (modulo privacy firmato, raccolto allo
--  sportello, form del sito), perche' e' quello che si mostra se qualcuno
--  chiede conto di un invio.
alter table quote_anagrafiche add column if not exists consenso_marketing boolean not null default false;
alter table quote_anagrafiche add column if not exists consenso_marketing_il timestamptz;
alter table quote_anagrafiche add column if not exists consenso_marketing_origine text;

comment on column quote_anagrafiche.consenso_marketing is 'true = puo'' ricevere comunicazioni commerciali. Default false: il consenso mai chiesto non e'' un consenso.';
comment on column quote_anagrafiche.consenso_marketing_il is 'Quando e'' stato raccolto il consenso.';
comment on column quote_anagrafiche.consenso_marketing_origine is 'Da dove arriva: modulo privacy, sportello, sito, telefonata...';

-- Contare i contattabili e' l'operazione piu' frequente della pagina Campagne:
-- l'indice parziale tiene la conta su poche righe invece che su tutta la tabella.
create index if not exists idx_anag_consenso_marketing
  on quote_anagrafiche (consenso_marketing) where consenso_marketing;

-- ── 2. Il ponte fra un gruppo e la sua lista su Brevo ────────────────────────
--  Un gruppo = una lista Brevo, sempre la stessa. Senza questa memoria ogni
--  invio creerebbe una lista nuova e su Brevo si accumulerebbero decine di
--  "Famiglia Rossi (2)", con le statistiche spezzate fra l'una e l'altra.
alter table quote_gruppi add column if not exists brevo_list_id integer;
alter table quote_gruppi add column if not exists brevo_sync_il timestamptz;

comment on column quote_gruppi.brevo_list_id is 'Lista Brevo dedicata a questo gruppo, riusata a ogni sincronizzazione.';
comment on column quote_gruppi.brevo_sync_il is 'Ultimo allineamento dei membri verso Brevo.';

-- ── 3. I segmenti: filtri salvati, non elenchi congelati ─────────────────────
--  Un segmento NON contiene persone: contiene i criteri (eta', prodotto,
--  intermediario, scadenza...). Chi risponde a quei criteri si ricalcola a ogni
--  invio. E' la differenza fra "i clienti auto in scadenza a settembre" e "quei
--  212 nomi che avevo esportato a maggio".
create table if not exists quote_segmenti (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  descrizione   text,
  filtri        jsonb not null default '{}'::jsonb,
  brevo_list_id integer,
  brevo_sync_il timestamptz,
  creato_da     uuid,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

comment on table quote_segmenti is 'Filtri di portafoglio salvati e riusabili come destinatari di una campagna. I membri si ricalcolano a ogni invio.';
comment on column quote_segmenti.filtri is 'Criteri in JSON: eta_min, eta_max, prodotto, intermediario_id, scadenza_da, scadenza_a, tipo, con_figli_minori, gruppo_tipo...';

create index if not exists idx_segmenti_creato_da on quote_segmenti (creato_da);

-- ── 4. Chi vede cosa ─────────────────────────────────────────────────────────
--  Stesse regole dei gruppi: `quote_vede` per la lettura, staff o proprietario
--  per la scrittura. Le regole stanno nel database e non nell'interfaccia,
--  altrimenti basta una chiamata fatta a mano per aggirarle.
alter table quote_segmenti enable row level security;

drop policy if exists segmenti_select on quote_segmenti;
create policy segmenti_select on quote_segmenti for select using (quote_vede(creato_da));

drop policy if exists segmenti_insert on quote_segmenti;
create policy segmenti_insert on quote_segmenti for insert with check (creato_da = auth.uid() or iam_is_staff());

drop policy if exists segmenti_update on quote_segmenti;
create policy segmenti_update on quote_segmenti for update using (quote_vede(creato_da)) with check (quote_vede(creato_da));

drop policy if exists segmenti_delete on quote_segmenti;
create policy segmenti_delete on quote_segmenti for delete using (quote_vede(creato_da));

-- ── 5. Controllo ─────────────────────────────────────────────────────────────
--  Dopo l'esecuzione: `contattabili` sara' 0, ed e' giusto cosi'. Diventa
--  diverso da zero solo quando il consenso viene raccolto davvero, cliente per
--  cliente, dalla scheda anagrafica.
select
  count(*)                                                          as anagrafiche,
  count(*) filter (where email is not null and email <> '')         as con_email,
  count(*) filter (where consenso_marketing)                        as contattabili
from quote_anagrafiche;
