-- CAEN Shooting League — Bossoli (moneta virtuale) + Sistema Scommesse
-- Eseguire via Supabase Dashboard > SQL Editor

-- ── Wallets ──────────────────────────────────────────────────
-- base_coins = guadagnati dalle giornate (N_giornate × 100)
-- bet_coins  = netto scommesse (negativo se in perdita)
-- saldo visibile = base_coins + bet_coins
CREATE TABLE IF NOT EXISTS public.wallets (
  profile_id   UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  base_coins   INT NOT NULL DEFAULT 0,
  bet_coins    INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Scommesse ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scommesse (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season_id     TEXT NOT NULL,
  bet_type      TEXT NOT NULL
                  CHECK (bet_type IN ('titolo','podio','top5','best_30','avg_18')),
  player_name   TEXT NOT NULL,
  importo       INT NOT NULL CHECK (importo >= 10),
  quota         NUMERIC(6,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'attiva'
                  CHECK (status IN ('attiva','vinta','persa','annullata')),
  vincita_netta INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scommesse_profile_idx ON public.scommesse(profile_id);
CREATE INDEX IF NOT EXISTS scommesse_season_idx  ON public.scommesse(season_id);
CREATE INDEX IF NOT EXISTS scommesse_status_idx  ON public.scommesse(status);

-- ── Trigger: crea wallet automaticamente ad ogni profilo ─────
-- Calcola retroattivamente i coin dalle giornate già giocate.
CREATE OR REPLACE FUNCTION public.handle_new_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_giornate INT := 0;
BEGIN
  IF NEW.player_name IS NOT NULL THEN
    SELECT COUNT(*) INTO v_giornate
      FROM public.risultati WHERE giocatore ILIKE NEW.player_name;
  END IF;

  INSERT INTO public.wallets (profile_id, base_coins)
    VALUES (NEW.id, v_giornate * 100)
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_wallet ON public.profiles;
CREATE TRIGGER on_profile_created_wallet
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_wallet();

-- ── RPC: piazza scommessa (atomica, lato server) ─────────────
CREATE OR REPLACE FUNCTION public.place_bet(
  p_season_id   TEXT,
  p_bet_type    TEXT,
  p_player_name TEXT,
  p_importo     INT,
  p_quota       NUMERIC
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_balance   INT;
  v_bet_id    UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'Non autenticato');
  END IF;

  SELECT (base_coins + bet_coins) INTO v_balance
    FROM public.wallets WHERE profile_id = v_uid;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Wallet non trovato');
  END IF;
  IF v_balance < p_importo THEN
    RETURN json_build_object('error', 'Saldo insufficiente — hai ' || v_balance || ' Bossoli');
  END IF;

  UPDATE public.wallets
    SET bet_coins = bet_coins - p_importo, updated_at = NOW()
    WHERE profile_id = v_uid;

  INSERT INTO public.scommesse (profile_id, season_id, bet_type, player_name, importo, quota)
    VALUES (v_uid, p_season_id, p_bet_type, p_player_name, p_importo, p_quota)
    RETURNING id INTO v_bet_id;

  RETURN json_build_object('success', true, 'bet_id', v_bet_id,
                           'new_balance', v_balance - p_importo);
END;
$$;

-- ── RPC: risolve scommessa (solo admin) ──────────────────────
CREATE OR REPLACE FUNCTION public.resolve_bet(
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

  SELECT * INTO v_bet FROM public.scommesse WHERE id = p_bet_id AND status = 'attiva';
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Scommessa non trovata o già risolta');
  END IF;

  IF p_status = 'vinta' THEN
    v_payout := FLOOR(v_bet.importo * v_bet.quota);
    UPDATE public.wallets
      SET bet_coins = bet_coins + v_payout, updated_at = NOW()
      WHERE profile_id = v_bet.profile_id;
    UPDATE public.scommesse
      SET status = 'vinta', vincita_netta = v_payout - v_bet.importo,
          resolved_at = NOW()
      WHERE id = p_bet_id;

  ELSIF p_status = 'persa' THEN
    UPDATE public.scommesse
      SET status = 'persa', vincita_netta = -v_bet.importo, resolved_at = NOW()
      WHERE id = p_bet_id;

  ELSIF p_status = 'annullata' THEN
    -- Rimborso importo intero
    UPDATE public.wallets
      SET bet_coins = bet_coins + v_bet.importo, updated_at = NOW()
      WHERE profile_id = v_bet.profile_id;
    UPDATE public.scommesse
      SET status = 'annullata', vincita_netta = 0, resolved_at = NOW()
      WHERE id = p_bet_id;

  ELSE
    RETURN json_build_object('error', 'Stato non valido');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- ── RPC: sincronizza wallets retroattivamente da risultati ───
-- Usa base_coins = giornate_giocate × 100 (non azzera i bet_coins)
CREATE OR REPLACE FUNCTION public.sync_all_wallets()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rec      RECORD;
  v_giornate INT;
  v_updated  INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('error', 'Non autorizzato');
  END IF;

  FOR v_rec IN
    SELECT id, player_name FROM public.profiles WHERE player_name IS NOT NULL
  LOOP
    SELECT COUNT(*) INTO v_giornate
      FROM public.risultati WHERE giocatore ILIKE v_rec.player_name;

    INSERT INTO public.wallets (profile_id, base_coins)
      VALUES (v_rec.id, v_giornate * 100)
      ON CONFLICT (profile_id) DO UPDATE
        SET base_coins = EXCLUDED.base_coins, updated_at = NOW();

    v_updated := v_updated + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'profiles_updated', v_updated);
END;
$$;

-- ── Trigger: premia automaticamente nuovi risultati ──────────
CREATE OR REPLACE FUNCTION public.award_coins_on_result()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id
    FROM public.profiles WHERE player_name ILIKE NEW.giocatore LIMIT 1;
  IF v_profile_id IS NOT NULL THEN
    UPDATE public.wallets
      SET base_coins = base_coins + 100, updated_at = NOW()
      WHERE profile_id = v_profile_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS risultati_award_coins ON public.risultati;
-- Attivo: premia +100 Bossoli ad ogni nuovo risultato inserito.
CREATE TRIGGER risultati_award_coins
  AFTER INSERT ON public.risultati
  FOR EACH ROW EXECUTE FUNCTION public.award_coins_on_result();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.wallets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scommesse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets_select_self_or_admin"
  ON public.wallets FOR SELECT
  USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "wallets_insert_trigger"
  ON public.wallets FOR INSERT
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "scommesse_select_self_or_admin"
  ON public.scommesse FOR SELECT
  USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "scommesse_insert_self"
  ON public.scommesse FOR INSERT
  WITH CHECK (profile_id = auth.uid());
