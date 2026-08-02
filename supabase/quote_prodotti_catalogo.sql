-- ════════════════════════════════════════════════════════════════════════════
--  QUOTO · Catalogo prodotti (data-driven) — M1
--  8 rami, tipo_quotazione = 'calcola' (premio a sistema) | 'richiedi' (a mano),
--  campi_offerta jsonb = schema dei campi dello step "Offerta" del preventivatore.
--  ZONA ROSSA: eseguire nel SQL editor di Supabase SOLO dopo review. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists quote_prodotti_catalogo (
  id              uuid primary key default gen_random_uuid(),
  ramo            text not null,                         -- auto|moto|autocarro|tcm|casa|infortuni|attivita|vita
  codice          text not null unique,                  -- slug stabile: 'auto_rca', 'moto_rca', ...
  nome            text not null,
  descrizione     text,
  tipo_quotazione text not null default 'richiedi'
                  check (tipo_quotazione in ('calcola','richiedi')),
  compagnie       text[] not null default '{}',          -- compagnie che offrono il prodotto
  campi_offerta   jsonb  not null default '[]'::jsonb,    -- schema campi step Offerta (data-driven)
  attivo          boolean not null default true,
  ordine          int not null default 100,
  creato_il       timestamptz not null default now()
);
create index if not exists idx_prodcat_ramo   on quote_prodotti_catalogo(ramo);
create index if not exists idx_prodcat_attivo on quote_prodotti_catalogo(attivo);

-- RLS: lettura a tutti gli autenticati; scrittura SOLO service_role (backend) →
-- nessuna policy di write per 'authenticated' (il service_role bypassa comunque le RLS).
alter table quote_prodotti_catalogo enable row level security;
drop policy if exists "prodcat_select" on quote_prodotti_catalogo;
create policy "prodcat_select" on quote_prodotti_catalogo for select to authenticated using (true);

-- ── SEED 8 rami ─────────────────────────────────────────────────────────────
insert into quote_prodotti_catalogo (ramo, codice, nome, descrizione, tipo_quotazione, compagnie, campi_offerta, ordine) values
 ('auto','auto_rca','Auto — RC Auto','Tutte le casistiche: voltura, provenienza altra compagnia, voltura proprietario diverso, recupero classe di merito.','calcola',
   ARRAY['HD','Allianz','Prima','Sara','AXA','Groupama','Italiana','Nobis'],
   '[{"key":"coperture","label":"Garanzie","type":"multiselect","options":["RCA","Furto/Incendio","Kasko","Assistenza","Tutela Legale","Cristalli","Infortuni Conducente"]},{"key":"frazionamento","label":"Frazionamento","type":"select","options":["Annuale","Semestrale"]}]'::jsonb, 10),
 ('moto','moto_rca','Moto — RC Moto','Ciclomotori e motocicli.','calcola',
   ARRAY['HD','24H','Nobis'],
   '[{"key":"coperture","label":"Garanzie","type":"multiselect","options":["RCA","Furto/Incendio","Assistenza","Tutela Legale","Infortuni Conducente"]},{"key":"frazionamento","label":"Frazionamento","type":"select","options":["Annuale"]}]'::jsonb, 20),
 ('autocarro','autocarro_rca','Autocarro — RC','Veicoli commerciali/autocarri.','calcola',
   ARRAY['HD','Groupama'],
   '[{"key":"coperture","label":"Garanzie","type":"multiselect","options":["RCA","Furto/Incendio","Kasko","Assistenza"]},{"key":"portata","label":"Portata (q.li)","type":"number"}]'::jsonb, 30),
 ('tcm','tcm_vita','TCM — Temporanea Caso Morte','Copertura vita a termine.','richiedi',
   ARRAY['HD'],
   '[{"key":"capitale","label":"Capitale assicurato (€)","type":"number","required":true},{"key":"durata","label":"Durata (anni)","type":"number","required":true},{"key":"fumatore","label":"Fumatore","type":"select","options":["No","Sì"]}]'::jsonb, 40),
 ('casa','casa_multirischio','Casa — Multirischio','Abitazione e famiglia.','richiedi',
   ARRAY['HD'],
   '[{"key":"mq","label":"Superficie (mq)","type":"number","required":true},{"key":"coperture","label":"Garanzie","type":"multiselect","options":["Incendio","Furto","RC Famiglia","Assistenza","Tutela Legale"]}]'::jsonb, 50),
 ('infortuni','infortuni_individuale','Infortuni — Individuale','Copertura infortuni della persona.','richiedi',
   ARRAY['HD'],
   '[{"key":"capitale_im","label":"Capitale Invalidità (€)","type":"number"},{"key":"professione","label":"Professione","type":"text"}]'::jsonb, 60),
 ('attivita','attivita_multirischio','Attività / Impresa','Multirischio per attività e imprese.','richiedi',
   ARRAY['HD'],
   '[{"key":"settore","label":"Settore attività","type":"text","required":true},{"key":"fatturato","label":"Fatturato annuo (€)","type":"number"}]'::jsonb, 70),
 ('vita','vita_risparmio','Vita / Risparmio','Prodotti vita e risparmio.','richiedi',
   ARRAY[]::text[],
   '[{"key":"premio_mensile","label":"Premio mensile (€)","type":"number"},{"key":"finalita","label":"Finalità","type":"select","options":["Risparmio","Previdenza","Protezione"]}]'::jsonb, 80)
on conflict (codice) do nothing;
