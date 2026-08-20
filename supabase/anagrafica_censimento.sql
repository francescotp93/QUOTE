-- ═══════════════════════════════════════════════════════════════════════════════
--  CENSIMENTO ANAGRAFICA — le colonne che mancavano
--
--  Da eseguire una volta sola nell'editor SQL di Supabase. E' scritta per poter
--  essere rilanciata senza danni: ogni pezzo e' "se non c'e' gia'".
--
--  Da dove viene: la cattura fatta sul portale Plurima il 03/08/2026 per lo step
--  "Censimento anagrafica". Rispetto a quello che quote_anagrafiche gia' teneva
--  (nome, cognome, ragione sociale, CF, P.IVA, indirizzo, PEC, recapiti) qui si
--  aggiunge solo cio' che mancava davvero.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. I campi nuovi ─────────────────────────────────────────────────────────
alter table quote_anagrafiche add column if not exists condizione_lavorativa text;

-- Tre stati, non due: null = non e' stato chiesto, true = si', false = no.
-- Un boolean con default false direbbe "no" anche a chi non ha risposto, e in
-- fattura la differenza si vede.
alter table quote_anagrafiche add column if not exists regime_forfettario boolean;

-- Codice destinatario per la fatturazione elettronica: 7 caratteri, alternativo
-- alla PEC. La colonna pec esiste gia'.
alter table quote_anagrafiche add column if not exists sdi text;

-- Dati di fatturazione: possono essere diversi da quelli del contraente (studio,
-- societa' del gruppo, commercialista). Tenuti a parte proprio per questo.
alter table quote_anagrafiche add column if not exists fatt_partita_iva  text;
alter table quote_anagrafiche add column if not exists fatt_codice_fiscale text;
alter table quote_anagrafiche add column if not exists fatt_ragione_sociale text;

-- L'indirizzo e' stato confermato da un servizio di normalizzazione (oppure
-- scelto a mano dalla cascata Provincia → Comune → CAP)? Se resta false, in
-- polizza ci finisce un indirizzo che nessuno ha verificato.
alter table quote_anagrafiche add column if not exists indirizzo_certificato boolean not null default false;

-- Codice interno del nominativo (uso di agenzia, non si mostra al cliente).
alter table quote_anagrafiche add column if not exists codice_nominativo text;

-- Quale set di dati va stampato in polizza: nome+cognome oppure ragione sociale.
-- E' una cosa diversa da `tipo` (fisica/giuridica), che dice com'e' fatto il
-- soggetto: un professionista con partita IVA e' persona fisica e puo' voler
-- stampare la ragione sociale.
alter table quote_anagrafiche add column if not exists tipologia_contraente text;

comment on column quote_anagrafiche.regime_forfettario   is 'null = non chiesto, true = si, false = no';
comment on column quote_anagrafiche.indirizzo_certificato is 'true solo se l''indirizzo e'' stato confermato dal servizio o scelto dalla cascata manuale';
comment on column quote_anagrafiche.tipologia_contraente is 'fisico | giuridico — quale set di dati si stampa in polizza (diverso da `tipo`)';

-- ── 2. Niente doppioni su codice fiscale e partita IVA ───────────────────────
--  Il criterio di accettazione n. 3 dice che cercare un soggetto gia' censito
--  deve precompilare la scheda, non creare un secondo record. La regola vive
--  qui, nella tabella: e' l'unico posto che nessuna schermata puo' scavalcare.
--
--  Indici PARZIALI: valgono solo dove il valore c'e' davvero. Le anagrafiche
--  senza CF (i lead recuperati dal preventivatore) restano legittime e non si
--  ostacolano fra loro.
--
--  Il blocco DO serve a non lasciare la migrazione a meta': se in archivio ci
--  sono gia' dei doppioni, l'indice non si crea e ti viene detto quali sono,
--  invece di far morire tutto lo script con un errore secco.
do $$
declare
  doppi text;
begin
  select string_agg(codice_fiscale, ', ') into doppi from (
    select upper(trim(codice_fiscale)) as codice_fiscale
    from quote_anagrafiche
    where codice_fiscale is not null and trim(codice_fiscale) <> ''
    group by upper(trim(codice_fiscale)) having count(*) > 1
  ) d;
  if doppi is not null then
    raise notice 'CODICI FISCALI DOPPI, unicita non applicata. Da unire a mano: %', doppi;
  else
    create unique index if not exists idx_anag_cf_unico
      on quote_anagrafiche (upper(trim(codice_fiscale)))
      where codice_fiscale is not null and trim(codice_fiscale) <> '';
  end if;
end $$;

do $$
declare
  doppi text;
begin
  select string_agg(partita_iva, ', ') into doppi from (
    select trim(partita_iva) as partita_iva
    from quote_anagrafiche
    where partita_iva is not null and trim(partita_iva) <> ''
    group by trim(partita_iva) having count(*) > 1
  ) d;
  if doppi is not null then
    raise notice 'PARTITE IVA DOPPIE, unicita non applicata. Da unire a mano: %', doppi;
  else
    create unique index if not exists idx_anag_piva_unico
      on quote_anagrafiche (trim(partita_iva))
      where partita_iva is not null and trim(partita_iva) <> '';
  end if;
end $$;

-- ── 3. Ricerca per nominativo ────────────────────────────────────────────────
--  La ricerca per nome+cognome della schermata 2.2 gira su nominativo con ilike:
--  senza questo indice, ogni ricerca legge tutta la tabella.
create index if not exists idx_anag_nominativo_lower on quote_anagrafiche (lower(nominativo));
create index if not exists idx_anag_piva on quote_anagrafiche (partita_iva);
