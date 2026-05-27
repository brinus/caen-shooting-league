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

DROP POLICY IF EXISTS "parlay_select_self_or_admin" ON public.parlay_bets;
DROP POLICY IF EXISTS "parlay_insert_self"           ON public.parlay_bets;
DROP POLICY IF EXISTS "parlay_update_admin"          ON public.parlay_bets;

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
  v_now      TIMESTAMPTZ := NOW();
  v_cut_start TIMESTAMPTZ;
  v_cut_end   TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'Non autenticato');
  END IF;

  IF jsonb_array_length(p_legs) < 2 THEN
    RETURN json_build_object('error', 'Una multipla richiede almeno 2 selezioni');
  END IF;

  -- Per schedine su giornata: blocco piazzamento tra 12:00 e 20:00 del giorno indicato
  IF p_giornata_date IS NOT NULL THEN
    v_cut_start := (p_giornata_date::timestamp AT TIME ZONE 'localtime') + INTERVAL '12 hours';
    v_cut_end   := (p_giornata_date::timestamp AT TIME ZONE 'localtime') + INTERVAL '20 hours';
    IF v_now >= v_cut_start AND v_now < v_cut_end THEN
      RETURN json_build_object('error', 'Giornata iniziata, non si accettano più scommesse dalle 12:00 alle 20:00');
    END IF;
    IF EXISTS (SELECT 1 FROM public.risultati WHERE data = p_giornata_date) THEN
      RETURN json_build_object('error', 'Risultato già registrato per questa giornata: non si accettano scommesse');
    END IF;
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

-- ── RPC: cancella multipla (utente, entro 1h) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_parlay(
  p_bet_id UUID
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_bet  RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'Non autenticato');
  END IF;

  SELECT * INTO v_bet
    FROM public.parlay_bets
    WHERE id = p_bet_id AND profile_id = v_uid AND status = 'attiva';
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Schedina non trovata');
  END IF;

  -- Finestra di 1 ora
  IF NOW() > v_bet.created_at + INTERVAL '1 hour' THEN
    RETURN json_build_object('error', 'Finestra di cancellazione scaduta (1 ora dal piazzamento)');
  END IF;

  -- Per schedine su giornata: bloccata se esiste già un risultato
  IF v_bet.giornata_date IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.risultati WHERE data = v_bet.giornata_date
    ) THEN
      RETURN json_build_object('error', 'Risultato già registrato per questa giornata: schedina non cancellabile');
    END IF;
  END IF;

  -- Rimborso
  UPDATE public.wallets
    SET bet_coins = bet_coins + v_bet.importo, updated_at = NOW()
    WHERE profile_id = v_uid;

  UPDATE public.parlay_bets
    SET status = 'annullata', vincita_netta = 0, resolved_at = NOW()
    WHERE id = p_bet_id;

  RETURN json_build_object('success', true, 'refunded', v_bet.importo);
END;
$$;
