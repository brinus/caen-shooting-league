-- ── 008_guest_role.sql ───────────────────────────────────────────────────────
-- 1. Aggiunge il ruolo 'guest' al CHECK constraint su profiles.role
-- 2. Trigger per erogare 100 Bossoli ai guest ad ogni nuova data di giornata
-- 3. RPC resolve_parlay (admin) — mancante da 007
-- 4. RPC update_user_role (admin)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Aggiungi 'guest' al CHECK constraint su profiles.role ─────────────────
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint pc
    JOIN pg_class t ON t.oid = pc.conrelid
    WHERE t.relname = 'profiles'
      AND t.relnamespace = 'public'::regnamespace
      AND pc.contype = 'c'
      AND pg_get_constraintdef(pc.oid) LIKE '%role%';
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'participant', 'guest'));


-- ── 2. Trigger: eroga 100 Bossoli a tutti i guest per ogni nuova data ─────────
-- Solo per giornate reali (lunedì DOW=1, mercoledì DOW=3).
-- Recuperi e allenamenti (altri giorni) non vengono conteggiati.
CREATE OR REPLACE FUNCTION public.award_guest_coins_on_new_giornata()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_guest         RECORD;
  v_rows_inserted INT;
BEGIN
  -- Salta i recuperi: premia solo lunedì (1) e mercoledì (3)
  IF EXTRACT(DOW FROM NEW.data) NOT IN (1, 3) THEN
    RETURN NEW;
  END IF;
  FOR v_guest IN SELECT id FROM public.profiles WHERE role = 'guest' LOOP
    -- Assicura che il wallet esista
    INSERT INTO public.wallets (profile_id, base_coins)
      VALUES (v_guest.id, 0)
      ON CONFLICT (profile_id) DO NOTHING;

    -- Inserimento idempotente nel log (PRIMARY KEY = profile_id, data)
    INSERT INTO public.giornata_coins_log (profile_id, data)
      VALUES (v_guest.id, NEW.data)
      ON CONFLICT (profile_id, data) DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted = 1 THEN
      UPDATE public.wallets
        SET base_coins = base_coins + 100, updated_at = NOW()
        WHERE profile_id = v_guest.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS risultati_award_guest_coins ON public.risultati;
CREATE TRIGGER risultati_award_guest_coins
  AFTER INSERT ON public.risultati
  FOR EACH ROW EXECUTE FUNCTION public.award_guest_coins_on_new_giornata();

-- Backfill: imposta i wallet dei guest al valore corretto e popola il log.
-- Usa reset diretto (non somma incrementale) per essere idempotente
-- anche se il wallet esisteva già con un saldo errato.
DO $$
DECLARE
  v_guest  RECORD;
  v_target INT;
BEGIN
  SELECT COUNT(DISTINCT data) * 100 INTO v_target
    FROM public.risultati
    WHERE EXTRACT(DOW FROM data) IN (1, 3);  -- solo lunedì e mercoledì

  FOR v_guest IN SELECT id FROM public.profiles WHERE role = 'guest' LOOP
    -- Crea o corregge il wallet al valore esatto
    INSERT INTO public.wallets (profile_id, base_coins)
      VALUES (v_guest.id, v_target)
      ON CONFLICT (profile_id) DO UPDATE
        SET base_coins = EXCLUDED.base_coins, updated_at = NOW();

    -- Popola il log (idempotente, non aggiunge coin — quelli sono già nel wallet)
    INSERT INTO public.giornata_coins_log (profile_id, data)
      SELECT DISTINCT v_guest.id, data FROM public.risultati
      WHERE EXTRACT(DOW FROM data) IN (1, 3)  -- solo lunedì e mercoledì
      ON CONFLICT (profile_id, data) DO NOTHING;
  END LOOP;
END $$;


-- ── 3. RPC: risolve schedina multipla (solo admin) ───────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_parlay(
  p_bet_id UUID,
  p_status TEXT   -- 'vinta', 'persa', 'annullata'
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bet    RECORD;
  v_payout INT;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('error', 'Non autorizzato');
  END IF;

  SELECT * INTO v_bet
    FROM public.parlay_bets WHERE id = p_bet_id AND status = 'attiva';
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Schedina non trovata o già risolta');
  END IF;

  IF p_status = 'vinta' THEN
    v_payout := FLOOR(v_bet.importo * v_bet.quota_final);
    UPDATE public.wallets
      SET bet_coins = bet_coins + v_payout, updated_at = NOW()
      WHERE profile_id = v_bet.profile_id;
    UPDATE public.parlay_bets
      SET status = 'vinta', vincita_netta = v_payout - v_bet.importo, resolved_at = NOW()
      WHERE id = p_bet_id;

  ELSIF p_status = 'persa' THEN
    UPDATE public.parlay_bets
      SET status = 'persa', vincita_netta = -v_bet.importo, resolved_at = NOW()
      WHERE id = p_bet_id;

  ELSIF p_status = 'annullata' THEN
    UPDATE public.wallets
      SET bet_coins = bet_coins + v_bet.importo, updated_at = NOW()
      WHERE profile_id = v_bet.profile_id;
    UPDATE public.parlay_bets
      SET status = 'annullata', vincita_netta = 0, resolved_at = NOW()
      WHERE id = p_bet_id;

  ELSE
    RETURN json_build_object('error', 'Stato non valido');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;


-- ── 4. RPC: aggiorna ruolo utente (solo admin) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.update_user_role(
  p_profile_id UUID,
  p_role       TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_date DATE;
  v_rows INT;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('error', 'Non autorizzato');
  END IF;

  IF p_role NOT IN ('admin', 'participant', 'guest') THEN
    RETURN json_build_object('error', 'Ruolo non valido');
  END IF;

  -- Impedisce all'admin di modificare il proprio ruolo
  IF p_profile_id = auth.uid() THEN
    RETURN json_build_object('error', 'Non puoi modificare il tuo stesso ruolo');
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = p_profile_id;

  -- Quando si promuove a guest: imposta wallet al valore corretto e popola il log
  IF p_role = 'guest' THEN
    SELECT COUNT(DISTINCT data) * 100 INTO v_rows
      FROM public.risultati
      WHERE EXTRACT(DOW FROM data) IN (1, 3);  -- solo lunedì e mercoledì

    INSERT INTO public.wallets (profile_id, base_coins)
      VALUES (p_profile_id, v_rows)
      ON CONFLICT (profile_id) DO UPDATE
        SET base_coins = EXCLUDED.base_coins, updated_at = NOW();

    INSERT INTO public.giornata_coins_log (profile_id, data)
      SELECT DISTINCT p_profile_id, data FROM public.risultati
      WHERE EXTRACT(DOW FROM data) IN (1, 3)  -- solo lunedì e mercoledì
      ON CONFLICT (profile_id, data) DO NOTHING;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;
