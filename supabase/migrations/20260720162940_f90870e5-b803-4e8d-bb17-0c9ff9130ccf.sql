
-- 1. Extend characters
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS voice_id text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS age_range text,
  ADD COLUMN IF NOT EXISTS outfit text,
  ADD COLUMN IF NOT EXISTS description text;

-- 2. dialogue_lines
CREATE TABLE IF NOT EXISTS public.dialogue_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id text,
  speaker_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  speaker_name text,
  speech_type text NOT NULL DEFAULT 'narration', -- narration | dialogue | thought | vo
  text text NOT NULL DEFAULT '',
  emotion text DEFAULT 'neutral',
  voice_id text,
  language text,
  start_time numeric,
  end_time numeric,
  lip_sync_required boolean NOT NULL DEFAULT false,
  audio_url text,
  status text NOT NULL DEFAULT 'pending', -- pending | voice_ready | lip_sync_processing | lip_sync_complete | failed
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dialogue_lines TO authenticated;
GRANT ALL ON public.dialogue_lines TO service_role;
ALTER TABLE public.dialogue_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialogue_lines owner all" ON public.dialogue_lines
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_lines_project ON public.dialogue_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_lines_user ON public.dialogue_lines(user_id);
CREATE TRIGGER trg_dialogue_lines_updated_at BEFORE UPDATE ON public.dialogue_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. lip_sync_jobs
CREATE TABLE IF NOT EXISTS public.lip_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  dialogue_line_id uuid REFERENCES public.dialogue_lines(id) ON DELETE CASCADE,
  character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'mock',
  mode text NOT NULL DEFAULT 'mock', -- mock | production
  status text NOT NULL DEFAULT 'pending', -- pending | processing | complete | failed
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_url text,
  duration_sec numeric,
  error text,
  credits_charged integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lip_sync_jobs TO authenticated;
GRANT ALL ON public.lip_sync_jobs TO service_role;
ALTER TABLE public.lip_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lip_sync_jobs owner all" ON public.lip_sync_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_lip_sync_jobs_project ON public.lip_sync_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_lip_sync_jobs_dialogue ON public.lip_sync_jobs(dialogue_line_id);
CREATE TRIGGER trg_lip_sync_jobs_updated_at BEFORE UPDATE ON public.lip_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4. provider_status
CREATE TABLE IF NOT EXISTS public.provider_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL, -- lipsync | voice | face_detection
  provider text NOT NULL,
  available boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'mock',
  supported_languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  max_duration_sec integer,
  notes text,
  last_checked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, provider)
);

GRANT SELECT ON public.provider_status TO authenticated;
GRANT ALL ON public.provider_status TO service_role;
ALTER TABLE public.provider_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provider_status read all signed in" ON public.provider_status
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "provider_status admin write" ON public.provider_status
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_provider_status_updated_at BEFORE UPDATE ON public.provider_status
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed the mock lip-sync provider so the UI has something to show.
INSERT INTO public.provider_status (kind, provider, available, mode, supported_languages, max_duration_sec, notes, last_checked_at)
VALUES
  ('lipsync', 'mock', true, 'mock', ARRAY['en','hi','te','ta','kn','ml','mr','bn'], 60, 'Development mock — labels output as Mock Preview. No real lip-sync.', now()),
  ('lipsync', 'sync_so', false, 'production', ARRAY['en','hi'], 60, 'Not configured. Add SYNC_API_KEY to enable.', now())
ON CONFLICT (kind, provider) DO NOTHING;
