-- ═══════════════════════════════════════════════════════════════════════════
--  IL PROGETTO PENSIONE CHE COMPILA IL CLIENTE  (12/09/2026)
--
--  Il consulente manda un link al cliente; il cliente lo apre dal telefono,
--  scrive i suoi quattro dati, vede una stima e quella stima si attacca alla
--  SUA scheda in portafoglio. Il consulente la ritrova lì, come un preventivo.
--
--  ── PERCHE' UNA TABELLA E NON UN CAMPO DENTRO L'ANALISI ───────────────────
--  Un invito non è un'analisi: nasce prima, può scadere, può essere revocato,
--  può non essere mai aperto. Tenerlo dentro `quote_analisi_previdenziali`
--  vorrebbe dire riempire quella tabella di righe vuote che analisi non sono,
--  e non poter più dire quante analisi esistono davvero.
--
--  ── CHI PUO' APRIRE IL LINK ───────────────────────────────────────────────
--  Il link da solo NON basta: chiede anche la data di nascita del cliente.
--  Un link finisce in una chat di gruppo, in un inoltro, nella cronologia di
--  un telefono prestato — e dietro c'è il nome di una persona e quanto
--  guadagna. Con due chiavi, chi non è il cliente non entra.
--
--  Una data di nascita però è indovinabile: sono poche decine di migliaia di
--  combinazioni. Per questo si contano i TENTATIVI e dopo cinque il link si
--  blocca da solo (`bloccato`), e va rifatto dal consulente. Senza quel
--  blocco la seconda chiave non sarebbe una chiave: sarebbe un rallentamento.
--
--  ── IL TOKEN NON SI SALVA ─────────────────────────────────────────────────
--  In tabella c'è solo la sua impronta SHA-256. Chi legge il database non
--  può ricostruire nessun link: l'originale esiste solo nel messaggio che il
--  cliente ha ricevuto. È la stessa ragione per cui non si salvano le
--  password in chiaro, e vale identica per un indirizzo che apre i dati di
--  una persona.
--
--  ── RLS ───────────────────────────────────────────────────────────────────
--  Accesa e SENZA policy: a questa tabella arriva solo il backend con la
--  service role. La regola di chi vede cosa sta nel codice del server
--  (filtro `creato_da`), come per i preventivi — vedi la nota in cima a
--  server/preventivi.js.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.quote_progetti_previdenziali (
  id              uuid primary key default gen_random_uuid(),

  -- a chi appartiene il progetto, e chi ha mandato il link
  anagrafica_id   uuid not null references public.quote_anagrafiche(id) on delete cascade,
  creato_da       uuid not null,
  creato_il       timestamptz not null default now(),

  -- l'invito
  token_hash      text not null unique,      -- SHA-256 del token: l'originale non si salva
  scade_il        timestamptz not null,
  revocato_il     timestamptz,

  -- la seconda chiave, e la sua difesa
  tentativi       smallint not null default 0,
  bloccato        boolean not null default false,

  -- la vita del link
  aperto_il       timestamptz,               -- prima volta che il cliente l'ha aperto
  completato_il   timestamptz,

  -- quello che il cliente ha scritto, e la stima che ha visto
  dati            jsonb,
  esito           jsonb,
  versione_motore text,

  -- l'analisi nata da qui, quando il consulente la riprende e la salva
  analisi_id      uuid references public.quote_analisi_previdenziali(id) on delete set null
);

comment on table public.quote_progetti_previdenziali is
  'Inviti al cliente a compilare da sé il proprio progetto pensione. Il token non è salvato: solo la sua impronta. Seconda chiave: la data di nascita, con blocco dopo cinque tentativi.';

create index if not exists quote_progetti_prev_anagrafica_idx
  on public.quote_progetti_previdenziali (anagrafica_id, creato_il desc);
create index if not exists quote_progetti_prev_creato_da_idx
  on public.quote_progetti_previdenziali (creato_da, creato_il desc);

alter table public.quote_progetti_previdenziali enable row level security;
