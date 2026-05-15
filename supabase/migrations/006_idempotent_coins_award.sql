-- ── 006_idempotent_coins_award.sql ───────────────────────────────────────────
-- Risolve definitivamente il problema dei +100 Bossoli spuri.
--
-- PROBLEMA: il trigger award_coins_on_result scatta su ogni INSERT in risultati,
-- anche per re-import o aggiornamenti retroattivi, gonfiando i wallet.
--
-- SOLUZIONE:
--   1. Tabella giornata_coins_log: traccia ogni (giocatore, data) già premiata.
--   2. Trigger aggiornato: tenta INSERT nel log; se la riga esiste già (ON CONFLICT
--      DO NOTHING) non aggiorna il wallet → completamente idempotente.
--   3. Backfill del log dalle giornate già in risultati.
--   4. Reset di tutti i base_coins al valore corretto (N_giornate_distinte × 100).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Tabella di tracciamento premi ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.giornata_coins_log (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data       DATE NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, data)
);


-- ── 2. Trigger idempotente ───────────────────────────────────────────────────
-- Eroga +100 solo la PRIMA volta che un profilo appare per una certa data.
-- Re-import, upsert, o inserimenti duplicati non cambiano nulla.
CREATE OR REPLACE FUNCTION public.award_coins_on_result()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id   UUID;
  v_rows_inserted INT;
BEGIN
  -- Trova il profilo corrispondente al giocatore
  SELECT id INTO v_profile_id
    FROM public.profiles
   WHERE player_name ILIKE NEW.giocatore
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN NEW;  -- nessun profilo registrato per questo giocatore
  END IF;

  -- Prova a inserire il log; se (profile_id, data) esiste già → DO NOTHING
  INSERT INTO public.giornata_coins_log (profile_id, data)
    VALUES (v_profile_id, NEW.data)
    ON CONFLICT (profile_id, data) DO NOTHING;

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  -- Premia solo se la riga del log è stata effettivamente inserita (prima volta)
  IF v_rows_inserted = 1 THEN
    UPDATE public.wallets
       SET base_coins = base_coins + 100,
           updated_at = NOW()
     WHERE profile_id = v_profile_id;
  END IF;

  RETURN NEW;
END;
$$;


-- ── 3. Backfill del log ───────────────────────────────────────────────────────
-- Popola giornata_coins_log con tutte le combinazioni (profilo, data) già
-- presenti in risultati. Usa DISTINCT per gestire giornate con più serie.
INSERT INTO public.giornata_coins_log (profile_id, data)
SELECT DISTINCT p.id, r.data
  FROM public.risultati r
  JOIN public.profiles p ON p.player_name ILIKE r.giocatore
ON CONFLICT (profile_id, data) DO NOTHING;


-- ── 4. Reset wallet a valore corretto ────────────────────────────────────────
-- base_coins = numero di giornate distinte giocate × 100
-- (basato sul log appena backfillato, che rispecchia le giornate reali)
UPDATE public.wallets w
   SET base_coins = (
         SELECT COUNT(*) * 100
           FROM public.giornata_coins_log
          WHERE profile_id = w.profile_id
       ),
       updated_at = NOW();
