-- CAEN Shooting League — Sondaggi nei post
-- Eseguire via Supabase Dashboard > SQL Editor

-- ── Tabelle ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.polls (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  question   TEXT        NOT NULL CHECK (length(question) BETWEEN 3 AND 300),
  closes_at  TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poll_choices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  text       TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 200),
  sort_order INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Un voto per utente per sondaggio; ON CONFLICT aggiorna la scelta (cambia voto)
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  choice_id  UUID NOT NULL REFERENCES public.poll_choices(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (poll_id, user_id)
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.polls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes   ENABLE ROW LEVEL SECURITY;

-- polls: tutti leggono; solo admin crea/modifica/elimina
CREATE POLICY "polls_select_all" ON public.polls FOR SELECT USING (true);
CREATE POLICY "polls_admin_all"  ON public.polls FOR ALL   USING (public.is_admin());

-- choices: tutti leggono; solo admin scrive
CREATE POLICY "poll_choices_select_all" ON public.poll_choices FOR SELECT USING (true);
CREATE POLICY "poll_choices_admin_all"  ON public.poll_choices FOR ALL   USING (public.is_admin());

-- votes: tutti leggono; autenticati inseriscono/eliminano il proprio voto
CREATE POLICY "poll_votes_select_all"  ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "poll_votes_own_insert"  ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "poll_votes_own_delete"  ON public.poll_votes FOR DELETE USING (auth.uid() = user_id);

-- ── RPC: cast_vote ───────────────────────────────────────────
-- Vota o cambia voto in modo atomico
CREATE OR REPLACE FUNCTION public.cast_vote(
  p_poll_id   UUID,
  p_choice_id UUID
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'Non autenticato');
  END IF;

  -- La scelta deve appartenere al sondaggio
  IF NOT EXISTS (
    SELECT 1 FROM public.poll_choices
    WHERE id = p_choice_id AND poll_id = p_poll_id
  ) THEN
    RETURN json_build_object('error', 'Scelta non valida');
  END IF;

  -- Il sondaggio non deve essere chiuso
  IF EXISTS (
    SELECT 1 FROM public.polls
    WHERE id = p_poll_id AND closes_at IS NOT NULL AND closes_at < NOW()
  ) THEN
    RETURN json_build_object('error', 'Sondaggio chiuso');
  END IF;

  -- Upsert: inserisce o aggiorna la scelta se già votato
  INSERT INTO public.poll_votes (poll_id, choice_id, user_id)
    VALUES (p_poll_id, p_choice_id, v_uid)
  ON CONFLICT (poll_id, user_id)
    DO UPDATE SET choice_id = p_choice_id, created_at = NOW();

  RETURN json_build_object('success', true);
END;
$$;
