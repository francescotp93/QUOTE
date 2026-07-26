-- ═════════════════════════════════════════════════════════════
--  IM — Contabilità dell'intermediario (nucleo partita doppia)
--  Replica delle FUNZIONI di AssiEasy: Piano dei conti + Causali +
--  Registrazione Movimenti (prima nota) + base Quadratura.
--  Codifiche e causali ricavate dal reverse-engineering di AssiEasy.
--
--  ⚠️  ZONA ROSSA: NON APPLICARE senza OK di Francesco (migrazioni DB di produzione).
--      Idempotente (create-if-not-exists + on conflict do nothing).
-- ═════════════════════════════════════════════════════════════

-- ── Piano dei conti (mastro/conto/sottoconto) + "natura" del conto (flag) ──
create table if not exists im_piano_conti (
  id                  uuid primary key default gen_random_uuid(),
  codice              text unique not null,      -- '06010001' (mastro+conto+sottoconto)
  mastro              text not null,             -- '06'
  conto               text not null,             -- '01'
  sottoconto          text not null,             -- '0001'
  descrizione         text not null,
  -- prerogative / natura (come AssiEasy)
  modalita_pagamento  boolean not null default false,
  e_pagamento_sospeso boolean not null default false,
  sospeso_agenzia     boolean not null default false,
  abbuono             boolean not null default false,
  storno_inc_diretto  boolean not null default false,
  e_finanziario       boolean not null default false,  -- liquidità immediata (quadratura)
  e_economico         boolean not null default false,  -- esposizione/sospesi (quadratura)
  saldo_direzione     boolean not null default false,  -- debito/credito compagnia (quadratura)
  presente_quadratura boolean not null default false,
  cod_esterno         text,                            -- passaggio commercialista
  tipo_conto          text,                            -- costo | ricavo | attivita | passivita
  attivo              boolean not null default true,
  creato_il           timestamptz not null default now()
);

-- ── Causali (template di partita doppia) ──
create table if not exists im_causali (
  id          uuid primary key default gen_random_uuid(),
  codice      text unique not null,        -- 'RSG'
  descrizione text not null,               -- 'REGISTRAZIONE SPESE GENERALI'
  tipo        text,                        -- 'PNOT' | 'incasso' | 'giroconto' | ...
  attivo      boolean not null default true
);
create table if not exists im_causali_righe (
  id          uuid primary key default gen_random_uuid(),
  causale_id  uuid not null references im_causali(id) on delete cascade,
  sottoconto  text not null,               -- codice piano conti (es. '57020001')
  dare_avere  text not null check (dare_avere in ('D','A')),
  ordine      int not null default 0,
  descrizione text,
  unique (causale_id, sottoconto, dare_avere)
);

-- ── Movimenti contabili (prima nota) — testa + righe (partita doppia) ──
create table if not exists im_movimenti (
  id             uuid primary key default gen_random_uuid(),
  data_movimento date not null,
  data_contabile date,
  causale_id     uuid references im_causali(id),
  causale_codice text,
  descrizione    text,
  documento      text,
  importo        numeric(12,2),
  societa        text default 'WITH US',
  creato_da      uuid,
  creato_il      timestamptz not null default now()
);
create table if not exists im_movimenti_righe (
  id           uuid primary key default gen_random_uuid(),
  movimento_id uuid not null references im_movimenti(id) on delete cascade,
  sottoconto   text not null,
  dare         numeric(12,2) not null default 0,
  avere        numeric(12,2) not null default 0,
  descrizione  text
);
create index if not exists idx_immov_data on im_movimenti (data_movimento);
create index if not exists idx_immovr_mov on im_movimenti_righe (movimento_id);
create index if not exists idx_immovr_sc  on im_movimenti_righe (sottoconto);

