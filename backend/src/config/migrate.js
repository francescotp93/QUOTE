/**
 * config/migrate.js
 * Crea le tabelle del DB se non esistono.
 * Eseguire con: node src/config/migrate.js
 */
import 'dotenv/config';
import { query, checkDbConnection } from './db.js';
import logger from './logger.js';

const MIGRATIONS = [

  // ── Estensione UUID ──────────────────────────────────────────────────────
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,

  // ── Enum ruoli ───────────────────────────────────────────────────────────
  `DO $$ BEGIN
     CREATE TYPE user_role AS ENUM ('admin', 'collaboratore');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,

  // ── Enum categoria veicolo ───────────────────────────────────────────────
  `DO $$ BEGIN
     CREATE TYPE vehicle_category AS ENUM ('moto', 'auto', 'ciclo', 'truck');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,

  // ── Tabella utenti ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
     id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
     name          TEXT        NOT NULL,
     email         TEXT        NOT NULL UNIQUE,
     password_hash TEXT        NOT NULL,
     role          user_role   NOT NULL DEFAULT 'collaboratore',
     active        BOOLEAN     NOT NULL DEFAULT true,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // ── Tabella sessioni / refresh token ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sessions (
     id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash TEXT        NOT NULL UNIQUE,
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ip_address TEXT,
     user_agent TEXT
   )`,

  // ── Tabella preventivi ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS quotes (
     id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id             UUID             NOT NULL REFERENCES users(id),
     vehicle_category    vehicle_category NOT NULL DEFAULT 'moto',
     provider            TEXT             NOT NULL DEFAULT '24hassistance',

     -- Input
     targa               TEXT             NOT NULL,
     data_nascita        DATE             NOT NULL,

     -- Dati veicolo (dal provider)
     veicolo_descrizione TEXT,
     veicolo_alimentazione TEXT,
     veicolo_cilindrata  TEXT,
     veicolo_anno_imm    TEXT,

     -- Bonus-malus
     cu_classe           SMALLINT,
     cu_merito           SMALLINT,
     sinistri_5anni      SMALLINT,
     scadenza_polizza    TEXT,

     -- Premio
     premio_annuo        NUMERIC(10,2),
     premio_rata         NUMERIC(10,2),
     massimale_rc        TEXT,

     -- Garanzie e metadati
     garanzie            TEXT[],
     codice_preventivo   TEXT,
     pdf_url             TEXT,
     emetti_disponibile  BOOLEAN          DEFAULT false,

     -- Stato operativo
     status              TEXT             NOT NULL DEFAULT 'success',
     error_message       TEXT,
     raw_response        JSONB,

     requested_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW()
   )`,

  // ── Tabella preventivi Infortuni (modulo QUOTO multi-prodotto) ───────────
  `CREATE TABLE IF NOT EXISTS infortuni_quotes (
     id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id           UUID        NOT NULL REFERENCES users(id),
     data_nascita      DATE        NOT NULL,
     tipologia_lavoro  TEXT        NOT NULL,
     no_sinistri_5anni BOOLEAN     NOT NULL DEFAULT true,
     status            TEXT        NOT NULL DEFAULT 'pending',
     requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // ── Tabella preventivi Tutela Legale (modulo QUOTO multi-prodotto) ───────
  `CREATE TABLE IF NOT EXISTS tutela_quotes (
     id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id       UUID        NOT NULL REFERENCES users(id),
     product       TEXT        NOT NULL,
     product_name  TEXT,
     company       TEXT,
     price         NUMERIC(10,2),
     persona_tipo  TEXT,
     anagrafica    JSONB,
     status        TEXT        NOT NULL DEFAULT 'pending',
     requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // ── Tabella credenziali provider (cifrate) ───────────────────────────────
  `CREATE TABLE IF NOT EXISTS provider_credentials (
     id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
     provider     TEXT        NOT NULL UNIQUE,
     username_enc TEXT        NOT NULL,
     password_enc TEXT        NOT NULL,
     codice_agente TEXT,
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_by   UUID        REFERENCES users(id)
   )`,

  // ── Tabella notify (email "avvisami quando attivo") ──────────────────────
  `CREATE TABLE IF NOT EXISTS notify_requests (
     id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
     email    TEXT        NOT NULL,
     category vehicle_category NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE(email, category)
   )`,

  // ── Indici ───────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_quotes_user_id       ON quotes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_quotes_requested_at  ON quotes(requested_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_quotes_targa         ON quotes(targa)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id     ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at  ON sessions(expires_at)`,

  // ── Trigger updated_at su users ──────────────────────────────────────────
  `CREATE OR REPLACE FUNCTION update_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
   $$ LANGUAGE plpgsql`,

  `DROP TRIGGER IF EXISTS users_updated_at ON users`,
  `CREATE TRIGGER users_updated_at
   BEFORE UPDATE ON users
   FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,
];

async function migrate() {
  logger.info('Avvio migrazione DB...');
  await checkDbConnection();

  for (const sql of MIGRATIONS) {
    const preview = sql.trim().substring(0, 60).replace(/\s+/g, ' ');
    try {
      await query(sql);
      logger.info(`OK: ${preview}...`);
    } catch (err) {
      logger.error(`ERRORE: ${preview}... → ${err.message}`);
      throw err;
    }
  }

  logger.info('Migrazione completata.');
  process.exit(0);
}

migrate().catch(err => {
  logger.error('Migrazione fallita:', err.message);
  process.exit(1);
});
