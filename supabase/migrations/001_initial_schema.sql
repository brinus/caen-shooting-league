-- CAEN Shooting League — Initial Schema
-- Eseguire una volta via Supabase Dashboard > SQL Editor

-- ── Profiles ──────────────────────────────────────────────────
-- Estende auth.users con dati specifici CSL
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'participant'
                 CHECK (role IN ('admin', 'participant')),
  player_name  TEXT,   -- nome usato nei risultati (può differire da display_name)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: crea riga profiles al signup (senza dati aggiuntivi ancora)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- username e display_name vengono passati come metadata
  INSERT INTO public.profiles (id, username, display_name, role, player_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'username'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'participant'),
    NEW.raw_user_meta_data->>'player_name'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── Stagioni ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stagioni (
  id           TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,
  numero       INT  NOT NULL,
  anno         INT  NOT NULL,
  inizio       DATE NOT NULL,
  fine         DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'prossima'
                 CHECK (status IN ('attiva', 'conclusa', 'prossima')),
  max_recuperi INT  NOT NULL DEFAULT 4
);


-- ── Risultati ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.risultati (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stagione_id  TEXT NOT NULL REFERENCES public.stagioni(id) ON DELETE CASCADE,
  data         DATE NOT NULL,
  giocatore    TEXT NOT NULL,
  iniziali     TEXT NOT NULL,
  t1           INT  NOT NULL DEFAULT -1,
  t2           INT  NOT NULL DEFAULT -1,
  t3           INT  NOT NULL DEFAULT -1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS risultati_stagione_idx ON public.risultati(stagione_id);
CREATE INDEX IF NOT EXISTS risultati_data_idx     ON public.risultati(data);
CREATE INDEX IF NOT EXISTS risultati_giocatore_idx ON public.risultati(giocatore);


-- ── Posts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  titolo     TEXT NOT NULL,
  data       DATE NOT NULL,
  autore     TEXT,
  tags       TEXT[] NOT NULL DEFAULT '{}',
  excerpt    TEXT,
  content    TEXT,
  published  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS posts_data_idx ON public.posts(data DESC);
CREATE INDEX IF NOT EXISTS posts_slug_idx ON public.posts(slug);

-- Trigger aggiorna updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_set_updated_at ON public.posts;
CREATE TRIGGER posts_set_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── Regolamento ───────────────────────────────────────────────
-- Tabella con un'unica riga (id = 1)
CREATE TABLE IF NOT EXISTS public.regolamento (
  id         INT PRIMARY KEY DEFAULT 1,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Assicura che esista sempre esattamente una riga
INSERT INTO public.regolamento (id, content)
  VALUES (1, '')
  ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS regolamento_set_updated_at ON public.regolamento;
CREATE TRIGGER regolamento_set_updated_at
  BEFORE UPDATE ON public.regolamento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stagioni    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risultati   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regolamento ENABLE ROW LEVEL SECURITY;

-- Helper: controlla se l'utente corrente è admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- profiles: tutti possono leggere, solo self o admin possono modificare
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT USING (TRUE);

CREATE POLICY "profiles_insert_admin"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin() OR auth.uid() = id);

CREATE POLICY "profiles_update_self_or_admin"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- stagioni: tutti leggono, solo admin scrivono
CREATE POLICY "stagioni_select_all"   ON public.stagioni FOR SELECT USING (TRUE);
CREATE POLICY "stagioni_write_admin"  ON public.stagioni FOR ALL USING (public.is_admin());

-- risultati: tutti leggono (anche anonimi), solo admin scrivono
CREATE POLICY "risultati_select_all"  ON public.risultati FOR SELECT USING (TRUE);
CREATE POLICY "risultati_write_admin" ON public.risultati FOR ALL USING (public.is_admin());

-- posts: tutti leggono i pubblicati; admin vede e gestisce tutto
CREATE POLICY "posts_select_published"
  ON public.posts FOR SELECT
  USING (published = TRUE OR public.is_admin());

CREATE POLICY "posts_write_admin"
  ON public.posts FOR ALL USING (public.is_admin());

-- regolamento: tutti leggono, solo admin modificano
CREATE POLICY "regolamento_select_all"  ON public.regolamento FOR SELECT USING (TRUE);
CREATE POLICY "regolamento_write_admin" ON public.regolamento FOR ALL USING (public.is_admin());