-- ── RLS baseline (authenticated) — la doppia vista si affina nel codice ──
do $$
declare t text;
begin
  foreach t in array array['im_piano_conti','im_causali','im_causali_righe','im_movimenti','im_movimenti_righe'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s_sel" on %I', t, t);
    execute format('create policy "%s_sel" on %I for select to authenticated using (true)', t, t);
  end loop;
end $$;

-- ═════════════ SEED — Piano dei conti (codifiche AssiEasy) ═════════════
insert into im_piano_conti (codice,mastro,conto,sottoconto,descrizione,modalita_pagamento,e_pagamento_sospeso,sospeso_agenzia,abbuono,e_finanziario,e_economico,saldo_direzione,presente_quadratura,tipo_conto) values
 ('06010001','06','01','0001','CASSA CONTANTI',        true,false,false,false,true,false,false,true,'attivita'),
 ('06010002','06','01','0002','CASSA ASSEGNI',         true,false,false,false,true,false,false,true,'attivita'),
 ('06020001','06','02','0001','BANCA C/C',             true,false,false,false,true,false,false,true,'attivita'),
 ('06020004','06','02','0004','POS',                   true,true, false,false,true,false,false,true,'attivita'),
 ('06030001','06','03','0001','C/C POSTALE',           true,false,false,false,true,false,false,true,'attivita'),
 ('04010001','04','01','0001','SOSPESO CLIENTI/AGENZIA',true,true,true, false,false,true,false,false,'attivita'),
 ('04039999','04','03','9999','PARTITE VARIE (PNT)',   false,false,false,false,false,false,false,false,null),
 ('41010000','41','01','0000','SALDO COMPAGNIA (generico)',false,false,false,false,false,false,true,true,'passivita'),
 ('41019999','41','01','9999','ACCANTONAMENTO RIMESSE',false,false,false,false,false,false,true,true,'passivita'),
 ('71010000','71','01','0000','PROVVIGIONI ATTIVE',    false,false,false,false,false,false,false,false,'ricavo'),
 ('51010000','51','01','0000','PROVVIGIONI PASSIVE',   false,false,false,false,false,false,false,false,'costo'),
 ('42010000','42','01','0000','CREDITO/DEBITO PRODUTTORE',false,false,false,false,false,false,false,false,'attivita'),
 ('56020001','56','02','0001','ABBUONI PASSIVI',       false,false,false,true, false,false,false,true,'costo'),
 ('56010000','56','01','0000','SPESE BANCARIE',        false,false,false,false,false,false,false,false,'costo'),
 ('57020001','57','02','0001','SPESE GENERALI',        false,false,false,false,false,false,false,false,'costo'),
 ('23010000','23','01','0000','RITENUTA D''ACCONTO',   false,false,false,false,false,false,false,false,'attivita'),
 ('08010001','08','01','0001','PATRIMONIO / TITOLARE', false,false,false,false,false,false,false,false,'passivita')
on conflict (codice) do nothing;

-- ═════════════ SEED — Causali (reali, WITH US) ═════════════
insert into im_causali (codice,descrizione,tipo) values
 ('RSG','REGISTRAZIONE SPESE GENERALI','PNOT'),
 ('SPB','SPESE BANCARIE','PNOT'),
 ('VAB','VERSAMENTO ASSEGNI IN BANCA','giroconto'),
 ('PRT','PRELIEVO TITOLARE','PNOT'),
 ('PRC','PROVVIGIONI DA COMPAGNIE','incasso'),
 ('PGR','PAGAMENTO RIMESSA','PNOT')
on conflict (codice) do nothing;

-- Righe template (Dare/Avere) per causale
insert into im_causali_righe (causale_id,sottoconto,dare_avere,ordine,descrizione)
select c.id, v.sc, v.da, v.ord, v.descr
from (values
  ('RSG','57020001','D',1,'Spese generali'),   ('RSG','06020001','A',2,'Banca'),
  ('SPB','56010000','D',1,'Spese bancarie'),   ('SPB','06020001','A',2,'Banca'),
  ('VAB','06020001','D',1,'Banca'),            ('VAB','06010002','A',2,'Cassa assegni'),
  ('PRT','08010001','D',1,'Titolare'),         ('PRT','06010001','A',2,'Cassa contanti'),
  ('PRC','41010000','D',1,'Saldo compagnia'),  ('PRC','71010000','A',2,'Provvigioni attive'),
  ('PGR','41010000','D',1,'Saldo compagnia'),  ('PGR','06020001','A',2,'Banca')
) as v(cod,sc,da,ord,descr)
join im_causali c on c.codice = v.cod
on conflict (causale_id,sottoconto,dare_avere) do nothing;
