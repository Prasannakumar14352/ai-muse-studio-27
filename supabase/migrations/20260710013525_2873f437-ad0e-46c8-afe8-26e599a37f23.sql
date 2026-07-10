ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS thumbnail_prompt text,
  ADD COLUMN IF NOT EXISTS thumbnail_generated_at timestamptz;