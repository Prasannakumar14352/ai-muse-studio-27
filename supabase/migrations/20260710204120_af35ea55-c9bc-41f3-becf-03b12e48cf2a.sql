
-- === Extend projects ===
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS aspect_ratio text,
  ADD COLUMN IF NOT EXISTS duration_sec integer,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS cta text,
  ADD COLUMN IF NOT EXISTS output_url text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- === characters ===
CREATE TABLE IF NOT EXISTS public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  character_type text,
  character_lock jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_image_url text,
  seed text,
  style text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "characters owner all" ON public.characters FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_characters_updated_at BEFORE UPDATE ON public.characters
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- === brand_kits ===
CREATE TABLE IF NOT EXISTS public.brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name text NOT NULL,
  instagram_handle text,
  logo_url text,
  website text,
  primary_color text,
  palette jsonb NOT NULL DEFAULT '{}'::jsonb,
  heading_font text,
  body_font text,
  tone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_kits TO authenticated;
GRANT ALL ON public.brand_kits TO service_role;
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_kits owner all" ON public.brand_kits FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_brand_kits_updated_at BEFORE UPDATE ON public.brand_kits
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- === project_scenes ===
CREATE TABLE IF NOT EXISTS public.project_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_number integer NOT NULL,
  start_time numeric,
  end_time numeric,
  duration numeric,
  dialogue text,
  narration text,
  on_screen_text text,
  image_prompt text,
  negative_prompt text,
  motion_prompt text,
  image_url text,
  video_url text,
  audio_url text,
  caption_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  transition text,
  sound_effect text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scene_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_scenes TO authenticated;
GRANT ALL ON public.project_scenes TO service_role;
ALTER TABLE public.project_scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_scenes owner all" ON public.project_scenes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_project_scenes_updated_at BEFORE UPDATE ON public.project_scenes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- === carousel_slides ===
CREATE TABLE IF NOT EXISTS public.carousel_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slide_number integer NOT NULL,
  slide_type text,
  background_type text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  styles jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  html text,
  export_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, slide_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carousel_slides TO authenticated;
GRANT ALL ON public.carousel_slides TO service_role;
ALTER TABLE public.carousel_slides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carousel_slides owner all" ON public.carousel_slides FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_carousel_slides_updated_at BEFORE UPDATE ON public.carousel_slides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- === render_jobs ===
CREATE TABLE IF NOT EXISTS public.render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  provider text,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  current_step text,
  output_url text,
  error_code text,
  safe_error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_jobs TO authenticated;
GRANT ALL ON public.render_jobs TO service_role;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "render_jobs owner all" ON public.render_jobs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_render_jobs_updated_at BEFORE UPDATE ON public.render_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- === generated_assets ===
CREATE TABLE IF NOT EXISTS public.generated_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id uuid REFERENCES public.project_scenes(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  provider text,
  url text,
  storage_path text,
  prompt text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_assets TO authenticated;
GRANT ALL ON public.generated_assets TO service_role;
ALTER TABLE public.generated_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "generated_assets owner all" ON public.generated_assets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_project_scenes_project ON public.project_scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_carousel_slides_project ON public.carousel_slides(project_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_project ON public.render_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_project ON public.generated_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_content_type ON public.projects(user_id, content_type);
