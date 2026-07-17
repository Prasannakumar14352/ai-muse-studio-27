
-- Phase A: shared generation jobs + feature readiness tracking

-- 1) generation_jobs: unified job record for every AI module
CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  module_type TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','validating','processing','rendering','uploading','completed','failed','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step TEXT,
  provider TEXT,
  provider_job_id TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  credits_reserved INTEGER NOT NULL DEFAULT 0,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  ledger_id UUID,
  idempotency_key TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON public.generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_project_id ON public.generation_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON public.generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_created_at ON public.generation_jobs(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_generation_jobs_user_idem ON public.generation_jobs(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.generation_jobs TO authenticated;
GRANT ALL ON public.generation_jobs TO service_role;

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_jobs' AND policyname='jobs_owner_select') THEN
    CREATE POLICY jobs_owner_select ON public.generation_jobs FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_jobs' AND policyname='jobs_owner_insert') THEN
    CREATE POLICY jobs_owner_insert ON public.generation_jobs FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_jobs' AND policyname='jobs_owner_update') THEN
    CREATE POLICY jobs_owner_update ON public.generation_jobs FOR UPDATE
      TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_generation_jobs_updated_at ON public.generation_jobs;
CREATE TRIGGER trg_generation_jobs_updated_at BEFORE UPDATE ON public.generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Link credit ledger rows to jobs so polling never double-charges
ALTER TABLE public.credit_ledger ADD COLUMN IF NOT EXISTS job_id UUID
  REFERENCES public.generation_jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_credit_ledger_job_id ON public.credit_ledger(job_id);

-- 3) feature_readiness: source of truth for landing comparison + admin dashboard
CREATE TABLE IF NOT EXISTS public.feature_readiness (
  feature_id TEXT NOT NULL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'beta'
    CHECK (status IN ('available','beta','coming_soon','not_available')),
  ui_implemented BOOLEAN NOT NULL DEFAULT false,
  backend_implemented BOOLEAN NOT NULL DEFAULT false,
  provider_configured BOOLEAN NOT NULL DEFAULT false,
  generation_tested BOOLEAN NOT NULL DEFAULT false,
  credits_tested BOOLEAN NOT NULL DEFAULT false,
  preview_tested BOOLEAN NOT NULL DEFAULT false,
  download_tested BOOLEAN NOT NULL DEFAULT false,
  persistence_tested BOOLEAN NOT NULL DEFAULT false,
  retry_tested BOOLEAN NOT NULL DEFAULT false,
  no_production_mocks BOOLEAN NOT NULL DEFAULT false,
  blockers TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.feature_readiness TO authenticated, anon;
GRANT ALL ON public.feature_readiness TO service_role;

ALTER TABLE public.feature_readiness ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='feature_readiness' AND policyname='readiness_public_read') THEN
    CREATE POLICY readiness_public_read ON public.feature_readiness FOR SELECT
      TO anon, authenticated USING (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_feature_readiness_updated_at ON public.feature_readiness;
CREATE TRIGGER trg_feature_readiness_updated_at BEFORE UPDATE ON public.feature_readiness
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed feature rows (conservative defaults; app updates via runReadinessCheck)
INSERT INTO public.feature_readiness (feature_id, status, ui_implemented, backend_implemented, provider_configured, no_production_mocks, blockers, notes)
VALUES
  ('seo_package',    'beta', true,  true,  true,  true,  '{}',                                                'Structured multi-section generator, no fake SEO metrics.'),
  ('image_editing',  'beta', true,  true,  true,  true,  '{}',                                                'Browser edits + Gemini generative edits via LOVABLE_API_KEY.'),
  ('voiceover',      'beta', true,  false, false, true,  '{"No production TTS provider configured"}',        'Awaiting ElevenLabs/OpenAI TTS key.'),
  ('ai_video',       'beta', true,  false, false, true,  '{"No production video-render provider configured"}','Awaiting hosted render worker (Shotstack/Remotion Lambda).'),
  ('short_video',    'beta', true,  false, false, true,  '{"No production video-render provider configured"}','Same blocker as ai_video.'),
  ('long_video',     'beta', true,  false, false, true,  '{"No production video-render provider configured"}','Same blocker as ai_video.')
ON CONFLICT (feature_id) DO NOTHING;
