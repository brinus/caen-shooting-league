-- 010_add_gara_column.sql
-- Aggiunge la colonna `gara` alla tabella risultati
-- Nota: imposta DEFAULT TRUE per mantenere compatibilità con i risultati
-- inseriti dal pannello admin (che ora salva `gara = true`).
ALTER TABLE public.risultati
  ADD COLUMN IF NOT EXISTS gara BOOLEAN NOT NULL DEFAULT TRUE;

-- Se preferisci che le righe esistenti rimangano non definite e vengano
-- determinate in seguito, possiamo cambiare il default a NULL/false e
-- aggiornare selettivamente i record.
