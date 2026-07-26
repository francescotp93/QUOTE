-- ═════════════════════════════════════════════════════════════
--  IAM — Sospesi (scadenzario crediti) — replica funzionale AssiEasy
--  Il sospeso = importo a foglio cassa non ancora incassato dal cliente/collab.
--  Scadenzario consultabile, incassabile (anche parziale), **NON cancellabile**.
--  ⚠️ ZONA ROSSA: NON APPLICARE senza OK di Francesco. Idempotente.
-- ═════════════════════════════════════════════════════════════

create table if not exists iam_sospesi (
  id                 uuid primary key default gen_random_uuid(),
  data_generazione   date not null,
  data_incasso       date,
  importo            numeric(12,2) not null,
  importo_incassato  numeric(12,2) not null default 0,
  tipo_sospeso       text not null default '04010001',   -- sottoconto (piano conti)
  cliente            text,
  anagrafica_id      uuid,                                -- link (loose) a quote_anagrafiche
  polizza            text,
  compagnia          text,
  produttore         text,
  stato              text not null default 'aperto',      -- aperto | parziale | chiuso
  movimento_id       uuid,                                -- prima nota che l'ha generato
  fido               numeric(12,2),
  note               text,
  creato_da          uuid,
  creato_il          timestamptz not null default now(),
  aggiornato_il      timestamptz
);
create index if not exists idx_sosp_stato on iam_sospesi (stato);
create index if not exists idx_sosp_data  on iam_sospesi (data_generazione);
create index if not exists idx_sosp_anag  on iam_sospesi (anagrafica_id);

-- RLS: select/insert/update per authenticated. NIENTE policy DELETE (non cancellabile).
alter table iam_sospesi enable row level security;
drop policy if exists "im_sosp_sel" on iam_sospesi;
drop policy if exists "im_sosp_ins" on iam_sospesi;
drop policy if exists "im_sosp_upd" on iam_sospesi;
create policy "im_sosp_sel" on iam_sospesi for select to authenticated using (true);
create policy "im_sosp_ins" on iam_sospesi for insert to authenticated with check (true);
create policy "im_sosp_upd" on iam_sospesi for update to authenticated using (true);
