
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS preview_video_url text,
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS preview_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS alt_text text;

ALTER TABLE public.templates
  DROP CONSTRAINT IF EXISTS templates_preview_type_check;
ALTER TABLE public.templates
  ADD CONSTRAINT templates_preview_type_check
  CHECK (preview_type IN ('image', 'video'));
