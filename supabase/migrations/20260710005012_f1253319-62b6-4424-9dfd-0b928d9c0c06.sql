
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'long',
  ADD COLUMN IF NOT EXISTS distribution jsonb,
  ADD COLUMN IF NOT EXISTS quality_report jsonb;
