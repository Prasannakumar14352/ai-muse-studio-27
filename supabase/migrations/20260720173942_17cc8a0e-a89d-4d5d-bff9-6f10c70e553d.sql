-- Post-Generation Studio: raw master + versioned narration/subtitles/exports.
-- Additive only; preserves legacy videos (no raw_master rows for older projects).

CREATE TABLE public.raw_video_outputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NULL,
  blueprint_id TEXT NULL,
  video_url TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'webm',
  duration_sec NUMERIC NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  version INTEGER NOT NULL DEFAULT 1,
  scene_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_video_outputs TO authenticated;
GRANT ALL ON public.raw_video_outputs TO service_role;
ALTER TABLE public.raw_video_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raw_video_outputs owner all" ON public.raw_video_outputs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX raw_video_outputs_user_idx ON public.raw_video_outputs(user_id, created_at DESC);
CREATE INDEX raw_video_outputs_project_idx ON public.raw_video_outputs(project_id);

CREATE TABLE public.narration_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_video_id UUID NOT NULL REFERENCES public.raw_video_outputs(id) ON DELETE CASCADE,
  label TEXT NULL,
  voice_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'lovable-tts',
  language TEXT NULL,
  style TEXT NULL,
  speed NUMERIC NOT NULL DEFAULT 1,
  pitch NUMERIC NOT NULL DEFAULT 1,
  volume NUMERIC NOT NULL DEFAULT 1,
  script JSONB NOT NULL DEFAULT '[]'::jsonb,
  audio_url TEXT NULL,
  duration_sec NUMERIC NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.narration_versions TO authenticated;
GRANT ALL ON public.narration_versions TO service_role;
ALTER TABLE public.narration_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "narration_versions owner all" ON public.narration_versions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX narration_versions_raw_idx ON public.narration_versions(raw_video_id, created_at DESC);

CREATE TABLE public.subtitle_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_video_id UUID NOT NULL REFERENCES public.raw_video_outputs(id) ON DELETE CASCADE,
  label TEXT NULL,
  style_preset TEXT NOT NULL DEFAULT 'clean-minimal',
  style JSONB NOT NULL DEFAULT '{}'::jsonb,
  cues JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subtitle_versions TO authenticated;
GRANT ALL ON public.subtitle_versions TO service_role;
ALTER TABLE public.subtitle_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subtitle_versions owner all" ON public.subtitle_versions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX subtitle_versions_raw_idx ON public.subtitle_versions(raw_video_id, created_at DESC);

CREATE TABLE public.final_video_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_video_id UUID NOT NULL REFERENCES public.raw_video_outputs(id) ON DELETE CASCADE,
  narration_version_id UUID NULL REFERENCES public.narration_versions(id) ON DELETE SET NULL,
  subtitle_version_id UUID NULL REFERENCES public.subtitle_versions(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Export',
  music JSONB NULL,
  branding JSONB NULL,
  audio_mix JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution TEXT NULL,
  format TEXT NOT NULL DEFAULT 'webm',
  video_url TEXT NULL,
  duration_sec NUMERIC NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  error TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.final_video_exports TO authenticated;
GRANT ALL ON public.final_video_exports TO service_role;
ALTER TABLE public.final_video_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "final_video_exports owner all" ON public.final_video_exports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX final_video_exports_raw_idx ON public.final_video_exports(raw_video_id, created_at DESC);
CREATE INDEX final_video_exports_user_idx ON public.final_video_exports(user_id, created_at DESC);

CREATE TRIGGER raw_video_outputs_touch BEFORE UPDATE ON public.raw_video_outputs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER narration_versions_touch BEFORE UPDATE ON public.narration_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER subtitle_versions_touch BEFORE UPDATE ON public.subtitle_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER final_video_exports_touch BEFORE UPDATE ON public.final_video_exports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();