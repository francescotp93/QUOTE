-- ════════════════════════════════════════════════════════════════════════════
--  QUOTO · Numerazione progressiva dei preventivi (QT-AAAA-NNNN) + link cliente
--  Da eseguire UNA VOLTA nel SQL editor di Supabase.
--  Il frontend (prevNumero) usa già il formato QT-<anno>-<numero a 4 cifre>;
--  qui creiamo la colonna `numero` che oggi manca e il collegamento esplicito
--  al cliente (`cliente_id` → quote_anagrafiche).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Colonne nuove (idempotente)
ALTER TABLE quote_preventivi ADD COLUMN IF NOT EXISTS numero BIGINT;
ALTER TABLE quote_preventivi ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES quote_anagrafiche(id);

-- 2) Sequenza globale per il numero progressivo
CREATE SEQUENCE IF NOT EXISTS quote_preventivi_numero_seq;

-- 3) Backfill dei preventivi già esistenti, in ordine cronologico
WITH ord AS (
  SELECT id, row_number() OVER (ORDER BY creato_il, id) AS rn
  FROM quote_preventivi
  WHERE numero IS NULL
)
UPDATE quote_preventivi p
SET numero = ord.rn
FROM ord
WHERE p.id = ord.id;

-- 4) Posiziona la sequenza dopo l'ultimo numero assegnato
SELECT setval(
  'quote_preventivi_numero_seq',
  (SELECT COALESCE(MAX(numero), 0) FROM quote_preventivi) + 1,
  false   -- is_called=false → il prossimo nextval() restituisce esattamente questo valore
);

-- 5) Default automatico per i preventivi futuri
ALTER TABLE quote_preventivi ALTER COLUMN numero SET DEFAULT nextval('quote_preventivi_numero_seq');

-- 6) Indice per il collegamento al cliente
CREATE INDEX IF NOT EXISTS idx_prev_cliente ON quote_preventivi(cliente_id);
