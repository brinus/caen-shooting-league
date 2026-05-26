-- 009_add_recupero_data_effettiva.sql
-- Aggiunge le colonne `recupero` e `data_effettiva` alla tabella risultati
ALTER TABLE public.risultati
  ADD COLUMN IF NOT EXISTS recupero BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS data_effettiva DATE;

-- Aggiorna eventuali VIEW o trigger che dovessero basarsi sulla struttura
-- (nessuna modifica qui, ma tenere presente per future estensioni)
