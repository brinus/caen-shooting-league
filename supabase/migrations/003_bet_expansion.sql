-- CAEN Shooting League — Espansione mercati scommesse + cancellazione
-- Eseguire via Supabase Dashboard > SQL Editor

-- ── Nuove colonne su scommesse ───────────────────────────────
ALTER TABLE public.scommesse
  ADD COLUMN IF NOT EXISTS giornata_date DATE,
  ADD COLUMN IF NOT EXISTS giornata_num  INT,
  ADD COLUMN IF NOT EXISTS market_label  TEXT;

-- ── Espandi vincolo bet_type ─────────────────────────────────
-- Rimuove il vecchio CHECK (nome autogenerato da pg)
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint pc
    JOIN pg_class t ON t.oid = pc.conrelid
    WHERE t.relname = 'scommesse'
      AND t.relnamespace = 'public'::regnamespace
      AND pc.contype = 'c'
      AND pg_get_constraintdef(pc.oid) LIKE '%bet_type%';
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.scommesse DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END $$;

ALTER TABLE public.scommesse
  ADD CONSTRAINT scommesse_bet_type_check
  CHECK (bet_type IN (
    'titolo', 'podio', 'top5', 'best_30', 'avg_18',
    'giornata_win', 'giornata_podio',
    'giornata_over_20', 'giornata_over_25', 'giornata_over_30',
    'speciale'
  ));

-- ── RPC: place_bet aggiornata con parametri opzionali ────────
CREATE OR REPLACE FUNCTION public.place_bet(
  p_season_id     TEXT,
  p_bet_type      TEXT,
  p_player_name   TEXT,
  p_importo       INT,
  p_quota         NUMERIC,
  p_giornata_date DATE    DEFAULT NULL,
  p_giornata_num  INT     DEFAULT NULL,
  p_market_label  TEXT    DEFAULT NULL
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

  INSERT INTO public.scommesse (
    profile_id, season_id, bet_type, player_name, importo, quota,
    giornata_date, giornata_num, market_label
  )
  VALUES (
    v_uid, p_season_id, p_bet_type, p_player_name, p_importo, p_quota,
    p_giornata_date, p_giornata_num, p_market_label
  )
  RETURNING id INTO v_bet_id;

  RETURN json_build_object('success', true, 'bet_id', v_bet_id,
                           'new_balance', v_balance - p_importo);
END;
$$;

-- ── RPC: cancel_bet (utente, entro 1h, prima del risultato) ──
CREATE OR REPLACE FUNCTION public.cancel_bet(
  p_bet_id UUID
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_bet           RECORD;
  v_result_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'Non autenticato');
  END IF;

  SELECT * INTO v_bet
    FROM public.scommesse
    WHERE id = p_bet_id AND profile_id = v_uid AND status = 'attiva';
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Scommessa non trovata');
  END IF;

  -- Verifica finestra 1 ora
  IF NOW() > v_bet.created_at + INTERVAL '1 hour' THEN
    RETURN json_build_object('error', 'Finestra di cancellazione scaduta (1 ora dal piazzamento)');
  END IF;

  -- Per scommesse su giornata: bloccata se esiste già un risultato per quel giocatore
  IF v_bet.giornata_date IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.risultati
      WHERE giocatore ILIKE v_bet.player_name
        AND data = v_bet.giornata_date
    ) INTO v_result_exists;
    IF v_result_exists THEN
      RETURN json_build_object('error', 'Risultato già registrato per questa giornata: scommessa non cancellabile');
    END IF;
  END IF;

  -- Rimborso importo
  UPDATE public.wallets
    SET bet_coins = bet_coins + v_bet.importo, updated_at = NOW()
    WHERE profile_id = v_uid;

  UPDATE public.scommesse
    SET status = 'annullata', vincita_netta = 0, resolved_at = NOW()
    WHERE id = p_bet_id;

  RETURN json_build_object('success', true, 'refunded', v_bet.importo);
END;
$$;
