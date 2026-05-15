-- ── 005_risultati_upsert_fix.sql ─────────────────────────────────────────────
-- Aggiunge un vincolo UNIQUE su (stagione_id, data, giocatore) alla tabella
-- risultati, necessario per l'UPSERT dell'import script.
-- Inoltre aggiorna il trigger award_coins_on_result con una guardia contro
-- eventuali doppi inserimenti manuali.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Vincolo UNIQUE per abilitare ON CONFLICT sull'UPSERT
--    (se esistono righe duplicate dalla vecchia logica delete+insert, questa
--    istruzione fallirà: eseguire prima il blocco di deduplicazione commentato
--    in fondo a questo file)
ALTER TABLE public.risultati
  ADD CONSTRAINT risultati_stagione_data_giocatore_unique
  UNIQUE (stagione_id, data, giocatore);


-- 2. Trigger aggiornato: eroga monete solo se è la PRIMA volta che questo
--    giocatore compare per questa data (COUNT = 1 significa riga appena
--    inserita, nessun duplicato preesistente).
--    Questo è una garanzia difensiva; con l'UPSERT dell'import il trigger
--    non si attiva affatto per righe già esistenti.
CREATE OR REPLACE FUNCTION public.award_coins_on_result()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id UUID;
  v_existing   INT;
BEGIN
  -- Conta quante righe esistono per questo giocatore+data DOPO l'insert.
  -- Se è 1, questa è la prima volta → erogare monete.
  -- Se è > 1 (duplicato inaspettato nonostante il vincolo), non fare nulla.
  SELECT COUNT(*) INTO v_existing
    FROM public.risultati
   WHERE giocatore = NEW.giocatore
     AND data      = NEW.data;

  IF v_existing <> 1 THEN
    RETURN NEW;  -- già esisteva una riga per questo giocatore+data, skip
  END IF;

  SELECT id INTO v_profile_id
    FROM public.profiles
   WHERE player_name ILIKE NEW.giocatore
   LIMIT 1;

  IF v_profile_id IS NOT NULL THEN
    UPDATE public.wallets
       SET base_coins = base_coins + 100,
           updated_at = NOW()
     WHERE profile_id = v_profile_id;
  END IF;

  RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCCO DI DEDUPLICAZIONE (da eseguire SOLO se il passo 1 fallisce per
-- duplicate key, cosa improbabile dato che lo script ha sempre fatto
-- delete+insert per stagione):
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FROM public.risultati r
--  WHERE r.id NOT IN (
--    SELECT DISTINCT ON (stagione_id, data, giocatore) id
--      FROM public.risultati
--     ORDER BY stagione_id, data, giocatore, created_at
--  );
-- ─────────────────────────────────────────────────────────────────────────────
