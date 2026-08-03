-- ═══════════════════════════════════════════════════════════════════════════════
--  I LEAD DIVENTANO UN CAMPO, NON UNA FRASE NELLE NOTE
--
--  Da eseguire una volta sola nell'editor SQL di Supabase. Si puo' rilanciare
--  senza danni.
--
--  Com'era. Un lead si riconosceva dalla parola «LEAD» scritta dentro il campo
--  note (28 righe su 35, il 03/08/2026). Il codice cercava gia' una colonna
--  `lead` e, non trovandola, ripiegava sulle note — quindi `awIsLead` conteneva
--  un controllo (`r.lead === true`) che non poteva mai essere vero.
--
--  Perche' e' un problema e non un dettaglio. Chi scrive una nota qualsiasi che
--  contiene quella parola trasforma un cliente in un lead senza saperlo; e chi
--  cancella la nota per fare pulizia trasforma un lead in un cliente. Una cosa
--  importante come «questo ha firmato la privacy oppure no» non puo' dipendere
--  da come e' scritta una frase libera.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Il campo ──────────────────────────────────────────────────────────────
alter table quote_anagrafiche add column if not exists lead boolean not null default false;

-- Da dove arriva il nominativo: rinnovo auto, inserito a mano, campagna…
-- Serve a sapere quali fonti portano lead che poi diventano clienti.
alter table quote_anagrafiche add column if not exists lead_origine text;

comment on column quote_anagrafiche.lead is 'true = nominativo senza privacy firmata. Prima si deduceva dalla parola LEAD nelle note.';
comment on column quote_anagrafiche.lead_origine is 'Da dove arriva: rinnovo auto, inserito a mano, campagna...';

-- ── 2. Si porta dietro quello che c'era ──────────────────────────────────────
--  Le 28 righe marcate nelle note diventano lead veri. Senza questo passaggio
--  la schermata Lead si svuoterebbe di colpo e sembrerebbero spariti.
update quote_anagrafiche
   set lead = true
 where lead = false
   and note is not null
   and note ~* '\mLEAD\M';

-- L'origine si ricava dalla nota, dove c'era («LEAD · rinnovo auto»).
update quote_anagrafiche
   set lead_origine = trim(substring(note from '·\s*(.*)$'))
 where lead = true
   and lead_origine is null
   and note ~ '·';

-- ── 3. Cercare i lead non deve leggere tutta la tabella ──────────────────────
create index if not exists idx_anag_lead on quote_anagrafiche (lead) where lead = true;

-- ── 4. Controllo ─────────────────────────────────────────────────────────────
--  Dopo l'esecuzione questi due numeri devono coincidere: se non coincidono,
--  qualche riga marcata nelle note non e' stata convertita e va guardata.
select
  count(*) filter (where lead)                                    as lead_veri,
  count(*) filter (where note ~* '\mLEAD\M')                      as marcati_nelle_note,
  count(*) filter (where note ~* '\mLEAD\M' and not lead)         as rimasti_indietro
from quote_anagrafiche;
