-- ── 007_parlay_bets.sql ──────────────────────────────────────────────────────
-- Tabella e RPC per le scommesse multiple (schedina).
-- Ogni multipla è composta da N "gambe" (legs) tutte dello stesso pannello
-- (stagione / giornata / speciali); per vincere devono verificarsi TUTTE.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parlay_bets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season_id     TEXT NOT NULL,
  panel         TEXT NOT NULL CHECK (panel IN ('stagione','giornata','speciali')),
  legs          JSONB NOT NULL,        -- [{bet_type, player_name, quota, market_label, ...}]
  importo       INT  NOT NULL CHECK (importo >= 10),
  quota_base    NUMERIC(12,4) NOT NULL,
  bonus_mult    NUMERIC(8,4)  NOT NULL,
  quota_final   NUMERIC(12,4) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'attiva'
                  CHECK (status IN ('attiva','vinta','persa','annullata')),
  vincita_netta INT,
  giornata_date DATE,
  giornata_num  INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS parlay_bets_profile_idx ON public.parlay_bets(profile_id);
CREATE INDEX IF NOT EXISTS parlay_bets_status_idx  ON public.parlay_bets(status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.parlay_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parlay_select_self_or_admin"
  ON public.parlay_bets FOR SELECT
  USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "parlay_insert_self"
  ON public.parlay_bets FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "parlay_update_admin"
  ON public.parlay_bets FOR UPDATE
  USING (public.is_admin());

-- ── RPC: piazza multipla (atomica) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.place_parlay(
  p_season_id    TEXT,
  p_panel        TEXT,
  p_legs         JSONB,
  p_importo      INT,
  p_quota_base   NUMERIC,
  p_bonus_mult   NUMERIC,
  p_quota_final  NUMERIC,
  p_giornata_date DATE DEFAULT NULL,
  p_giornata_num  INT  DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_balance  INT;
  v_bet_id   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'Non autenticato');
  END IF;

  IF jsonb_array_length(p_legs) < 2 THEN
    RETURN json_build_object('error', 'Una multipla richiede almeno 2 selezioni');
  END IF;

  SELECT (base_coins + bet_coins) INTO v_balance
    FROM public.wallets WHERE profile_id = v_uid;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Wallet non trovato');
  END IF;

  IF v_balance < p_importo THEN
    RETURN json_build_object('error',
      'Saldo insufficiente — hai ' || v_balance || ' Bossoli');
  END IF;

  UPDATE public.wallets
     SET bet_coins = bet_coins - p_importo, updated_at = NOW()
   WHERE profile_id = v_uid;

  INSERT INTO public.parlay_bets
    (profile_id, season_id, panel, legs, importo,
     quota_base, bonus_mult, quota_final,
     giornata_date, giornata_num)
  VALUES
    (v_uid, p_season_id, p_panel, p_legs, p_importo,
     p_quota_base, p_bonus_mult, p_quota_final,
     p_giornata_date, p_giornata_num)
  RETURNING id INTO v_bet_id;

  RETURN json_build_object(
    'success',     true,
    'bet_id',      v_bet_id,
    'new_balance', v_balance - p_importo
  );
END;
$$;
