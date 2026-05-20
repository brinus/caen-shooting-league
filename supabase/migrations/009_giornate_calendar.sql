-- ── 009_giornate_calendar.sql ─────────────────────────────────────────────
-- Calendario esplicito delle giornate pianificate.
-- Serve per spostare/aggiungere/rimuovere giornate dal pannello admin
-- e usare quelle date nelle previsioni SISAL.

CREATE TABLE IF NOT EXISTS public.giornate (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id  TEXT NOT NULL REFERENCES public.stagioni(id) ON DELETE CASCADE,
  numero     INT  NOT NULL CHECK (numero > 0),
  data       DATE NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS giornate_season_numero_uidx
  ON public.giornate(season_id, numero);

CREATE INDEX IF NOT EXISTS giornate_season_data_idx
  ON public.giornate(season_id, data);

ALTER TABLE public.giornate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "giornate_select_all" ON public.giornate;
CREATE POLICY "giornate_select_all"
  ON public.giornate FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "giornate_write_admin" ON public.giornate;
CREATE POLICY "giornate_write_admin"
  ON public.giornate FOR ALL
  USING (public.is_admin());

DROP TRIGGER IF EXISTS giornate_set_updated_at ON public.giornate;
CREATE TRIGGER giornate_set_updated_at
  BEFORE UPDATE ON public.giornate
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();