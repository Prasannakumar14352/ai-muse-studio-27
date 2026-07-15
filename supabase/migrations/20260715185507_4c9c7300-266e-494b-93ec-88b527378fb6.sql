
ALTER TABLE public.landing_media
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS consent_confirmed BOOLEAN NOT NULL DEFAULT false;
